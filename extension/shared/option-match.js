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
