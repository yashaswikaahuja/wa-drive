/**
 * resolve-choice — Map planned value onto radio/checkbox option selector
 *
 * Given a field descriptor and a planned value string, finds the matching
 * option selector (radio-click, checkbox, mat-checkbox). Returns null if
 * no safe match found — never dumps free-text onto choice widgets.
 *
 * Public API (on globalThis.CcResolveChoice):
 *   resolveChoiceToOption(field, plannedValue, profileKey) => { selector, entry } | null
 *
 * See docs/resolve-choice.md for full documentation.
 */
(function (root) {
  'use strict';

  function normChoice(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function looksLikeYesNo(opts) {
    return opts.length > 0 && opts.every(function (o) {
      var n = normChoice(o);
      return !n || n === 'yes' || n === 'no' || n === 'y' || n === 'n'
        || n === 'haan' || n === 'nahi' || n === 'true' || n === 'false'
        || n === '1' || n === '0';
    });
  }

  /**
   * @param {object} field         — form field descriptor
   * @param {string} plannedValue  — value from profile
   * @param {string} profileKey    — profile key (for record keeping)
   * @returns {{ selector, entry } | null}
   */
  function resolveChoiceToOption(field, plannedValue, profileKey) {
    if (!field || plannedValue == null || String(plannedValue).trim() === '') return null;
    var planned = String(plannedValue).trim();
    var plannedNorm = normChoice(planned);
    var type = field.type || '';
    var opts = field.options || [];
    var isYesNo = looksLikeYesNo(opts);

    // Reject free-text dumps on Yes/No style groups
    if (isYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) return null;
    if (isYesNo && /^\d{8,}$/.test(plannedNorm)) return null;

    // ── radio-group ──
    if (type === 'radio-group' && field.options && field.optionSelectors) {
      var matchedIdx = -1;
      // Exact match
      for (var oi = 0; oi < opts.length; oi++) {
        if (normChoice(opts[oi]) === plannedNorm) { matchedIdx = oi; break; }
      }
      // Partial match (≥70% overlap)
      if (matchedIdx < 0) {
        for (var oi2 = 0; oi2 < opts.length; oi2++) {
          var optN = normChoice(opts[oi2]);
          var shorter = optN.length < plannedNorm.length ? optN : plannedNorm;
          var longer  = optN.length < plannedNorm.length ? plannedNorm : optN;
          if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
            matchedIdx = oi2; break;
          }
        }
      }
      // Gender synonyms
      if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(planned + opts.join(' '))) {
        var wantFemale = /female|f\b|woman|महिला|स्त्री/.test(planned.toLowerCase());
        var wantMale   = /male|m\b|man|पुरुष/.test(planned.toLowerCase()) && !wantFemale;
        var wantOther  = /other|third|trans|तृतीय/.test(planned.toLowerCase());
        for (var gi = 0; gi < opts.length; gi++) {
          var ol = opts[gi].toLowerCase();
          if (wantFemale && /female|महिला|स्त्री|f\b/.test(ol))              { matchedIdx = gi; break; }
          if (wantMale   && /male|पुरुष|m\b/.test(ol) && !/female|third/.test(ol)) { matchedIdx = gi; break; }
          if (wantOther  && /other|third|trans|तृतीय/.test(ol))               { matchedIdx = gi; break; }
        }
      }
      // Yes/No synonyms
      if (matchedIdx < 0 && isYesNo) {
        var wantYes = /^(yes|y|true|1|haan|हां)$/i.test(planned);
        var wantNo  = /^(no|n|false|0|nahi|नहीं)$/i.test(planned);
        for (var yi = 0; yi < opts.length; yi++) {
          var yn = normChoice(opts[yi]);
          if (wantYes && (yn === 'yes' || yn === 'y' || yn === 'true' || yn === '1' || yn === 'haan')) { matchedIdx = yi; break; }
          if (wantNo  && (yn === 'no'  || yn === 'n' || yn === 'false' || yn === '0' || yn === 'nahi')) { matchedIdx = yi; break; }
        }
      }
      if (matchedIdx < 0 || !field.optionSelectors[matchedIdx]) return null;
      return {
        selector: field.optionSelectors[matchedIdx],
        entry: { value: opts[matchedIdx], type: 'radio-click', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── radio (single) ──
    if (type === 'radio') {
      return {
        selector: field.selector,
        entry: { value: 'true', type: 'radio-click', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── checkbox / mat-checkbox / checkbox-agreement ──
    if (type === 'checkbox' || type === 'mat-checkbox' || type === 'checkbox-agreement') {
      var truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(planned);
      var falsy  = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
      if (!truthy && !falsy) return null;
      return {
        selector: field.selector,
        entry: { value: truthy ? 'yes' : 'no', type: type === 'mat-checkbox' ? 'mat-checkbox' : 'checkbox', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    // ── checkbox-group ──
    if (type === 'checkbox-group' && field.options && field.optionSelectors) {
      if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(planned) && plannedNorm.length > 6) return null;
      var wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(planned);
      if (!wantCheck) return null;
      var cIdx = -1;
      for (var ci = 0; ci < opts.length; ci++) {
        if (normChoice(opts[ci]) === plannedNorm) { cIdx = ci; break; }
      }
      if (cIdx < 0 && field.optionSelectors.length >= 1) cIdx = 0;
      if (cIdx < 0) return null;
      return {
        selector: field.optionSelectors[cIdx],
        entry: { value: 'yes', type: 'checkbox', profileKey: profileKey || null, label: field.label, matchBy: 'choice-resolve' },
      };
    }

    return null;
  }

  root.CcResolveChoice = { resolveChoiceToOption: resolveChoiceToOption };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcResolveChoice;
