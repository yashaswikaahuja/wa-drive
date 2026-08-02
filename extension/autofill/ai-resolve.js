// ── AI residual resolver (runs in page context, LAST pass) ──────────────────
// Direct key matching and the derivation layer handle most fields. Whatever is
// STILL blank goes here: one batched LLM call that sees the whole profile plus
// each unfilled field's label, type and available options, and reasons out the
// value a human operator would enter.
//
// This is where "common sense" that can't be pre-coded lives — e.g. picking the
// right option text for an unusual dropdown, or answering a form-specific
// question from the customer's data.

/**
 * @param {Array} pendingFields  [{ selector, label, type, options?, placeholder? }]
 * @param {Object} profile       flattened profile (already derived)
 * @param {String} apiKey
 * @param {String} baseUrl
 * @param {String} model
 * @returns {Object} { [selector]: { value, kind: 'value'|'option', reason } }
 */
async function ccAiResolveValues(pendingFields, profile, apiKey, baseUrl, model) {
  if (!pendingFields || !pendingFields.length || !apiKey) return {};

  // Only send meaningful profile data (skip internals/empties)
  const profileLines = Object.entries(profile)
    .filter(([k, v]) => v != null && String(v).trim() !== '' && !k.startsWith('_') && k !== 'updatedAt')
    .map(([k, v]) => `  ${k}: ${String(v).slice(0, 120)}`)
    .join('\n');

  const fieldLines = pendingFields.map((f, i) => {
    let line = `${i}. label="${f.label || ''}" type=${f.type || 'text'}`;
    if (f.placeholder) line += ` placeholder="${f.placeholder}"`;
    if (f.options && f.options.length) {
      line += `\n   OPTIONS (must pick EXACTLY one of these): ${f.options.map(o => `"${o}"`).join(' | ')}`;
    }
    return line;
  }).join('\n');

  const prompt = `You are filling an Indian government form for a specific customer. Below is everything known about the customer, then the form fields that are still EMPTY. Decide the correct value for each field using reasoning over the customer's data.

CUSTOMER DATA:
${profileLines}

EMPTY FIELDS TO FILL:
${fieldLines}

REASONING RULES:
- Infer values the data implies even if not stated directly. Example: if 10th and 12th records exist but NO graduation record, the highest qualification is "Intermediate" (12th) — the customer has not graduated yet.
- For a field with OPTIONS, you MUST return one of the listed option strings VERBATIM (exact spelling/case). Choose the closest correct option.
- "Roll Number" on a matriculation/10th section means the 10th roll number.
- Yes/No questions: answer from the data (e.g. reserved category, ex-serviceman, disability) — use the option text shown.
- Dates: match the format implied by the placeholder.
- If you genuinely cannot determine a value from the customer's data, OMIT that field entirely. Never guess names, numbers, IDs, marks, or dates that are not derivable.
- NEVER invent an Aadhaar number, PAN, roll number, marks, phone, email, or any identifier that is not present or directly derivable.

Return ONLY a JSON object mapping field index to the value string. Omit fields you cannot determine.
Example: {"0": "Intermediate", "2": "1234567", "3": "No"}`;

  try {
    const apiUrl = baseUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const mdl = model || 'meta-llama/llama-3.3-70b-instruct';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: mdl,
        messages: [
          { role: 'system', content: 'You are a JSON-only API that fills government forms accurately. Return ONLY a valid JSON object. Never fabricate identifiers or numbers that are not derivable from the given data.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const idxMap = JSON.parse(m[0]);

    const out = {};
    for (const [idx, rawVal] of Object.entries(idxMap)) {
      const f = pendingFields[parseInt(idx, 10)];
      if (!f || rawVal == null || String(rawVal).trim() === '') continue;
      let value = String(rawVal).trim();

      // If the field has options, the value MUST be one of them — validate and
      // snap to the closest match, else drop (prevents unusable values).
      if (f.options && f.options.length) {
        const exact = f.options.find(o => o === value);
        if (!exact) {
          const ci = f.options.find(o => o.toLowerCase() === value.toLowerCase());
          const partial = ci || f.options.find(o =>
            o.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(o.toLowerCase()));
          if (!partial) continue;   // AI returned something not on the list → skip
          value = partial;
        }
        out[f.selector] = { value, kind: 'option', source: 'ai-resolve' };
      } else {
        out[f.selector] = { value, kind: 'value', source: 'ai-resolve' };
      }
    }
    return out;
  } catch (e) {
    console.warn('[CC] ai-resolve failed:', e.message);
    return {};
  }
}
