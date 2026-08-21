/**
 * AUTO-GENERATED
 * Source: autofill/ai-resolve/capabilities/*.js + ai-resolve.js
 * Rebuild: node extension/autofill/build-ai-resolve-bundle.mjs
 */

/* ==== ai-resolve/capabilities/ai-resolve.js ==== */
/**
 * ai-resolve — LLM residual field resolver
 *
 * Last-pass resolver for fields that fuzzy-match and rule-engine could not fill.
 * One batched LLM call sees the whole profile + each unfilled field's label,
 * type and options, then reasons out the correct value.
 *
 * Soft-fail only — never throws, never console.warn.
 *
 * Public API (on globalThis.CcAiResolve):
 *   resolveValues(pendingFields, profile, apiKey, baseUrl, model) => Promise<mapping>
 *
 * See docs/ai-resolve.md for full documentation.
 */
(function (root) {
  'use strict';

  async function resolveValues(pendingFields, profile, apiKey, baseUrl, model) {
    if (!pendingFields || !pendingFields.length || !apiKey) return {};

    var profileLines = Object.entries(profile)
      .filter(function (kv) { return kv[1] != null && String(kv[1]).trim() !== '' && !kv[0].startsWith('_') && kv[0] !== 'updatedAt'; })
      .map(function (kv) { return '  ' + kv[0] + ': ' + String(kv[1]).slice(0, 120); })
      .join('\n');

    var fieldLines = pendingFields.map(function (f, i) {
      var line = i + '. label="' + (f.label || '') + '" type=' + (f.type || 'text');
      if (f.placeholder) line += ' placeholder="' + f.placeholder + '"';
      if (f.options && f.options.length) {
        line += '\n   OPTIONS (must pick EXACTLY one): ' + f.options.map(function (o) { return '"' + o + '"'; }).join(' | ');
      } else if (/dropdown|select/i.test(f.type || '')) {
        line += '\n   (DROPDOWN — give the most standard/common phrasing.)';
      }
      return line;
    }).join('\n');

    var prompt = 'You are filling an Indian government form. Below is the customer data and empty fields.\n\nCUSTOMER DATA:\n' + profileLines + '\n\nEMPTY FIELDS:\n' + fieldLines + '\n\nRULES:\n- For OPTIONS fields return one of the listed strings VERBATIM.\n- Never invent Aadhaar, PAN, roll numbers, marks, phone, email or any identifier not derivable from the data.\n- Omit fields you cannot determine.\n\nReturn ONLY a JSON object: {"0": "value", "2": "value"}';

    try {
      var ccLLM = typeof window !== 'undefined' && window.ccLLM;
      if (!ccLLM) return {};

      var result = await ccLLM.call({
        apiKey: apiKey, baseUrl: baseUrl, model: model,
        systemPrompt: 'You are a JSON-only API. Return ONLY valid JSON. Never fabricate identifiers.',
        userPrompt: prompt, maxTokens: 500, temperature: 0,
      });

      if (result.error) { console.debug('[CC] ai-resolve soft-fail:', result.error); return {}; }
      var idxMap = ccLLM.parseJSON(result.text);
      if (!idxMap) return {};

      var out = {};
      for (var idx in idxMap) {
        var f = pendingFields[parseInt(idx, 10)];
        var rawVal = idxMap[idx];
        if (!f || rawVal == null || String(rawVal).trim() === '') continue;
        var value = String(rawVal).trim();

        if (f.options && f.options.length) {
          var exact = f.options.find(function (o) { return o === value; });
          if (!exact) {
            var ci = f.options.find(function (o) { return o.toLowerCase() === value.toLowerCase(); });
            var partial = ci || f.options.find(function (o) {
              return o.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(o.toLowerCase());
            });
            if (!partial) continue;
            value = partial;
          }
          out[f.selector] = { value: value, kind: 'option', source: 'ai-resolve' };
        } else {
          var isDD = /dropdown|select/i.test(f.type || '');
          out[f.selector] = { value: value, kind: isDD ? 'option' : 'value', source: 'ai-resolve' };
        }
      }
      return out;
    } catch (e) {
      console.debug('[CC] ai-resolve soft-fail:', (e && e.message) || e);
      return {};
    }
  }

  root.CcAiResolve = { resolveValues: resolveValues };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== ai-resolve.js (facade) ==== */
// ai-resolve.js — thin facade over CcAiResolve capability
async function ccAiResolveValues(pendingFields, profile, apiKey, baseUrl, model) {
  var _ar = globalThis.CcAiResolve || {};
  if (_ar.resolveValues) return _ar.resolveValues(pendingFields, profile, apiKey, baseUrl, model);
  return {};
}
