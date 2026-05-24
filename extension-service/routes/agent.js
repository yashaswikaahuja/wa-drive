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
  const cleanEntries = profile
    ? Object.entries(profile).filter(([k, v]) => v && typeof v !== 'object' && String(v).length > 0 && String(v).length < 200 && !META_KEYS.has(k))
    : [];
  const profileBrief = cleanEntries.length ? cleanEntries.map(([k, v]) => `  ${k}: ${v}`).join('\n') : '(no profile provided)';
  const availableKeys = cleanEntries.map(([k]) => k).join(', ') || '(none)';

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

DROPDOWNS (ng-select / mat-select / native select)
- For Gender: select.option with value matching profile.gender (e.g. "Female").
- For State, District, Education Board, Year of Passing, etc: use select.option (or select.cascade
  for State→District chains). Match by EXACT profile value text.
- If the snapshot's element is a <select> or <ng-select> or <mat-select>, USE select.option, NOT input.type.

NEVER INVENT VALUES
- If profile has no email, do NOT type something like "name@gmail.com". Skip the field entirely.
- If profile has no specific value for a field, skip it. Don't guess. Don't synthesize.
- If a profile key is empty / missing, that field stays unfilled.

AVAILABLE PROFILE KEYS (these are the ONLY keys that exist; if a form field needs a key NOT in this list, skip):
  ${availableKeys}

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
    // Use the kind field set by dom.js summarizeEl (drivers v5.76+).
    // Falls back to inferring from tag/type for older snapshots.
    let kind = el.kind;
    if (!kind) {
      if (el.tag === 'select' || el.tag === 'ng-select' || el.tag === 'mat-select') kind = 'dropdown';
      else if (el.type === 'radio') kind = 'radio';
      else if (el.type === 'checkbox') kind = 'checkbox';
      else if (el.tag === 'button' || el.type === 'submit' || el.type === 'button') kind = 'button';
      else kind = 'text';
    }
    parts.push('[' + kind.toUpperCase() + ']');
    if (el.label) parts.push('label="' + el.label.slice(0, 60) + '"');
    if (el.placeholder) parts.push('placeholder="' + el.placeholder.slice(0, 40) + '"');
    if (el.value) parts.push('value="' + String(el.value).slice(0, 30) + '"');
    if (el.text && !el.label && !['button','div'].includes(el.tag)) parts.push('text="' + el.text.slice(0, 40) + '"');
    parts.push('selector="' + el.selector + '"');
    return parts.join(' ');
  }).join('\n');

  return `GOAL: ${goal}

PAGE SNAPSHOT:
url: ${snapshot?.url || 'unknown'}
title: ${snapshot?.title || 'unknown'}
elementCount: ${elements.length}

ELEMENTS (use kind tag to pick the right tool):
${fieldList}

Plan tool calls. For each [TEXT] use input.type; for each [DROPDOWN] use select.option (the value text matches the profile field, e.g. "Female"); SKIP [BUTTON] and [RADIO] unless explicitly told otherwise.`;
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

    // Build set of profile values for hallucination filter
    const profileValueSet = new Set();
    if (profile && typeof profile === 'object') {
      for (const v of Object.values(profile)) {
        if (v && typeof v !== 'object') {
          const str = String(v).trim();
          if (str.length > 0) profileValueSet.add(str.toLowerCase().replace(/[^a-z0-9]/g, ''));
        }
      }
    }

    let hallucinationsDropped = 0;
    const actions = toolCalls.map((tc, i) => {
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch (e) {}
      return {
        index: i,
        name: toolNameToDriverName(tc.function.name),
        args,
        toolCallId: tc.id,
      };
    }).filter(action => {
      // Hallucination guard: for input.type / select.option, the value MUST come from profile.
      // Match by lowercase-alphanum compare. Allow profile aadhaar masked variants (subset match ok).
      if ((action.name === 'input.type' || action.name === 'select.option') && action.args && action.args.value) {
        const valNorm = String(action.args.value).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (valNorm.length === 0) return true; // empty value, let driver handle
        // Direct match
        if (profileValueSet.has(valNorm)) return true;
        // Substring match (e.g. profile.address contains the value, or value is prefix of address)
        for (const pv of profileValueSet) {
          if (pv.length >= 4 && (pv.includes(valNorm) || valNorm.includes(pv))) return true;
        }
        // Single-token / numeric check (DD/MM/YYYY parts of dob)
        if (profile.dob) {
          const dobParts = String(profile.dob).split(/[\/\-.]/);
          if (dobParts.includes(String(action.args.value))) return true;
        }
        hallucinationsDropped++;
        return false; // hallucinated value — drop
      }
      return true;
    });

    const result = {
      actions,
      hallucinationsDropped,
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
