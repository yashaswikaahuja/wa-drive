/**
 * AUTO-GENERATED
 * Source: autofill/rule-engine/capabilities/*.js + rule-engine.js
 * Rebuild: node extension/autofill/build-rule-engine-bundle.mjs
 */

/* ==== rule-engine/capabilities/rule-engine.js ==== */
/**
 * rule-engine — Saved field-mapping rule evaluator
 *
 * Pure evaluation of a saved mapping entry against a profile.
 * Produces a concrete fill action. Shared shape with the admin
 * Mappings rule builder: { fillMode, profileKey, constantValue, rules, fallback }.
 *
 * Public API (on globalThis.CcRuleEngine):
 *   evaluateField(entry, field, profile, translations) => fill action
 *
 * Returns one of:
 *   { kind:'value', value }
 *   { kind:'option', option }
 *   { kind:'check', check:boolean }
 *   { kind:'checkOptions', options:[] }
 *   { kind:'skip' }
 *
 * See docs/rule-engine.md for full documentation.
 */
(function (root) {
  'use strict';

  function normVal(v) { return (v == null ? '' : String(v)).trim().toLowerCase(); }

  function typeGroup(t) {
    if (t === 'dropdown' || t === 'select' || t === 'mat-select' || t === 'ng-dropdown') return 'dropdown';
    if (t === 'radio' || t === 'radio-group' || t === 'mat-radio') return 'radio';
    if (t === 'checkbox' || t === 'checkbox-group' || t === 'checkbox-agreement' || t === 'mat-checkbox') return 'checkbox';
    if (t === 'date') return 'date';
    return 'text';
  }

  function condMet(cond, profile) {
    if (!cond || !cond.key) return false;
    var val    = normVal(profile[cond.key]);
    var target = normVal(cond.value);
    switch (cond.op) {
      case 'eq':       return val === target;
      case 'neq':      return val !== target;
      case 'contains': return target.length > 0 && val.includes(target);
      case 'notEmpty': return val.length > 0;
      case 'empty':    return val.length === 0;
      default:         return false;
    }
  }

  function ruleMet(rule, profile) {
    var conds = (rule && rule.when) || [];
    if (!conds.length) return false;
    return conds.every(function (c) { return condMet(c, profile); });
  }

  function formatDate(value, hintText) {
    if (!value) return value;
    var m = String(value).match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
    if (!m) return value;
    var d, mo, y;
    if (m[1].length === 4) { y = m[1]; mo = m[2]; d = m[3]; }
    else { d = m[1]; mo = m[2]; y = m[3]; }
    d = d.padStart(2, '0'); mo = mo.padStart(2, '0');
    if (y.length === 2) y = '20' + y;
    var hint = (hintText || '').toLowerCase();
    var sep = hint.includes('-') ? '-' : (hint.includes('.') ? '.' : '/');
    if (/yyyy.{0,2}mm.{0,2}dd/.test(hint) || (hint.indexOf('yyyy') >= 0 && hint.indexOf('yyyy') < hint.indexOf('dd'))) {
      return [y, mo, d].join(sep);
    }
    return [d, mo, y].join(sep);
  }

  /**
   * @param {object} entry        — saved mapping entry
   * @param {object} field        — form field descriptor
   * @param {object} profile      — flattened profile
   * @param {object} translations — option translation map
   * @returns {{ kind, value?, option?, check?, options? }}
   */
  function evaluateField(entry, field, profile, translations) {
    if (!entry) return { kind: 'skip' };
    var type = (field && field.type) || entry.type || 'text';
    var grp = typeGroup(type);
    var options = (field && field.options) || entry.options || [];
    var placeholder = (field && field.placeholder) || '';
    var mode = entry.fillMode;
    if (!mode) mode = entry.profileKey ? 'match' : (type === 'checkbox-agreement' ? 'always' : 'skip');

    if (mode === 'skip')   return { kind: 'skip' };
    if (mode === 'always') return { kind: 'check', check: true };

    if (mode === 'constant') {
      if (grp === 'checkbox') return { kind: 'check', check: true };
      return entry.constantValue ? { kind: 'option', option: entry.constantValue } : { kind: 'skip' };
    }

    if (mode === 'match') {
      if (grp === 'checkbox') {
        var listv = entry.profileKey ? profile[entry.profileKey] : null;
        if (listv == null || listv === '') return { kind: 'skip' };
        var parts = String(listv).split(/[,;/|]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var checks = options.filter(function (o) {
          return parts.some(function (p) { return normVal(o).includes(normVal(p)) || normVal(p).includes(normVal(o)); });
        });
        return checks.length ? { kind: 'checkOptions', options: checks } : { kind: 'skip' };
      }
      if (grp === 'radio' || grp === 'dropdown') {
        var val = entry.profileKey ? profile[entry.profileKey] : null;
        if (val == null || val === '') return { kind: 'skip' };
        var ccMatch = typeof window !== 'undefined' && window.ccMatchOption;
        var opt = ccMatch ? ccMatch(val, options, { translations: translations, excludePlaceholders: false }) : null;
        return opt ? { kind: 'option', option: opt } : { kind: 'option', option: String(val) };
      }
      // text / date
      var v = entry.profileKey ? profile[entry.profileKey] : null;
      if (v == null || v === '') return { kind: 'skip' };
      if (grp === 'date') v = formatDate(v, placeholder);
      return { kind: 'value', value: String(v) };
    }

    if (mode === 'condition') {
      var rules = entry.rules || [];
      if (grp === 'checkbox') {
        var isMulti = type === 'checkbox-group' || options.length > 1;
        if (isMulti) {
          var condChecks = [];
          for (var i = 0; i < rules.length; i++) {
            if (ruleMet(rules[i], profile) && rules[i].then && rules[i].then !== 'check') condChecks.push(rules[i].then);
          }
          return condChecks.length ? { kind: 'checkOptions', options: condChecks } : { kind: 'skip' };
        }
        return { kind: 'check', check: rules.some(function (r) { return ruleMet(r, profile); }) };
      }
      for (var ri = 0; ri < rules.length; ri++) {
        if (ruleMet(rules[ri], profile) && rules[ri].then) return { kind: 'option', option: rules[ri].then };
      }
      return entry.fallback ? { kind: 'option', option: entry.fallback } : { kind: 'skip' };
    }

    return { kind: 'skip' };
  }

  root.CcRuleEngine = {
    evaluateField: evaluateField,
    _normVal: normVal,
    _typeGroup: typeGroup,
    _condMet: condMet,
    _ruleMet: ruleMet,
    _formatDate: formatDate,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== rule-engine.js (facade) ==== */
// rule-engine.js — thin facade over CcRuleEngine capability
function ccNormVal(v) {
  var _re = globalThis.CcRuleEngine || {};
  return _re._normVal ? _re._normVal(v) : (v == null ? '' : String(v)).trim().toLowerCase();
}
function ccTypeGroup(t) {
  var _re = globalThis.CcRuleEngine || {};
  return _re._typeGroup ? _re._typeGroup(t) : 'text';
}
function ccEvaluateField(entry, field, profile, translations) {
  var _re = globalThis.CcRuleEngine || {};
  if (_re.evaluateField) return _re.evaluateField(entry, field, profile, translations);
  return { kind: 'skip' };
}
