/**
 * AUTO-GENERATED
 * Source: packages/cc-shared/src/
 * Rebuild: node extension/build-shared-bundle.mjs
 */

/* ==== network-idle.js ==== */
// ── shared/network-idle.js ─────────────────────────────────────────────────
// Single source of truth for waiting on network idle state.
// Reads counters published by network-monitor.js (which runs in MAIN world).
// Exposes: window.ccWaitForNetworkIdle(quietMs, maxMs)
//
// Used by: executor.js, drivers/interaction.js (wait.networkIdle),
//          drivers/select.js (select.cascade), cascade-select.js plugin
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Wait until the page network has been idle for `quietMs` consecutive ms.
   * Falls back to a fixed delay if the network monitor is not installed.
   *
   * @param {number} [quietMs=200]  - Required quiet duration after last activity
   * @param {number} [maxMs=8000]   - Maximum total wait before giving up
   * @returns {Promise<{idle: boolean, waitedMs: number, monitorMissing?: boolean}>}
   */
  function ccWaitForNetworkIdle(quietMs, maxMs) {
    quietMs = (typeof quietMs === 'number' && quietMs > 0) ? quietMs : 200;
    maxMs = (typeof maxMs === 'number' && maxMs > 0) ? maxMs : 8000;

    return new Promise(function (resolve) {
      var start = Date.now();
      var deadline = start + maxMs;

      function tick() {
        var ds = document.body.dataset || {};
        var active = parseInt(ds.ccAjaxActive || 'NaN', 10);
        var lastActivity = parseInt(ds.ccAjaxLastActivity || '0', 10);

        // Monitor not installed — fall back to fixed quiet wait
        if (Number.isNaN(active)) {
          setTimeout(function () {
            resolve({ idle: true, waitedMs: Date.now() - start, monitorMissing: true });
          }, quietMs);
          return;
        }

        // Timeout reached
        if (Date.now() >= deadline) {
          resolve({ idle: false, waitedMs: Date.now() - start, reason: 'max-elapsed' });
          return;
        }

        // Network is idle and has been quiet long enough
        if (active === 0 && lastActivity && (Date.now() - lastActivity) >= quietMs) {
          resolve({ idle: true, waitedMs: Date.now() - start });
          return;
        }

        // Keep polling
        setTimeout(tick, 50);
      }

      tick();
    });
  }

  // Expose globally
  window.ccWaitForNetworkIdle = ccWaitForNetworkIdle;
})();

/* ==== dom-utils.js ==== */
// ── shared/dom-utils.js ────────────────────────────────────────────────────
// Single source of truth for DOM utility functions used across the extension.
// Exposes: window.ccDomUtils = { getLabel, isVisible, isGoodLabel }
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Check if an element is visible in the viewport.
   * Combines all checks from across the codebase:
   * - getBoundingClientRect dimensions
   * - getComputedStyle display/visibility/opacity
   * - offsetParent (detects display:none ancestors)
   */
  function isVisible(el) {
    if (!el) return false;
    // offsetParent is null for hidden elements (display:none, or <html>/<body>)
    // but also for position:fixed — so we can't rely on it alone
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }

  /**
   * Determine if a label text is "good" (meaningful, not just whitespace or generic).
   */
  function isGoodLabel(text) {
    if (!text) return false;
    var t = text.replace(/[*:\s]/g, '');
    if (t.length < 2) return false;
    // Reject obvious placeholder-only text (when option text gets captured as label)
    var lower = text.toLowerCase().trim();
    if (/^(please\s+select|select\s+(an?|one)|--\s*select|choose|select\.{2,}|enter|type|input|field)$/i.test(lower)) return false;
    if (/^[\d\s\-_.*/]+$/.test(text)) return false;
    // Reject if mostly years/numbers separated by whitespace (option list of years got captured)
    var nonDigits = text.replace(/[\d\s\n\r,]/g, '').trim();
    if (text.length > 30 && nonDigits.length < text.length * 0.3) return false;
    // Reject if too long (>250 chars likely a paragraph or option list dump)
    if (text.length > 250) return false;
    // Reject if has too many newlines (option list captured)
    if ((text.match(/\n/g) || []).length > 3) return false;
    return true;
  }

  /**
   * Resolve the human-readable label for a form element.
   * This is the most complete implementation, merging extractor.js getLabel
   * and drivers/dom.js getLabelFor.
   *
   * Priority:
   *   1. <label for="id">
   *   2. aria-label / aria-labelledby
   *   3. Wrapping <label>
   *   4. Preceding <td> in a table row
   *   5. Container label (.form-group, mat-form-field, etc.)
   *   6. Parent hierarchy label (up to 4 hops)
   *   7. Preceding sibling element
   *   8. Placeholder (last resort)
   */
  function getLabel(el) {
    if (!el) return '';

    // 1. Explicit <label for="id">
    if (el.id) {
      try {
        var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lbl && isGoodLabel(lbl.textContent.trim())) return lbl.textContent.trim();
      } catch (e) {}
    }

    // 2. aria-label / aria-labelledby
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && isGoodLabel(ariaLabel)) return ariaLabel.trim();
    var labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      var lEl = document.getElementById(labelledBy);
      if (lEl && isGoodLabel(lEl.textContent.trim())) return lEl.textContent.trim();
    }

    // 3. Wrapping <label>
    var wrappingLabel = el.closest('label');
    if (wrappingLabel) {
      var clone = wrappingLabel.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(function (e) { e.remove(); });
      var t = clone.textContent.trim();
      if (isGoodLabel(t)) return t;
    }

    // 4. Preceding <td> in a table row
    var td = el.closest('td');
    if (td) {
      var prevTd = td.previousElementSibling;
      if (prevTd && isGoodLabel(prevTd.textContent.trim())) {
        return prevTd.textContent.trim().slice(0, 80);
      }
    }

    // 5. Container label (.form-group, mat-form-field, etc.)
    var container = el.closest('.form-group,.form-field,.field-wrapper,.input-group,mat-form-field,[class*="form-row"],[class*="field-row"]');
    if (container) {
      var cLbl = container.querySelector('label,mat-label,.label,.field-label,.control-label,.form-label');
      if (cLbl && isGoodLabel(cLbl.textContent.trim())) return cLbl.textContent.trim();
    }

    // 6. Parent hierarchy label (up to 4 hops — from drivers/dom.js)
    var p = el.parentElement;
    var hop = 0;
    while (p && hop < 4) {
      var pLbl = p.querySelector(':scope > label, :scope > .label, :scope > .field-label, :scope > .control-label, :scope > .form-label, :scope > mat-label');
      if (pLbl && pLbl !== el && isGoodLabel(pLbl.textContent.trim())) {
        return pLbl.textContent.trim();
      }
      p = p.parentElement;
      hop++;
    }

    // 7. Preceding sibling element
    var prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prev.tagName)) {
      var pt = prev.textContent.trim();
      if (isGoodLabel(pt) && pt.length < 80 && !prev.querySelector('input,select,textarea')) {
        return pt;
      }
    }

    // 8. Placeholder as last resort
    if (el.placeholder && isGoodLabel(el.placeholder) && el.placeholder.length < 60) {
      return el.placeholder;
    }

    return '';
  }

  // Expose globally
  window.ccDomUtils = {
    getLabel: getLabel,
    isVisible: isVisible,
    isGoodLabel: isGoodLabel,
  };
})();

/* ==== label-utils.js ==== */
// ── shared/label-utils.js ────────────────────────────────────────────────────
// Single source of truth for label normalization, semantic key mapping,
// and confidence calculation.
//
// Used by: mapper.js, background.js, popup.js, rule-engine.js
//
// NOTE: This file is loaded via <script> in popup.html AND injected into page
// context. Keep it pure functions, no DOM, no async.
// ────────────────────────────────────────────────────────────────────────────

const SEMANTIC_ALIASES = {
  'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
  'student name': 'name', 'name of candidate': 'name', 'name of applicant': 'name',
  'candidates name': 'name', 'applicants name': 'name',
  'date of birth': 'dob', 'birth date': 'dob', 'dob': 'dob', 'date of birth ddmmyyyy': 'dob',
  "fathers name": 'father_name', 'father name': 'father_name', "fathers husbands name": 'father_name',
  "mothers name": 'mother_name', 'mother name': 'mother_name',
  'aadhaar no': 'aadhaar_number', 'aadhaar number': 'aadhaar_number', 'aadhar no': 'aadhaar_number',
  'pan no': 'pan_number', 'pan number': 'pan_number', 'pan card': 'pan_number',
  'mobile no': 'mobile', 'mobile number': 'mobile', 'phone no': 'mobile', 'contact no': 'mobile',
  'email id': 'email', 'email address': 'email',
  'permanent address': 'address', 'residential address': 'address', 'correspondence address': 'address',
  'pin code': 'pincode', 'postal code': 'pincode', 'pincode': 'pincode',
  'state name': 'state', 'district name': 'district',
};

function normalizeLabel(label) {
  return (label || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return SEMANTIC_ALIASES[n] || n;
}

/**
 * Calculate confidence score for a field mapping.
 * Higher fills relative to corrections → higher confidence.
 * Corrections are weighted 3x to make confidence drop faster on errors.
 *
 * Returns 0.5 for new mappings (neutral), approaches 1.0 for well-established
 * mappings with no corrections, drops toward 0 for heavily corrected ones.
 *
 * @param {number} fills       - Number of successful fills
 * @param {number} corrections - Number of operator corrections
 * @returns {number} Confidence between 0 and 1
 */
function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}

/**
 * Strip leading numbering ("4. ", "a. ") and trailing asterisks from form labels.
 * Also collapses newlines to spaces.
 */
function normalizeFieldLabel(label) {
  return (label || '').replace(/\n/g, ' ').replace(/^\d+\.\s*/, '').replace(/^[a-z]\.\s*/i, '').replace(/\*$/, '').trim();
}

/* ==== option-match.js ==== */
// ── shared/option-match.js ─────────────────────────────────────────────────
// Single source of truth for matching a desired value against a list of options.
// Used by: executor.js, cascade-select.js, ng-dropdown.js, drivers/select.js,
// rule-engine.js.
//
// Exposes window.ccMatchOption(value, options, config) for page-context callers.
// config.translations: { profileValue → optionText } lookup
// config.extraValues: alternative acceptable values (e.g. from corrections)
// config.synonymGroups: array of synonym arrays for domain-specific matching
//
// Match priority (first match wins):
//   1. Translation table exact hit
//   2. Exact by value property (case-insensitive)
//   3. Exact by text (normalized)
//   4. Extra values match
//   5. Starts-with (either direction, min 3 chars)
//   6. Contains (either direction, min 4 chars)
//   7. Token overlap (all query tokens found in option)
//   8. Synonym group match
//   9. null (no match)
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  function norm(s) {
    return (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Default synonym groups (education-level equivalences common on Indian forms)
  var DEFAULT_SYNONYMS = [
    ['intermediate', 'higher secondary', '10+2', '12th', 'hsc', 'senior secondary', 'plus two'],
    ['matriculation', '10th', 'sslc', 'secondary', 'high school', 'class 10', 'class x'],
    ['graduation', 'graduate', 'degree', 'bachelor', 'ug', 'under graduate'],
    ['post graduation', 'post graduate', 'masters', 'pg', 'post-graduate'],
    ['general', 'gen', 'ur', 'unreserved'],
    ['obc', 'other backward class', 'other backward classes'],
    ['sc', 'scheduled caste'],
    ['st', 'scheduled tribe'],
    ['male', 'm', 'पुरुष'],
    ['female', 'f', 'महिला', 'स्त्री'],
    ['other', 'transgender', 'third gender'],
  ];

  /**
   * Match a value against a list of options.
   *
   * @param {string} value         - The desired value to match (from profile)
   * @param {Array}  options       - Array of option objects {text, value} or plain strings
   * @param {Object} [config]      - Optional configuration
   * @param {Object} [config.translations]   - { profileValue → optionText }
   * @param {Array}  [config.extraValues]    - Alternative acceptable values
   * @param {Array}  [config.synonymGroups]  - Additional synonym groups
   * @param {boolean}[config.excludePlaceholders] - Filter out Select/Choose/Loading (default true)
   * @returns {Object|string|null} The matched option or null
   */
  function ccMatchOption(value, options, config) {
    if (value == null || !options || !options.length) return null;
    config = config || {};

    var v = String(value).trim();
    var vn = norm(v);
    if (!vn) return null;

    // Normalize options to {text, value, _original} shape
    var excludePlaceholders = config.excludePlaceholders !== false;
    var opts = options.map(function (o) {
      if (typeof o === 'string') return { text: o, value: o, _original: o };
      return { text: o.text || o.label || '', value: o.value || '', _original: o };
    });

    if (excludePlaceholders) {
      opts = opts.filter(function (o) {
        if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
        var t = (o.text || '').toLowerCase();
        if (t.includes('select') || t.includes('choose') || t.includes('loading') || t === '--') return false;
        return true;
      });
    }

    if (!opts.length) return null;

    // 1. Translation table
    var translations = config.translations;
    if (translations) {
      var tr = translations[v] || translations[vn] || translations[value];
      if (tr) {
        var trn = norm(tr);
        var hit = opts.find(function (o) { return norm(o.text) === trn || norm(o.value) === trn; });
        if (hit) return hit._original;
      }
    }

    // 2. Exact match by value property (case-insensitive)
    var hit = opts.find(function (o) { return o.value.toLowerCase().trim() === v.toLowerCase().trim(); });
    if (hit) return hit._original;

    // 3. Exact match by normalized text
    hit = opts.find(function (o) { return norm(o.text) === vn; });
    if (hit) return hit._original;

    // Also try normalized value
    hit = opts.find(function (o) { return norm(o.value) === vn; });
    if (hit) return hit._original;

    // 4. Extra values (from corrections/alternatives)
    var extraValues = config.extraValues;
    if (extraValues && extraValues.length) {
      var extras = extraValues.map(function (e) { return norm(e); });
      hit = opts.find(function (o) {
        return extras.includes(o.value.toLowerCase()) || extras.includes(norm(o.text));
      });
      if (hit) return hit._original;
    }

    // 5. Starts-with (either direction, min 3 chars)
    if (vn.length > 2) {
      hit = opts.find(function (o) { return norm(o.text).startsWith(vn); });
      if (hit) return hit._original;
      hit = opts.find(function (o) { var on = norm(o.text); return on.length > 2 && vn.startsWith(on); });
      if (hit) return hit._original;
    }

    // 6. Contains (either direction, min 4 chars)
    if (vn.length > 3) {
      hit = opts.find(function (o) { return norm(o.text).includes(vn); });
      if (hit) return hit._original;
      hit = opts.find(function (o) { var on = norm(o.text); return on.length > 3 && vn.includes(on); });
      if (hit) return hit._original;
    }

    // 7. Token overlap (all value tokens found in option)
    var vWords = vn.split(' ').filter(function (w) { return w.length > 1; });
    if (vWords.length > 0) {
      var scored = opts.filter(function (o) {
        var on = norm(o.text);
        return vWords.every(function (w) { return on.includes(w); });
      });
      if (scored.length === 1) return scored[0]._original;
      // If multiple all-token matches, prefer shortest (most specific)
      if (scored.length > 1) {
        scored.sort(function (a, b) { return a.text.length - b.text.length; });
        return scored[0]._original;
      }
    }

    // 8. Synonym group match
    var synonymGroups = (config.synonymGroups || []).concat(DEFAULT_SYNONYMS);
    for (var gi = 0; gi < synonymGroups.length; gi++) {
      var group = synonymGroups[gi];
      var vInGroup = group.some(function (s) { return vn.includes(s) || s.includes(vn); });
      if (!vInGroup) continue;
      hit = opts.find(function (o) {
        var on = norm(o.text);
        return group.some(function (s) { return on.includes(s) || s.includes(on); });
      });
      if (hit) return hit._original;
    }

    return null;
  }

  // Expose globally
  window.ccMatchOption = ccMatchOption;

  // Also expose norm for tests
  window.ccMatchOption._norm = norm;
  window.ccMatchOption._DEFAULT_SYNONYMS = DEFAULT_SYNONYMS;
})();

/* ==== select-apply.js ==== */
// ── shared/select-apply.js ─────────────────────────────────────────────────
// Single source of truth for applying a native <select> option with full event
// dispatch compatibility (ASP.NET, DWR/ServicePlus, jQuery, Angular).
//
// Exposes: window.ccApplySelect(el, opt)
//
// Used by: executor.js, cascade-select.js
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Apply a selected option to a native <select> element with full framework
   * compatibility. Handles:
   * - Native value setter (bypasses React/Angular interception)
   * - Full event sequence (mousedown → mouseup → click → input → change)
   * - ASP.NET onchange handler direct invocation
   * - jQuery .trigger('change') for ServicePlus/DWR
   * - propertychange for legacy IE-compat portals
   * - DWR cascade re-apply after 3.5s (ServicePlus resets dependent selects)
   *
   * @param {HTMLSelectElement} el - The select element
   * @param {HTMLOptionElement} opt - The option to select
   * @returns {boolean} true
   */
  function ccApplySelect(el, opt) {
    el.focus();
    el.dispatchEvent(new Event('focus', { bubbles: true }));

    // Step 1: Mark the option directly
    Array.from(el.options).forEach(function (o) { o.selected = false; });
    opt.selected = true;
    el.selectedIndex = opt.index;

    // Step 2: Sync via native setter (bypasses framework interceptors)
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
    if (nativeSetter) nativeSetter.set.call(el, opt.value);
    else el.value = opt.value;

    // Step 3: Full event sequence
    ['mousedown', 'mouseup', 'click', 'input', 'change'].forEach(function (ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
    });

    // Step 4: ASP.NET onchange handler (some portals bind directly)
    if (typeof el.onchange === 'function') {
      try { el.onchange.call(el, new Event('change')); } catch (e) {}
    }

    // Step 5: jQuery trigger (ServicePlus, DWR cascading selects)
    if (typeof $ !== 'undefined') {
      try { $(el).trigger('change'); } catch (e) {}
    }

    // Step 6: propertychange for old ASP.NET/IE compat
    try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch (e) {}

    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Step 7: DWR re-apply after 3.5s (ServicePlus resets dependent selects)
    var _rv = opt.value;
    var _ri = opt.index;
    setTimeout(function () {
      if (el.value !== _rv) {
        el.selectedIndex = _ri;
        el.value = _rv;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 3500);

    return true;
  }

  window.ccApplySelect = ccApplySelect;
})();

/* ==== llm-client.js ==== */
// ── shared/llm-client.js ───────────────────────────────────────────────────
// Single LLM client for all AI calls across the extension.
// Exposes: window.ccLLM = { call, parseJSON }
//
// All callers (mapper.js aiMatch, ai-resolve.js, executor.js AI select,
// background.js groqAutoTeach) should use this instead of inline fetch.
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  var DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
  var DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';
  var DEFAULT_MAX_TOKENS = 500;
  var DEFAULT_TIMEOUT = 12000; // keep short so fill is not blocked; soft outer races handle rest

  /**
   * Make an LLM API call.
   *
   * @param {Object} opts
   * @param {string} opts.apiKey         - API key (required)
   * @param {string} [opts.baseUrl]      - API endpoint URL
   * @param {string} [opts.model]        - Model name
   * @param {string} opts.systemPrompt   - System message
   * @param {string} opts.userPrompt     - User message
   * @param {number} [opts.maxTokens]    - Max response tokens
   * @param {number} [opts.temperature]  - Temperature (default: undefined = provider default)
   * @param {number} [opts.timeout]      - Request timeout in ms
   * @returns {Promise<{text: string, usage: Object|null, raw: Object}>}
   */
  async function call(opts) {
    if (!opts || !opts.apiKey) {
      return { text: '', usage: null, raw: null, error: 'no-api-key' };
    }

    var url = opts.baseUrl || DEFAULT_BASE_URL;
    var model = opts.model || DEFAULT_MODEL;
    var maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
    var timeout = opts.timeout || DEFAULT_TIMEOUT;

    var messages = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: opts.userPrompt });

    var body = {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
    };
    if (opts.temperature !== undefined) {
      body.temperature = opts.temperature;
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout);

    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + opts.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        var errText = '';
        try { errText = await res.text(); } catch (e) {}
        return { text: '', usage: null, raw: null, error: 'http-' + res.status, detail: errText };
      }

      var data = await res.json();
      var text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      var usage = (data && data.usage) || null;
      return { text: text, usage: usage, raw: data, error: null };
    } catch (e) {
      clearTimeout(timer);
      var errMsg = e.name === 'AbortError' ? 'timeout' : e.message;
      return { text: '', usage: null, raw: null, error: errMsg };
    }
  }

  /**
   * Parse a JSON object from LLM response text.
   * Handles common LLM quirks: markdown code blocks, extra text before/after.
   *
   * @param {string} text - Raw LLM response
   * @returns {Object|null} Parsed JSON or null
   */
  function parseJSON(text) {
    if (!text) return null;
    // Strip markdown code fences if present
    var stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    // Find the outermost { ... }
    var match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      // Try fixing common issues: trailing commas
      try {
        var fixed = match[0].replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(fixed);
      } catch (e2) {
        return null;
      }
    }
  }

  // Expose globally
  window.ccLLM = {
    call: call,
    parseJSON: parseJSON,
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    DEFAULT_MODEL: DEFAULT_MODEL,
  };
})();

/* ==== semantic-aliases.js ==== */
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Semantic Aliases (Service-Provided)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Maps semantic_key values to label patterns for target resolution.
// Used by runtime/resolver.js.
//
// THE EXTENSION DOES NOT OWN THIS DATA.
// Aliases are loaded from the service at runtime via:
//   window.ccSemanticAliases.load(backendUrl, token)
//
// The extension starts with an EMPTY dictionary.
// If the service is unreachable, the resolver still works via:
//   - field_id (exact match)
//   - label (fuzzy match)
//   - field_index (positional)
//   - hint (disambiguation)
//   - css_selector (deprecated fallback)
//
// semantic_key resolution is the ONLY method that needs aliases.
// All other resolution methods work without any alias data.
//
// Exposes: window.ccSemanticAliases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

;(function () {
  'use strict';

  // Starts EMPTY. Populated by service at runtime.
  var aliases = {};
  var _loaded = false;
  var _source = 'none'; // 'none' | 'service' | 'cache' | 'fallback'

  /**
   * Load aliases from the service.
   * @param {string} backendUrl
   * @param {string} token — Bearer token
   * @returns {Promise<boolean>} true if loaded successfully
   */
  async function load(backendUrl, token) {
    if (!backendUrl) return false;
    try {
      var headers = { 'Authorization': 'Bearer ' + token };
      var res = await fetch(backendUrl + '/settings/semantic-aliases', { headers: headers });
      if (res.ok) {
        var data = await res.json();
        if (data && typeof data === 'object') {
          // Service returns { aliases: { key: [patterns...] } }
          var serviceAliases = data.aliases || data;
          replace(serviceAliases);
          _loaded = true;
          _source = 'service';
          return true;
        }
      }
    } catch (e) {
      // Service unreachable — try localStorage cache
      try {
        var cached = localStorage.getItem('cc_semantic_aliases');
        if (cached) {
          replace(JSON.parse(cached));
          _loaded = true;
          _source = 'cache';
          return true;
        }
      } catch (e2) { /* no cache available */ }
    }
    return false;
  }

  /**
   * Merge additional aliases (additive).
   * @param {object} newAliases — { semantic_key: [label_patterns...] }
   */
  function merge(newAliases) {
    if (!newAliases || typeof newAliases !== 'object') return;
    for (var key in newAliases) {
      if (!aliases[key]) {
        aliases[key] = newAliases[key];
      } else {
        var existing = aliases[key];
        newAliases[key].forEach(function (a) {
          if (existing.indexOf(a) === -1) existing.push(a);
        });
      }
    }
    _cacheAliases();
  }

  /**
   * Replace all aliases (full override from service).
   * @param {object} newAliases
   */
  function replace(newAliases) {
    if (!newAliases || typeof newAliases !== 'object') return;
    for (var k in aliases) delete aliases[k];
    for (var key in newAliases) aliases[key] = newAliases[key];
    _cacheAliases();
  }

  /**
   * Cache to localStorage for offline/degraded mode.
   */
  function _cacheAliases() {
    try {
      if (Object.keys(aliases).length > 0) {
        localStorage.setItem('cc_semantic_aliases', JSON.stringify(aliases));
      }
    } catch (e) { /* localStorage unavailable */ }
  }

  /**
   * Get the current alias dictionary.
   * @returns {object}
   */
  function getAll() {
    return aliases;
  }

  /**
   * Get load status.
   * @returns {{ loaded: boolean, source: string, count: number }}
   */
  function status() {
    return { loaded: _loaded, source: _source, count: Object.keys(aliases).length };
  }

  window.ccSemanticAliases = {
    aliases: aliases,
    load: load,
    merge: merge,
    replace: replace,
    getAll: getAll,
    status: status,
  };
})();

/* ==== legacy-fill-gate.js ==== */
/**
 * Phase 4.1 — legacy client-fill gate (permanently closed).
 *
 * All legacy client-side brain/planning paths are disabled. The server-driven
 * CcFillOrchestrator is the only fill execution path. This gate always returns
 * false regardless of storage state.
 *
 * This module is pure (no chrome.*). Unit tests import these helpers.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CcLegacyFillGate = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Storage key (chrome.storage.local). */
  const STORAGE_KEY = 'allowLegacyClientFill';

  /**
   * Phase 4.1: Legacy client-side brain paths are permanently disabled.
   * The server-driven product Fill (CcFillOrchestrator) is the only execution path.
   * This gate always returns false regardless of storage state.
   *
   * @param {object|null|undefined} _storageSlice - ignored (kept for API compat)
   * @returns {boolean} always false
   */
  function isLegacyClientFillAllowed(_storageSlice) {
    return false;
  }

  /**
   * @param {string} pathName - e.g. DISPATCH_JOB, agent, OPEN_AND_DISPATCH
   * @returns {{ ok: false, error: string, code: string }}
   */
  function legacyClientFillDenied(pathName) {
    const name = pathName || 'legacy client fill';
    return {
      ok: false,
      code: 'legacy_client_fill_disabled',
      error:
        name +
        ' is permanently disabled (Phase 4.1). Use side-panel Fill (server plan).',
    };
  }

  return {
    STORAGE_KEY,
    isLegacyClientFillAllowed,
    legacyClientFillDenied,
  };
});
