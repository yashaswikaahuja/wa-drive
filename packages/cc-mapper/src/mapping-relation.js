/**
 * mapping-relation — source atom + how to derive the widget value (#302).
 *
 * Long-lived mapping stores profileKey + relation (not literal actualValue).
 * Evidence from successful fills is used only to induce the relation.
 *
 * relation.kind:
 *   identity | last_n | first_n | date_part | email_local | name_part | unknown
 */

import { parseDobParts } from './split-dob.js';

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function profileAtom(profile, key) {
  if (!profile || key == null) return null;
  const entry = profile[key];
  if (entry == null) return null;
  const v = typeof entry === 'object' && entry && 'value' in entry ? entry.value : entry;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normLoose(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function fieldBlob(field) {
  if (!field || typeof field !== 'object') return '';
  return `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.placeholder || ''}`.toLowerCase();
}

/** Compound atoms that are often projected into part widgets. */
export function isCompoundAtom(profileKey) {
  return /^(dob|date_of_birth|phone|mobile|email|email_id|name|full_name|aadhaar_number|aadhaar|pan_number)$/i.test(
    String(profileKey || '')
  );
}

/**
 * Heuristic: widget looks like it wants a part/slice, not a full atom.
 */
export function looksLikePartField(field) {
  const blob = fieldBlob(field);
  const label = String(field?.label || '').trim();
  if (/^dd$|^day$|^mm$|^month$|^yyyy$|^yyy$|^year$/i.test(label)) return true;
  if (/\b(dob_?day|birth_?day|day_of_birth|ddl_?day)\b/.test(blob)) return true;
  if (/\b(dob_?month|birth_?month|month_of_birth|ddl_?month)\b/.test(blob)) return true;
  if (/\b(dob_?year|birth_?year|year_of_birth|ddl_?year)\b/.test(blob)) return true;
  if (/last\s*4|last\s*four|last\s*6|first\s*4|first\s*3|last\s*digits|otp|suffix/i.test(blob)) return true;
  if (/email\s*(user|id|name)|username|local.?part/i.test(blob)) return true;
  const maxLen = Number(field?.maxLength || field?.maxlength || 0);
  if (maxLen > 0 && maxLen <= 4) return true;
  return false;
}

export function shapeCompatible(field, value) {
  if (value == null) return false;
  const s = String(value);
  const maxLen = Number(field?.maxLength || field?.maxlength || 0);
  if (maxLen > 0 && s.length > maxLen) return false;
  const pattern = field?.pattern;
  if (pattern) {
    try {
      if (!new RegExp(`^(?:${pattern})$`).test(s)) return false;
    } catch {
      /* ignore bad pattern */
    }
  }
  return true;
}

/**
 * Normalize a saved mapping entry to a relation.
 * Legacy rows without relation:
 *   - part-looking field + compound atom → unknown (do not raw-dump)
 *   - otherwise → identity (keep existing full-atom maps working)
 */
export function normalizeRelation(entry, field) {
  if (entry && entry.relation && entry.relation.kind) {
    return { ...entry.relation };
  }
  const pk = entry?.profileKey;
  if (!pk) return { kind: 'unknown' };
  if (looksLikePartField(field) && isCompoundAtom(pk)) {
    return { kind: 'unknown' };
  }
  return { kind: 'identity' };
}

function applyDatePart(atom, part, field) {
  const dp = parseDobParts(atom);
  if (!dp) return null;
  const monthNum = parseInt(dp.month, 10) || 0;
  if (part === 'day') {
    const preferPadded =
      /^dd$/i.test(String(field?.label || '')) ||
      /^dd$/i.test(String(field?.placeholder || '')) ||
      (field?.type || '') === 'text';
    return preferPadded ? dp.day : String(parseInt(dp.day, 10));
  }
  if (part === 'month') {
    const t = String(field?.type || '').toLowerCase();
    if (t === 'select' || t === 'dropdown' || t === 'mat-select' || t === 'ng-dropdown') {
      return MONTH_NAMES[monthNum] || dp.month;
    }
    return dp.month;
  }
  if (part === 'year') return dp.year;
  return null;
}

/**
 * @returns {string|null} planned value, or null if cannot apply (caller → AI / other paths)
 */
export function applyRelation(relation, profile, profileKey, field) {
  const kind = relation?.kind || 'unknown';
  if (kind === 'unknown') return null;

  const atom = profileAtom(profile, profileKey);
  if (atom == null) return null;

  let value = null;
  if (kind === 'identity') {
    value = atom;
  } else if (kind === 'last_n') {
    const n = Math.max(1, Number(relation.n) || 0);
    if (!n || atom.length < n) return null;
    value = atom.slice(-n);
  } else if (kind === 'first_n') {
    const n = Math.max(1, Number(relation.n) || 0);
    if (!n || atom.length < n) return null;
    value = atom.slice(0, n);
  } else if (kind === 'date_part') {
    value = applyDatePart(atom, relation.part, field);
  } else if (kind === 'email_local') {
    const at = atom.indexOf('@');
    if (at <= 0) return null;
    value = atom.slice(0, at);
  } else if (kind === 'name_part') {
    const parts = atom.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    if (relation.part === 'first') value = parts[0];
    else if (relation.part === 'last') value = parts[parts.length - 1];
    else if (relation.part === 'middle') value = parts.length >= 3 ? parts.slice(1, -1).join(' ') : '';
    else return null;
  } else {
    return null;
  }

  if (value == null || String(value).trim() === '') return null;
  if (!shapeCompatible(field, value)) return null;
  return String(value);
}

/**
 * Induce relation from a successful fill value vs a profile atom.
 * Returns { kind: 'unknown' } when unsafe / unclear.
 */
export function induceRelation(profile, profileKey, actualOrPlanned, field) {
  if (!profileKey) return { kind: 'unknown' };
  const atom = profileAtom(profile, profileKey);
  const sample = actualOrPlanned == null ? '' : String(actualOrPlanned).trim();
  if (!atom || !sample) {
    if (looksLikePartField(field) && isCompoundAtom(profileKey)) return { kind: 'unknown' };
    return profileKey ? { kind: 'identity' } : { kind: 'unknown' };
  }

  if (normLoose(sample) === normLoose(atom) && shapeCompatible(field, atom)) {
    return { kind: 'identity' };
  }

  // date parts
  const dp = parseDobParts(atom);
  if (dp) {
    const sn = normLoose(sample);
    const dayN = String(parseInt(dp.day, 10));
    const monthN = String(parseInt(dp.month, 10));
    if (sn === normLoose(dp.day) || sn === normLoose(dayN)) {
      return { kind: 'date_part', part: 'day', pad: dp.day.startsWith('0') ? 2 : undefined };
    }
    if (
      sn === normLoose(dp.month) ||
      sn === normLoose(monthN) ||
      sn === normLoose(MONTH_NAMES[parseInt(dp.month, 10)] || '')
    ) {
      return { kind: 'date_part', part: 'month' };
    }
    if (sn === normLoose(dp.year)) {
      return { kind: 'date_part', part: 'year' };
    }
  }

  // email local (before first_n — "john" is prefix of "john@…")
  if (atom.includes('@')) {
    const local = atom.slice(0, atom.indexOf('@'));
    if (normLoose(sample) === normLoose(local)) {
      return { kind: 'email_local' };
    }
  }

  // last_n / first_n
  if (atom.endsWith(sample) && sample.length < atom.length && sample.length <= 8) {
    return { kind: 'last_n', n: sample.length };
  }
  if (atom.startsWith(sample) && sample.length < atom.length && sample.length <= 8) {
    return { kind: 'first_n', n: sample.length };
  }

  // name parts
  const nameParts = atom.split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) {
    if (normLoose(sample) === normLoose(nameParts[0])) return { kind: 'name_part', part: 'first' };
    if (normLoose(sample) === normLoose(nameParts[nameParts.length - 1])) {
      return { kind: 'name_part', part: 'last' };
    }
    if (nameParts.length >= 3) {
      const mid = nameParts.slice(1, -1).join(' ');
      if (normLoose(sample) === normLoose(mid)) return { kind: 'name_part', part: 'middle' };
    }
  }

  // Partial sample that doesn't cleanly match → unknown (never teach raw dump)
  if (looksLikePartField(field) || sample.length < atom.length) {
    return { kind: 'unknown' };
  }

  return { kind: 'unknown' };
}

/**
 * Materialize planned values from taught mappings using relations.
 * Mutates `mapping` / `filledBySource`. Skips selectors already planned.
 */
export function materializeSavedRelations(fields, profile, savedMap, mapping, filledBySource, sourceTag) {
  if (!savedMap || typeof savedMap !== 'object') return 0;
  const gsk = (l) =>
    String(l || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  let added = 0;
  const map = mapping || {};
  const fbs = filledBySource || {};
  for (const f of fields || []) {
    if (!f?.selector || map[f.selector]) continue;
    // Choice widgets need option resolution — leave to caller.
    if (/radio|checkbox/i.test(String(f.type || ''))) continue;
    const entry = savedMap[gsk(f.label)] || savedMap[gsk(f.name)] || null;
    if (!entry?.profileKey) continue;
    const relation = normalizeRelation(entry, f);
    const value = applyRelation(relation, profile, entry.profileKey, f);
    if (value == null) continue;
    map[f.selector] = {
      value,
      type: f.type,
      label: f.label,
      profileKey: entry.profileKey,
      relation,
      matchBy: sourceTag || 'saved-relation',
    };
    fbs[f.selector] = {
      label: f.label || '',
      profileKey: entry.profileKey,
      relation,
      source: sourceTag || 'saved-relation',
    };
    added++;
  }
  return added;
}
