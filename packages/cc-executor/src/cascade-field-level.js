/**
 * cascade-field-level — Cascade Geography Level Identifier
 *
 * Identifies which level of India's administrative cascade hierarchy a form field
 * belongs to, and provides the parent-dependency map (which levels must be settled
 * before a given level can be filled).
 *
 * Pure JavaScript — no DOM, no Chrome, no imports.
 * Safe to use in browser (executor) and Node.js (extension-service fill planner).
 *
 * Public API (on globalThis.CcCascadeFieldLevel):
 *   cascadeFieldLevel(label, profileKey, selector) => string
 *   CASCADE_PARENTS: Record<string, string[]>
 *
 * See cascade-field-level.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Parent-dependency map.
   * For each cascade level, lists which levels must be filled and settled first.
   * 'state' has no entry — it has no parents.
   *
   * @type {Record<string, string[]>}
   */
  var CASCADE_PARENTS = {
    district:       ['state'],
    sub_division:   ['district', 'state'],
    block:          ['district', 'sub_division', 'state'],
    panchayat:      ['block', 'district'],
    village:        ['block', 'district'],
    police_station: ['district', 'block'],
    post_office:    ['block', 'village', 'district'],
  };

  /**
   * Identify which cascade level a form field belongs to.
   *
   * Concatenates profileKey + label + selector (all lower-cased) and tests
   * against English and Hindi Unicode keyword patterns for each cascade level.
   *
   * Returns the level name ('state', 'district', 'sub_division', 'block',
   * 'panchayat', 'village', 'police_station', 'post_office', 'pin_code')
   * or '' if the field does not belong to any cascade level.
   *
   * Never throws. Null/undefined inputs are treated as empty strings.
   *
   * @param {string|null|undefined} label      Field label text from the form DOM
   * @param {string|null|undefined} profileKey Profile data key (e.g. 'state')
   * @param {string|null|undefined} selector   CSS selector or form-field-N string
   * @returns {string}
   */
  function cascadeFieldLevel(label, profileKey, selector) {
    var s = ((profileKey || '') + ' ' + (label || '') + ' ' + (selector || '')).toLowerCase();

    // sub_division must be tested before state to avoid 'sub division' matching 'state'
    if (/sub[_\s-]*div|अनुमंडल|subdivision/.test(s)) return 'sub_division';

    // state: only match if 'sub' is not also present (prevents sub_division misclassification)
    if (/state|rajya|राज्य/.test(s) && !/sub/.test(s)) return 'state';

    if (/district|jila|जिला/.test(s)) return 'district';
    if (/block|prakhand|प्रखंड|tehsil|taluka/.test(s)) return 'block';
    if (/panchayat|पंचायत/.test(s)) return 'panchayat';
    if (/village|gram|ग्राम|mohalla|मोहल्ला/.test(s)) return 'village';
    if (/police|thana|थाना/.test(s)) return 'police_station';
    if (/post[_\s-]*office|डाक/.test(s)) return 'post_office';
    if (/\bpin\b|pincode|pin[_\s-]*code|पिन/.test(s)) return 'pin_code';

    return '';
  }

  root.CcCascadeFieldLevel = {
    cascadeFieldLevel: cascadeFieldLevel,
    CASCADE_PARENTS: CASCADE_PARENTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcCascadeFieldLevel;
