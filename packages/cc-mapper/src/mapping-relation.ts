/**
 * mapping-relation — source atom + how to derive the widget value (#302).
 *
 * Long-lived mapping stores profileKey + relation (not literal actualValue).
 * Evidence from successful fills is used only to induce the relation.
 *
 * relation.kind:
 *   identity | last_n | first_n | date_part | email_local | name_part | unknown
 */

import type { FormField, Mapping } from './types.ts';
import { parseDobParts } from './split-dob.ts';

/** Profile may hold plain atoms or `{ value }` wrappers from Hub/extraction. */
export type RelationProfile = Record<string, unknown>;

export type Relation =
  | { kind: 'unknown' }
  | { kind: 'identity' }
  | { kind: 'last_n'; n: number }
  | { kind: 'first_n'; n: number }
  | { kind: 'date_part'; part: 'day' | 'month' | 'year'; pad?: number }
  | { kind: 'email_local' }
  | { kind: 'name_part'; part: 'first' | 'middle' | 'last' };

export type SavedMappingEntry = {
  profileKey?: string | null;
  relation?: Relation | null;
  [key: string]: unknown;
};

export type FilledBySource = Record<
  string,
  {
    label: string;
    profileKey: string;
    relation: Relation;
    source: string;
  }
>;

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

export function profileAtom(profile: RelationProfile | null | undefined, key: string | null | undefined): string | null {
  if (!profile || key == null) return null;
  const entry = profile[key];
  if (entry == null) return null;
  const v =
    typeof entry === 'object' && entry && 'value' in (entry as object)
      ? (entry as { value: unknown }).value
      : entry;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normLoose(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function fieldBlob(field: FormField | null | undefined): string {
  if (!field || typeof field !== 'object') return '';
  return `${field.label || ''} ${field.name || ''} ${field.id || ''} ${field.placeholder || ''}`.toLowerCase();
}

/** Compound atoms that are often projected into part widgets. */
export function isCompoundAtom(profileKey: string | null | undefined): boolean {
  return /^(dob|date_of_birth|phone|mobile|email|email_id|name|full_name|aadhaar_number|aadhaar|pan_number)$/i.test(
    String(profileKey || '')
  );
}

/**
 * Heuristic: widget looks like it wants a part/slice, not a full atom.
 */
export function looksLikePartField(field: FormField | null | undefined): boolean {
  const blob = fieldBlob(field);
  const label = String(field?.label || '').trim();
  if (/^dd$|^day$|^mm$|^month$|^yyyy$|^yyy$|^year$/i.test(label)) return true;
  if (/\b(dob_?day|birth_?day|day_of_birth|ddl_?day)\b/.test(blob)) return true;
  if (/\b(dob_?month|birth_?month|month_of_birth|ddl_?month)\b/.test(blob)) return true;
  if (/\b(dob_?year|birth_?year|year_of_birth|ddl_?year)\b/.test(blob)) return true;
  if (/last\s*4|last\s*four|last\s*6|first\s*4|first\s*3|last\s*digits|otp|suffix/i.test(blob)) return true;
  if (/email\s*(user|id|name)|username|local.?part/i.test(blob)) return true;
  // Do NOT treat maxLength alone as part-field — that skipped AI on many short full-value inputs.
  return false;
}

export function shapeCompatible(field: FormField | null | undefined, value: unknown): boolean {
  if (value == null) return false;
  const s = String(value);
  const maxLen = Number((field as { maxLength?: number; maxlength?: number } | null | undefined)?.maxLength
    || (field as { maxlength?: number } | null | undefined)?.maxlength
    || 0);
  if (maxLen > 0 && s.length > maxLen) return false;
  const pattern = (field as { pattern?: string } | null | undefined)?.pattern;
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
export function normalizeRelation(entry: SavedMappingEntry | null | undefined, field: FormField | null | undefined): Relation {
  if (entry && entry.relation && entry.relation.kind) {
    return { ...entry.relation };
  }
  const pk = entry?.profileKey;
  if (!pk) return { kind: 'unknown' };
  // Legacy bare profileKey on a part-looking widget → do not raw-dump.
  if (looksLikePartField(field) && isCompoundAtom(pk)) {
    return { kind: 'unknown' };
  }
  return { kind: 'identity' };
}

/** Higher = more specific / safer to keep when merging sync updates. */
export function relationStrength(rel: Relation | null | undefined): number {
  if (!rel || !rel.kind || rel.kind === 'unknown') return 0;
  if (rel.kind === 'identity') return 2;
  return 3;
}

function applyDatePart(atom: string, part: unknown, field: FormField | null | undefined): string | null {
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
 * @returns planned value, or null if cannot apply (caller → AI / other paths)
 */
export function applyRelation(
  relation: Relation | null | undefined,
  profile: RelationProfile | null | undefined,
  profileKey: string | null | undefined,
  field: FormField | null | undefined,
): string | null {
  const kind = relation?.kind || 'unknown';
  if (kind === 'unknown') return null;

  const atom = profileAtom(profile, profileKey);
  if (atom == null) return null;

  let value: string | null = null;
  if (kind === 'identity') {
    value = atom;
  } else if (kind === 'last_n') {
    const n = Math.max(1, Number((relation as { n?: number }).n) || 0);
    if (!n || atom.length < n) return null;
    value = atom.slice(-n);
  } else if (kind === 'first_n') {
    const n = Math.max(1, Number((relation as { n?: number }).n) || 0);
    if (!n || atom.length < n) return null;
    value = atom.slice(0, n);
  } else if (kind === 'date_part') {
    value = applyDatePart(atom, (relation as { part?: string }).part, field);
  } else if (kind === 'email_local') {
    const at = atom.indexOf('@');
    if (at <= 0) return null;
    value = atom.slice(0, at);
  } else if (kind === 'name_part') {
    const parts = atom.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const namePart = (relation as { part?: string }).part;
    if (namePart === 'first') value = parts[0];
    else if (namePart === 'last') value = parts[parts.length - 1];
    else if (namePart === 'middle') value = parts.length >= 3 ? parts.slice(1, -1).join(' ') : '';
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
export function induceRelation(
  profile: RelationProfile | null | undefined,
  profileKey: string | null | undefined,
  actualOrPlanned: unknown,
  field: FormField | null | undefined,
): Relation {
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

  const blob = fieldBlob(field);
  const partish = looksLikePartField(field);
  const dateish =
    partish || /\b(date|dob|birth|day|month|year|dd|mm|yyyy)\b/i.test(blob);
  const nameish = partish || /\b(name|first|middle|last|surname|fname|lname)\b/i.test(blob);
  const sliceish =
    partish || /last\s*\d|first\s*\d|last\s*digit|suffix|prefix/i.test(blob);

  // date parts — ONLY when the field looks date-related (prevents nationality←dob day)
  const dp = parseDobParts(atom);
  if (dp && dateish) {
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
  if (atom.includes('@') && (partish || /email|user|local/i.test(blob))) {
    const local = atom.slice(0, atom.indexOf('@'));
    if (normLoose(sample) === normLoose(local)) {
      return { kind: 'email_local' };
    }
  }

  // last_n / first_n — only when field suggests a slice
  if (sliceish) {
    if (atom.endsWith(sample) && sample.length < atom.length && sample.length <= 8) {
      return { kind: 'last_n', n: sample.length };
    }
    if (atom.startsWith(sample) && sample.length < atom.length && sample.length <= 8) {
      return { kind: 'first_n', n: sample.length };
    }
  }

  // name parts
  if (nameish) {
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
  }

  // Unclear / partial evidence → unknown (caller must not overwrite a stronger existing relation).
  return { kind: 'unknown' };
}

/**
 * Materialize planned values from taught mappings using relations.
 * Mutates `mapping` / `filledBySource`. Skips selectors already planned.
 */
function labelKeys(label: unknown): string[] {
  const raw = String(label || '')
    .toLowerCase()
    .trim();
  if (!raw) return [];
  const stripped = raw.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const spaced = raw.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  if (stripped) out.push(stripped);
  if (spaced && spaced !== stripped) out.push(spaced);
  return out;
}

function lookupSavedEntry(
  savedMap: Record<string, SavedMappingEntry> | null | undefined,
  field: FormField,
): SavedMappingEntry | null {
  if (!savedMap || !field) return null;
  const keys = [...labelKeys(field.label), ...labelKeys(field.name)];
  for (const k of keys) {
    if (savedMap[k]?.profileKey) return savedMap[k];
  }
  for (const k of keys) {
    if (savedMap[k]) return savedMap[k];
  }
  return null;
}

/** Travel/journey fields must never receive identity atoms (#308). */
function isTravelJourneyField(field: FormField | null | undefined): boolean {
  const raw = [field?.label, field?.name, field?.id, field?.placeholder, (field as { selector?: string })?.selector]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!raw.trim()) return false;
  if (/police[_\s-]?station|\bthana\b/.test(raw)) return false;
  return /\b(from|to|destination|origin|boarding|departure|arrival|journey|train|flight|airport|pnr|berth|quota)\b/.test(raw)
    || /\b(from|to)[_\s-]?station\b/.test(raw)
    || /\bstation\b/.test(raw);
}

const IDENTITY_PROFILE_KEYS = new Set([
  'dob', 'date_of_birth', 'dob__day', 'dob__month', 'dob__year',
  'name', 'first_name', 'last_name', 'middle_name', 'full_name',
  'father_name', 'mother_name', 'husband_name', 'guardian_name',
  'aadhaar', 'aadhaar_number', 'aadhar', 'pan', 'pan_number',
  'voter_id', 'passport', 'gender', 'sex', 'email', 'email_id',
  'phone', 'mobile', 'mobile_number',
]);

export function materializeSavedRelations(
  fields: FormField[] | null | undefined,
  profile: RelationProfile | null | undefined,
  savedMap: Record<string, SavedMappingEntry> | null | undefined,
  mapping: Mapping | null | undefined,
  filledBySource: FilledBySource | null | undefined,
  sourceTag?: string,
): number {
  if (!savedMap || typeof savedMap !== 'object') return 0;
  let added = 0;
  const map = mapping || ({} as Mapping);
  const fbs = filledBySource || ({} as FilledBySource);
  for (const f of fields || []) {
    if (!f?.selector || map[f.selector]) continue;
    // Choice widgets need option resolution — leave to caller.
    if (/radio|checkbox/i.test(String(f.type || ''))) continue;
    const entry = lookupSavedEntry(savedMap, f);
    if (!entry?.profileKey) continue;
    // Never materialize dob/name/IDs into From/To/station (#308 IRCTC).
    if (isTravelJourneyField(f) && IDENTITY_PROFILE_KEYS.has(String(entry.profileKey))) continue;
    const relation = normalizeRelation(entry, f);
    const value = applyRelation(relation, profile, entry.profileKey, f);
    if (value == null) continue;
    map[f.selector] = {
      value,
      type: f.type || '',
      label: f.label || null,
      profileKey: entry.profileKey,
      matchBy: sourceTag || 'saved-relation',
      relation,
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
