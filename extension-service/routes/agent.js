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
  const profileBrief = profile
    ? Object.entries(profile)
        .filter(([k, v]) => v && typeof v !== 'object' && String(v).length < 200)
        .slice(0, 50)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '(no profile provided)';

  return `You are CyberControl's form-filling agent. You drive a browser through a fixed set of driver tools.

You will receive:
1. A GOAL (e.g., "fill the personal-details registration form for this customer")
2. A SNAPSHOT of visible form fields, buttons, and links on the current page
3. A CUSTOMER PROFILE (key-value pairs from their documents — Aadhaar, marksheet, etc.)
4. The DRIVER TOOLS you can call

You output a JSON list of actions to perform. Each action calls one driver tool.

Driver tools work like this:
- Observation tools (dom.query, dom.read, dom.snapshot, wait.*) read the page or wait for state.
- Mutation tools (input.type, input.clear, select.option, click) change the page.
- Compose them in order. The browser executes them one by one.

Rules:
- For text fields, use input.type with the EXACT profile value. Don't reformat (the field's masking handles that).
- For dropdowns, use select.option with the option text from the snapshot's element list.
- For dependent dropdowns (state→district→block), use select.cascade.
- For "Verify X" or "Confirm X" twin fields, use the same value as the primary field.
- For radios, only pick when the option label matches a profile value clearly. Skip "Have you ___?" / "Yes/No" qualifying radios.
- For checkboxes, only check agreement/declaration boxes (terms, I confirm, etc).
- Use exact selectors from the snapshot — don't invent ones.
- If you can't find a match for a profile field, skip it. Don't guess.
- Don't click submit/continue/next buttons unless the goal explicitly says to navigate.

Hostname: ${hostname || 'unknown'}
Form context: ${formContext || 'unknown'}

Customer profile:
${profileBrief}

Output ONLY by calling the tool functions. Do not write prose.`;
}

function driverSchemasToTools(drivers) {
  return (drivers || [])
    .filter(d => d && d.name && d.input)
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
        max_tokens: 4096,
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
