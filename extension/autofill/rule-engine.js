// ── Rule engine (runs in page context) ─────────────────────────────────────
// Pure evaluation of a saved field-mapping entry against a customer profile.
// Produces a concrete fill ACTION the fill code applies. Shared shape with the
// admin Mappings rule builder: { fillMode, profileKey, constantValue, rules, fallback }.

function ccNormVal(v) { return (v == null ? '' : String(v)).trim().toLowerCase(); }

function ccTypeGroup(t) {
  if (t === 'dropdown' || t === 'select' || t === 'mat-select' || t === 'ng-dropdown') return 'dropdown';
  if (t === 'radio' || t === 'radio-group' || t === 'mat-radio') return 'radio';
  if (t === 'checkbox' || t === 'checkbox-group' || t === 'checkbox-agreement' || t === 'mat-checkbox') return 'checkbox';
  if (t === 'date') return 'date';
  return 'text';
}

function ccCondMet(cond, profile) {
  if (!cond || !cond.key) return false;
  const val = ccNormVal(profile[cond.key]);
  const target = ccNormVal(cond.value);
  switch (cond.op) {
    case 'eq': return val === target;
    case 'neq': return val !== target;
    case 'contains': return target.length > 0 && val.includes(target);
    case 'notEmpty': return val.length > 0;
    case 'empty': return val.length === 0;
    default: return false;
  }
}

// A rule fires when ALL its conditions are met (AND). Empty condition list = never.
function ccRuleMet(rule, profile) {
  const conds = (rule && rule.when) || [];
  if (!conds.length) return false;
  return conds.every(c => ccCondMet(c, profile));
}

// Match a profile value to one of the field's option texts.
// Uses shared/option-match.js (window.ccMatchOption) injected before rule-engine runs.

// Format a date string to a target format inferred from a placeholder/pattern.
// Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD (+ the same with / or -).
function ccFormatDate(value, hintText) {
  if (!value) return value;
  const m = String(value).match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
  if (!m) return value;
  let d, mo, y;
  // Decide input order: if first group is 4 digits → YYYY-MM-DD, else DD-MM-YYYY
  if (m[1].length === 4) { y = m[1]; mo = m[2]; d = m[3]; }
  else { d = m[1]; mo = m[2]; y = m[3]; }
  d = d.padStart(2, '0'); mo = mo.padStart(2, '0'); if (y.length === 2) y = '20' + y;
  const hint = (hintText || '').toLowerCase();
  const sep = hint.includes('-') ? '-' : (hint.includes('.') ? '.' : '/');
  if (/yyyy.{0,2}mm.{0,2}dd/.test(hint) || (hint.indexOf('yyyy') >= 0 && hint.indexOf('yyyy') < hint.indexOf('dd'))) {
    return [y, mo, d].join(sep);
  }
  return [d, mo, y].join(sep);
}

/**
 * Evaluate a saved mapping entry → fill action.
 * Returns one of:
 *   { kind:'value', value }              text/date/native input value
 *   { kind:'option', option }            radio/dropdown → select this option text
 *   { kind:'check', check:boolean }      single checkbox
 *   { kind:'checkOptions', options:[] }  multi checkbox
 *   { kind:'skip' }
 */
function ccEvaluateField(entry, field, profile, translations) {
  if (!entry) return { kind: 'skip' };
  const type = (field && field.type) || entry.type || 'text';
  const grp = ccTypeGroup(type);
  const options = (field && field.options) || entry.options || [];
  const placeholder = (field && field.placeholder) || '';
  let mode = entry.fillMode;
  if (!mode) mode = entry.profileKey ? 'match' : (type === 'checkbox-agreement' ? 'always' : 'skip');

  if (mode === 'skip') return { kind: 'skip' };
  if (mode === 'always') return { kind: 'check', check: true };

  if (mode === 'constant') {
    if (grp === 'checkbox') return { kind: 'check', check: true };
    return entry.constantValue ? { kind: 'option', option: entry.constantValue } : { kind: 'skip' };
  }

  if (mode === 'match') {
    if (grp === 'checkbox') {
      const listv = entry.profileKey ? profile[entry.profileKey] : null;
      if (listv == null || listv === '') return { kind: 'skip' };
      const parts = String(listv).split(/[,;/|]/).map(s => s.trim()).filter(Boolean);
      const checks = options.filter(o => parts.some(p => ccNormVal(o).includes(ccNormVal(p)) || ccNormVal(p).includes(ccNormVal(o))));
      return checks.length ? { kind: 'checkOptions', options: checks } : { kind: 'skip' };
    }
    if (grp === 'radio' || grp === 'dropdown') {
      const val = entry.profileKey ? profile[entry.profileKey] : null;
      if (val == null || val === '') return { kind: 'skip' };
      const opt = window.ccMatchOption(val, options, { translations: translations, excludePlaceholders: false });
      return opt ? { kind: 'option', option: opt } : { kind: 'option', option: String(val) };
    }
    // text / date
    let v = entry.profileKey ? profile[entry.profileKey] : null;
    if (v == null || v === '') return { kind: 'skip' };
    if (grp === 'date') v = ccFormatDate(v, placeholder);
    return { kind: 'value', value: String(v) };
  }

  if (mode === 'condition') {
    const rules = entry.rules || [];
    if (grp === 'checkbox') {
      const isMulti = type === 'checkbox-group' || options.length > 1;
      if (isMulti) {
        const checks = [];
        for (const r of rules) { if (ccRuleMet(r, profile) && r.then && r.then !== 'check') checks.push(r.then); }
        return checks.length ? { kind: 'checkOptions', options: checks } : { kind: 'skip' };
      }
      return { kind: 'check', check: rules.some(r => ccRuleMet(r, profile)) };
    }
    // radio / dropdown: first matching rule wins, else fallback
    for (const r of rules) { if (ccRuleMet(r, profile) && r.then) return { kind: 'option', option: r.then }; }
    return entry.fallback ? { kind: 'option', option: entry.fallback } : { kind: 'skip' };
  }

  return { kind: 'skip' };
}
