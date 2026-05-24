// routes/agent.js — AI agent that plans driver actions for a given goal.
//
// POST /api/agent/plan
//   body: { goal, snapshot, drivers, profile?, hostname? }
//   returns: { actions: [{name, args, reasoning?}, ...], rawResponse, model, durationMs }
//
// POST /api/agent/trace
//   body: { goal, plan, results, snapshotBefore, snapshotAfter, profileId? }
//   returns: { traceId } — persisted for replay + training data
//
// Architecture:
//   - Hub receives goal + page snapshot + driver schemas + profile from popup
//   - Converts driver schemas to OpenAI tool format
//   - Calls Groq function-calling with system prompt
//   - Returns proposed action list (NOT executed — extension executes after operator approves)
//
// Trust boundary: this endpoint NEVER calls drivers itself. Only proposes actions.
// Execution + side effects happen in the browser, mediated by operator approval.

import express from 'express';
import { authMiddleware } from '../auth.js';
import { pool } from '../db.js';

const router = express.Router();
router.use(authMiddleware);

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_AGENT_MODEL || 'llama-3.3-70b-versatile';

function buildSystemPrompt(profile, hostname, formContext) {
  // Strip metadata that aren't form values (id, timestamps, relationship, etc.)
  // These leaked into past plans as values being typed (e.g. Aadhaar got the
  // profile UUID instead of the aadhaar_number).
  const META_KEYS = new Set([
    'id', 'displayLabel', 'displayName', 'relationship', 'createdAt',
    'updatedAt', 'workspaceId', 'createdBy', 'updatedBy', 'documentId',
    'confirmedAt', 'confirmedBy', 'source', 'confidence',
  ]);
  const profileBrief = profile
    ? Object.entries(profile)
        .filter(([k, v]) => v && typeof v !== 'object' && String(v).length > 0 && String(v).length < 200 && !META_KEYS.has(k))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')
    : '(no profile provided)';

  return `You are CyberControl's form-filling agent. You drive a browser by emitting tool calls.

INPUT
You receive a goal, a snapshot of visible form elements, and a customer profile.
The customer profile is the GROUND TRUTH for any value you type. Don't invent values.

OUTPUT
You output a sequence of tool calls — ONE per field you decide to fill. NO prose between calls.

CRITICAL RULES
1. To fill a text/email/tel/textarea field, ALWAYS use input.type. Never input.focus, never click.
2. To select a dropdown option, use select.option (or select.cascade for dependent ones).
3. SKIP submit/continue/proceed/next buttons. The operator submits manually.
4. SKIP "Yes"/"No" radio fields and qualifying questions ("Have you...?", "Are you...?").
5. SKIP fields where no profile key clearly matches.

FILLING DISCIPLINE
- For EVERY field whose label clearly maps to a profile key, emit ONE input.type call.
- For "Verify X", "Confirm X", "Re-type X", "a. Verify Y" twin labels, MIRROR the value of the primary field above (the one without "verify"/"confirm"/"re-type"). Same exact value.
- For Aadhaar/UID/VID labels, use profile.aadhaar_number (12 digits). NEVER profile.id.
- For Mobile/Phone/Contact labels, use profile.phone.
- For "Matriculation" / "10th class" / "SSLC" labels, use the *_10th profile keys.
- For "Intermediate" / "12th class" / "HSC" labels, use the *_12th keys.
- For Pin Code / Pincode, use profile.pincode.
- For State/UT, use profile.state. District: profile.district. Block: profile.block. Village: profile.village.
- For Father's Name use profile.father_name. Mother's Name: profile.mother_name.
- For Date of Birth: profile.dob (format dd/mm/yyyy already).

SELECTOR DISCIPLINE
- Use the EXACT selector string from the snapshot. Don't shorten or rewrite it. The CSS path looks ugly but it's what works.

LIMIT
Be exhaustive. If the form has 25 fillable fields, emit 25 tool calls (or close). Don't be lazy.

CUSTOMER PROFILE (use these as values):
${profileBrief}

CONTEXT
Hostname: ${hostname || 'unknown'}
Form: ${formContext || 'unknown'}`;
}

function driverSchemasToTools(drivers) {
  // Only expose drivers that are useful for FORM FILLING. Excludes:
  //   - input.focus / input.clear  — focus alone won't fill, model would call it instead of type
  //   - click                       — submit/navigate is operator's responsibility
  //   - wait.*                      — agent is single-shot for now; iteration in Phase 3
  //   - dom.read / dom.query        — agent already has dom.snapshot in the prompt
  //   - select.cascade              — same impl as select.option, simpler to expose one
  const FILL_DRIVERS = new Set(['input.type', 'select.option', 'select.cascade']);
  return (drivers || [])
    .filter(d => d && d.name && d.input && FILL_DRIVERS.has(d.name))
    .map(d => ({
      type: 'function',
      function: {
        name: d.name.replace(/\./g, '__'), // Groq tool names disallow dots
        description: d.description || '',
        parameters: d.input,
      },
    }));
}

function toolNameToDriverName(toolName) {
  return toolName.replace(/__/g, '.');
}

function buildUserPrompt(goal, snapshot) {
  const elements = (snapshot && snapshot.elements) || [];
  const fieldList = elements.slice(0, 100).map((el, i) => {
    const parts = [];
    parts.push(`#${i}`);
    parts.push('<' + el.tag + (el.type ? ' type=' + el.type : '') + '>');
    if (el.label) parts.push('label="' + el.label.slice(0, 60) + '"');
    if (el.placeholder) parts.push('placeholder="' + el.placeholder.slice(0, 40) + '"');
    if (el.value) parts.push('value="' + String(el.value).slice(0, 30) + '"');
    if (el.text && !el.label) parts.push('text="' + el.text.slice(0, 40) + '"');
    parts.push('selector="' + el.selector + '"');
    return parts.join(' ');
  }).join('\n');

  return `GOAL: ${goal}

PAGE SNAPSHOT:
url: ${snapshot?.url || 'unknown'}
title: ${snapshot?.title || 'unknown'}
elementCount: ${elements.length}

ELEMENTS:
${fieldList}

Plan the actions to achieve the goal. Use selectors from the snapshot exactly. Call one tool per action.`;
}

router.post('/plan', async (req, res) => {
  const t0 = Date.now();
  const { goal, snapshot, drivers, profile, hostname, formContext, model: requestedModel } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });
  if (!snapshot) return res.status(400).json({ error: 'snapshot is required' });
  if (!drivers || !Array.isArray(drivers) || drivers.length === 0) {
    return res.status(400).json({ error: 'drivers array is required (call cc.listDrivers() in the extension)' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });

  const tools = driverSchemasToTools(drivers);
  const systemPrompt = buildSystemPrompt(profile, hostname, formContext);
  const userPrompt = buildUserPrompt(goal, snapshot);
  const model = requestedModel || DEFAULT_MODEL;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools,
        tool_choice: 'auto',
        temperature: 0.1, // deterministic
        max_tokens: 8192, // ~30+ tool calls comfortably
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'groq-error', status: response.status, body: errText.slice(0, 500) });
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const toolCalls = message?.tool_calls || [];
    const actions = toolCalls.map((tc, i) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch (e) {}
      return {
        index: i,
        name: toolNameToDriverName(tc.function.name),
        args,
        toolCallId: tc.id,
      };
    });

    const result = {
      actions,
      reasoning: message?.content || null,
      model: data.model || model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      durationMs: Date.now() - t0,
    };

    // Persist proposed plan to plans table (best-effort, don't fail the request)
    try {
      const userId = req.user?.id;
      const workspaceId = req.user?.workspaceId;
      await pool.query(
        `INSERT INTO agent_plans (workspace_id, user_id, goal, snapshot, profile_id, plan, model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT DO NOTHING`,
        [workspaceId, userId, goal, JSON.stringify(snapshot).slice(0, 100000), req.body.profileId || null, JSON.stringify(result), model]
      );
    } catch (persistErr) {
      // Silent — table might not exist yet, log only
      if (persistErr.code !== '42P01') console.warn('[agent] plan persist:', persistErr.message);
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'agent-error', message: e.message, durationMs: Date.now() - t0 });
  }
});

router.post('/trace', async (req, res) => {
  const { goal, plan, results, snapshotBefore, snapshotAfter, profileId, traceId } = req.body || {};
  if (!plan || !results) return res.status(400).json({ error: 'plan and results required' });

  try {
    const userId = req.user?.id;
    const workspaceId = req.user?.workspaceId;
    const finalTraceId = traceId || ('agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
    await pool.query(
      `INSERT INTO agent_traces (id, workspace_id, user_id, goal, plan, results, snapshot_before, snapshot_after, profile_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT DO NOTHING`,
      [
        finalTraceId, workspaceId, userId, goal,
        JSON.stringify(plan).slice(0, 200000),
        JSON.stringify(results).slice(0, 500000),
        snapshotBefore ? JSON.stringify(snapshotBefore).slice(0, 100000) : null,
        snapshotAfter ? JSON.stringify(snapshotAfter).slice(0, 100000) : null,
        profileId || null,
      ]
    );
    res.json({ ok: true, traceId: finalTraceId });
  } catch (e) {
    if (e.code === '42P01') {
      // Table missing — return ok but log so admin creates it
      console.warn('[agent] trace table missing — run migrations');
      return res.json({ ok: true, traceId: 'not-persisted', warning: 'agent_traces table missing' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.get('/traces', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { rows } = await pool.query(
      `SELECT id, goal, profile_id, created_at,
              jsonb_array_length(plan->'actions') as action_count
       FROM agent_traces
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId]
    );
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    res.status(500).json({ error: e.message });
  }
});

router.get('/traces/:id', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const { rows } = await pool.query(
      `SELECT * FROM agent_traces WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
