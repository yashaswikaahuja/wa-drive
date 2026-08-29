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
import { pool } from '../../db/db.js';
import { mutateDoc, KEYS } from '../../db/store.js';
import { getKeyForWorkspace } from '@cybercontrol/svc-ai-mapper';

const router = express.Router();
router.use(authMiddleware);

const DEFAULT_MODEL = process.env.LLM_AGENT_MODEL || process.env.GROQ_AGENT_MODEL || 'llama-3.3-70b-versatile';

// Compute semanticFormKey identically to extension/autofill/extractor.js
// so the agent and the autofill flow share the same cache key.
function computeSemanticFormKey(snapshot) {
  const url = snapshot && snapshot.url || '';
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch (e) {}
  const labels = (snapshot && snapshot.elements || [])
    .map(e => (e.label || '').toLowerCase().replace(/[^a-z\s]/g, '').trim())
    .filter(l => l.length > 2)
    .sort()
    .slice(0, 15);
  const raw = `${hostname}|${labels.join('|')}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
  return 's_' + Math.abs(h).toString(36);
}

function normLabel(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

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
  const FILL_DRIVERS = new Set(['input.type', 'select.option', 'select.cascade']);
  return (drivers || [])
    .filter(d => d && d.name && d.input && FILL_DRIVERS.has(d.name))
    .map(d => {
      // Sanitize input schema: keep only standard JSON-Schema fields.
      // Groq has rejected schemas with custom 'description' on the schema root
      // or extra metadata (sideEffect, output, etc).
      const cleanInput = {
        type: d.input.type || 'object',
        properties: d.input.properties || {},
        required: d.input.required || [],
      };
      // Strip nested non-standard fields per property (only keep type, description, enum, items)
      for (const [propKey, propVal] of Object.entries(cleanInput.properties)) {
        const out = {};
        if (propVal.type) out.type = propVal.type;
        if (propVal.description) out.description = String(propVal.description).slice(0, 200);
        if (propVal.enum) out.enum = propVal.enum;
        if (propVal.items) out.items = propVal.items;
        if (propVal.default !== undefined) out.default = propVal.default;
        cleanInput.properties[propKey] = out;
      }
      return {
        type: 'function',
        function: {
          name: d.name.replace(/\./g, '__'),
          description: (d.description || '').slice(0, 300),
          parameters: cleanInput,
        },
      };
    });
}

function toolNameToDriverName(toolName) {
  return toolName.replace(/__/g, '.');
}

function buildUserPrompt(goal, snapshot) {
  const elements = (snapshot && snapshot.elements) || [];
  // Filter out elements the agent shouldn't fill (saves prompt tokens)
  // Also limit to first 80 fillable elements.
  const fillable = elements.filter(el => {
    const k = el.kind || '';
    if (k === 'button') return false;             // skip buttons (operator submits)
    if (k === 'link') return false;                // skip links
    if (el.disabled) return false;
    if (el.readOnly) return false;
    return true;
  }).slice(0, 80);

  const fieldList = fillable.map((el, i) => {
    const parts = [];
    parts.push(`#${i}`);
    let kind = el.kind || 'text';
    if (!el.kind) {
      // Legacy snapshot fallback
      if (el.tag === 'select' || el.tag === 'ng-select' || el.tag === 'mat-select') kind = 'dropdown';
      else if (el.type === 'radio') kind = 'radio';
      else if (el.type === 'checkbox') kind = 'checkbox';
    }
    parts.push('[' + kind.toUpperCase() + ']');
    if (el.label) parts.push('lbl="' + el.label.slice(0, 50) + '"');
    else if (el.placeholder) parts.push('ph="' + el.placeholder.slice(0, 40) + '"');
    if (el.value) parts.push('val="' + String(el.value).slice(0, 25) + '"');
    // Selector: truncate aggressively. Most ng paths repeat parents.
    const sel = el.selector || '';
    parts.push('sel="' + (sel.length > 120 ? '...' + sel.slice(-117) : sel) + '"');
    return parts.join(' ');
  }).join('\n');

  return `GOAL: ${goal}

PAGE: ${snapshot?.url || 'unknown'} | ${snapshot?.title || ''}
FIELDS (${fillable.length} fillable of ${elements.length} total):
${fieldList}

For each [TEXT] use input.type. For each [DROPDOWN] use select.option (value text matches profile, e.g. "Female"). SKIP [RADIO] / [CHECKBOX] unless explicitly told otherwise.`;
}

router.post('/plan', async (req, res) => {
  const t0 = Date.now();
  const { goal, snapshot, drivers, profile, hostname, formContext, model: requestedModel } = req.body || {};
  if (!goal) return res.status(400).json({ error: 'goal is required' });
  if (!snapshot) return res.status(400).json({ error: 'snapshot is required' });
  if (!drivers || !Array.isArray(drivers) || drivers.length === 0) {
    return res.status(400).json({ error: 'drivers array is required (call cc.listDrivers() in the extension)' });
  }

  // ── Mapping cache: skip Groq for fields we've already learned ──────────
  // Each mapping entry: { profileKey, fills, corrections, lastSeen }
  // Pre-fill any snapshot field whose normalized label matches a known mapping
  // and whose mapped profile key has a value for THIS profile.
  const formKey = computeSemanticFormKey(snapshot);

  // ── Seed: every visit, add any visible labels NOT yet in mappings ────────
  // Pre-existing profileKey assignments are NEVER overwritten.
  // Operator can then assign profileKey per field manually in /admin/mappings.
  let seeded = 0;
  let pageHostname = '';
  try { pageHostname = new URL(snapshot.url || '').hostname; } catch (e) {}
  const today = new Date().toISOString().slice(0, 10);

  // Atomic: load → seed → save under a row lock so concurrent /plan calls don't lose seeds.
  const allMappings = await mutateDoc(KEYS.MAPPINGS, (all) => {
    if (!all[formKey]) all[formKey] = {};
    const formMappings = all[formKey];

    // Update _meta with latest visit info (don't overwrite firstSeen)
    if (!formMappings._meta) {
      formMappings._meta = { firstSeen: today };
    }
    formMappings._meta.hostname = formMappings._meta.hostname || pageHostname || hostname || null;
    formMappings._meta.title = formMappings._meta.title || snapshot.title || null;
    formMappings._meta.lastSeen = today;

    for (let i = 0; i < (snapshot.elements || []).length; i++) {
      const el = snapshot.elements[i];
      // Only filter out non-field elements. Radios/checkboxes are KEPT (operator
      // wants to see them in the mappings replica of the form).
      if (el.kind === 'button' || el.kind === 'link') continue;
      if (el.disabled) continue;
      if (!el.label) continue;
      // Skip junk labels: too short, non-alphabetic, or mismatched stray text
      const trimmedLabel = el.label.trim();
      if (trimmedLabel.length < 3) continue;
      if (!/[a-zA-Z\u0900-\u097F]/.test(trimmedLabel)) continue; // require at least one letter (Latin or Devanagari)
      const semKey = normLabel(el.label);
      if (!semKey) continue;
      if (!formMappings[semKey]) {
        formMappings[semKey] = {
          label: el.label,
          type: el.kind || 'text',           // text|dropdown|radio|checkbox|textarea|file
          order: i,                           // DOM order for replica display
          profileKey: null,
          fills: 0, corrections: 0,
          lastSeen: today,
          source: 'seed',
        };
        seeded++;
      } else {
        // Backfill missing fields without overwriting profileKey
        if (!formMappings[semKey].label) formMappings[semKey].label = el.label;
        if (!formMappings[semKey].type) formMappings[semKey].type = el.kind || 'text';
        if (formMappings[semKey].order === undefined) formMappings[semKey].order = i;
      }
    }
    return all;
  });
  let formMappings = allMappings[formKey];

  const cachedActions = [];
  const cachedFieldKeys = new Set();
  for (const el of (snapshot.elements || [])) {
    if (el.kind === 'button' || el.kind === 'link' || el.disabled || el.readOnly) continue;
    const semKey = normLabel(el.label);
    if (!semKey) continue;
    const m = formMappings[semKey];
    if (!m || !m.profileKey) continue;
    const value = profile && profile[m.profileKey];
    if (value === undefined || value === null || value === '') continue;
    const driver = (el.kind === 'dropdown' || el.tag === 'select' || el.tag === 'ng-select' || el.tag === 'mat-select')
      ? 'select.option'
      : 'input.type';
    cachedActions.push({
      index: cachedActions.length,
      name: driver,
      args: { target: el.selector, value: String(value) },
      source: 'cache',
      cacheConfidence: m.fills > 0 ? Math.max(0, Math.min(1, (m.fills - m.corrections * 2) / Math.max(1, m.fills + m.corrections))) : 0.5,
    });
    cachedFieldKeys.add(semKey);
  }

  // If cache covers all fillable fields, return immediately — no Groq call.
  const fillableElements = (snapshot.elements || []).filter(e => {
    const k = e.kind || '';
    return k !== 'button' && k !== 'link' && !e.disabled && !e.readOnly && (e.label || '').length > 0;
  });
  const uncovered = fillableElements.filter(e => !cachedFieldKeys.has(normLabel(e.label)));

  if (uncovered.length === 0 && cachedActions.length > 0) {
    return res.json({
      actions: cachedActions,
      reasoning: `cache-only: ${cachedActions.length} fields all in trained mappings for ${formKey}`,
      model: 'cache',
      formKey,
      cacheHit: cachedActions.length,
      cacheMiss: 0,
      durationMs: Date.now() - t0,
    });
  }

  const wsKeys = await getKeyForWorkspace(req.user.workspaceId);
  if (!wsKeys.apiKey) {
    return res.status(500).json({ error: 'No AI key configured — set OpenRouter/text keys in owner panel' });
  }
  const apiUrl = wsKeys.endpoint || 'https://openrouter.ai/api/v1/chat/completions';

  // Only send UNCOVERED fields — preserves token budget for novel fields.
  const subSnapshot = {
    ...snapshot,
    elements: uncovered.length ? uncovered : (snapshot.elements || []),
  };

  const tools = driverSchemasToTools(drivers);
  const systemPrompt = buildSystemPrompt(profile, hostname, formContext);
  const userPrompt = buildUserPrompt(goal, subSnapshot);
  const model = requestedModel || wsKeys.model || DEFAULT_MODEL;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + wsKeys.apiKey },
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
      return res.status(502).json({ error: 'llm-error', status: response.status, body: errText.slice(0, 500) });
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

    // Mark Groq-sourced actions and merge with cached ones (cache first)
    actions.forEach((a, i) => { a.source = a.source || 'agent'; a.index = cachedActions.length + i; });
    const mergedActions = [...cachedActions, ...actions];

    // ── Save proposed mappings to form_mappings.json IMMEDIATELY ──────────
    // Even before execute, save the agent's profileKey guesses so the admin
    // page shows all fields pre-mapped. Operator can later correct wrong ones.
    // We DON'T overwrite existing entries that have a profileKey set (so manual
    // operator edits in /admin/mappings are sticky).
    try {
      const elementBySelector = new Map();
      for (const el of (snapshot.elements || [])) elementBySelector.set(el.selector, el);
      let savedMappings = 0;
      await mutateDoc(KEYS.MAPPINGS, (all) => {
        if (!all[formKey]) all[formKey] = {};
        const fm = all[formKey];
        for (const action of mergedActions) {
          if (action.name !== 'input.type' && action.name !== 'select.option') continue;
          const el = elementBySelector.get(action.args?.target);
          if (!el || !el.label) continue;
          const semKey = normLabel(el.label);
          if (!semKey) continue;
          // Reverse-lookup profileKey from value
          let profileKey = null;
          if (profile && typeof profile === 'object') {
            for (const [k, v] of Object.entries(profile)) {
              if (v && String(v) === String(action.args.value)) { profileKey = k; break; }
            }
          }
          // Only set if not already mapped to something concrete (preserve manual edits)
          const existing = fm[semKey];
          if (existing && existing.profileKey && existing.source === 'manual') continue;
          if (profileKey) {
            fm[semKey] = fm[semKey] || { fills: 0, corrections: 0, source: 'agent' };
            fm[semKey].label = fm[semKey].label || el.label;
            fm[semKey].profileKey = profileKey;
            fm[semKey].lastSeen = today;
            if (!fm[semKey].source || fm[semKey].source === 'seed') {
              fm[semKey].source = action.source || 'agent';
            }
            savedMappings++;
          }
        }
        return all;
      });
    } catch (e) { console.warn('[agent] save proposed mappings failed:', e.message); }

    const result = {
      actions: mergedActions,
      hallucinationsDropped,
      reasoning: message?.content || null,
      model: data.model || model,
      formKey,
      cacheHit: cachedActions.length,
      cacheMiss: actions.length,
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
  const { goal, plan, results, snapshotBefore, snapshotAfter, profileId, traceId, profile, formKey: bodyFormKey } = req.body || {};
  if (!plan || !results) return res.status(400).json({ error: 'plan and results required' });

  // ── Learn: write successful (formKey, label) -> profileKey to mappings ───
  // For each step that succeeded AND verified, find the snapshot element by
  // selector to recover its label, then promote (formKey, label) -> profileKey.
  let learned = 0;
  try {
    const formKey = bodyFormKey || (snapshotBefore ? computeSemanticFormKey(snapshotBefore) : null);
    if (formKey && plan.actions && results.steps && Array.isArray(snapshotBefore?.elements)) {
      const today = new Date().toISOString().slice(0, 10);
      const elementBySelector = new Map();
      for (const el of snapshotBefore.elements) {
        elementBySelector.set(el.selector, el);
      }
      await mutateDoc(KEYS.MAPPINGS, (all) => {
      if (!all[formKey]) all[formKey] = {};
      for (let i = 0; i < plan.actions.length; i++) {
        const action = plan.actions[i];
        const step = results.steps[i];
        if (!step || !step.ok || !step.result) continue;
        if (action.name !== 'input.type' && action.name !== 'select.option') continue;
        if (step.result.verified === false) continue;
        const el = elementBySelector.get(action.args.target);
        if (!el || !el.label) continue;
        const semKey = normLabel(el.label);
        if (!semKey) continue;
        // Reverse-lookup the profile key by value
        let profileKey = null;
        if (profile && typeof profile === 'object') {
          for (const [k, v] of Object.entries(profile)) {
            if (v && String(v) === String(action.args.value)) { profileKey = k; break; }
          }
        }
        if (!profileKey) continue;
        const existing = all[formKey][semKey];
        if (existing) {
          existing.label = existing.label || el.label;
          existing.fills = (existing.fills || 0) + 1;
          existing.profileKey = profileKey;
          existing.lastSeen = today;
        } else {
          all[formKey][semKey] = { label: el.label, profileKey, fills: 1, corrections: 0, lastSeen: today, source: 'agent' };
        }
        learned++;
      }
      return all;
      });
    }
  } catch (e) {
    console.warn('[agent] learn failed:', e.message);
  }

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
    res.json({ ok: true, traceId: finalTraceId, mappingsLearned: learned });
  } catch (e) {
    if (e.code === '42P01') {
      console.warn('[agent] trace table missing — run migrations');
      return res.json({ ok: true, traceId: 'not-persisted', mappingsLearned: learned, warning: 'agent_traces table missing' });
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
