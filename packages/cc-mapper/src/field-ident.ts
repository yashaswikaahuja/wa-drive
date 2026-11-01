/**
 * field-ident — Field identity normalisation helpers
 */
import type { FormField, LabelIdent } from './types.ts';

/**
 * Travel / journey fields that must never receive identity profile atoms
 * (dob, aadhaar, name, etc.) — e.g. IRCTC From/To station (#308).
 * Excludes police_station / thana (address parts).
 */
export function isTravelJourneyField(field: {
  label?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
  selector?: string | null;
} | null | undefined): boolean {
  const raw = [field?.label, field?.name, field?.id, field?.placeholder, field?.selector]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!raw.trim()) return false;
  if (/police[_\s-]?station|\bthana\b|\bps\b/.test(raw)) return false;
  return /\b(from|to|destination|origin|boarding|departure|arrival|journey|train|flight|airport|pnr|berth|quota|class)\b/.test(raw)
    || /\b(from|to)[_\s-]?station\b/.test(raw)
    || /\bstation\b/.test(raw)
    || /\b(depart|arrive|travel)[_\s-]?(date|time|city|from|to)\b/.test(raw);
}

/** Profile keys that must never fill travel/journey fields. */
export const IDENTITY_PROFILE_KEYS = new Set([
  'dob', 'date_of_birth', 'dob__day', 'dob__month', 'dob__year',
  'name', 'first_name', 'last_name', 'middle_name', 'full_name',
  'father_name', 'mother_name', 'husband_name', 'guardian_name',
  'aadhaar', 'aadhaar_number', 'aadhar', 'pan', 'pan_number',
  'voter_id', 'passport', 'driving_licence', 'dl_number',
  'gender', 'sex', 'email', 'email_id', 'phone', 'mobile', 'mobile_number',
]);

/** Lowercase and collapse separators to `_`. */
export function normalizeIdent(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[-\s:*()'./\\]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Label-primary identity for a form field. */
export function labelPrimaryIdent(field: FormField): LabelIdent {
  const raw = String(field.label || '').trim();
  const en = raw.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  const enCore = en.replace(/[^a-z0-9]/gi, '');
  const labelStrong = enCore.length >= 3 || raw.replace(/\s/g, '').length >= 4;
  let matchBy = 'label';
  const parts: string[] = [];
  if (en) {
    parts.push(en, en);
  }
  if (raw && raw !== en) {
    parts.push(raw);
  }
  if (field.placeholder && String(field.placeholder).trim().length > 2) {
    parts.push(String(field.placeholder).trim());
  }
  if (field.name) parts.push(String(field.name));
  if (field.id) parts.push(String(field.id));
  let ident = normalizeIdent(parts.join(' '));
  if (!labelStrong) {
    matchBy = 'dom-fallback';
    const domBits = [field.placeholder, field.id, field.name].filter(Boolean).join(' ');
    ident = normalizeIdent((ident ? ident + ' ' : '') + domBits);
  }
  return { ident, matchBy, labelEn: en, labelRaw: raw, labelStrong };
}

/** Strip non-alphanumerics for option comparison. */
export function normChoice(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Whole-token alias match. Short aliases (po, ps) must be their own token so
 * `po` cannot bind `police_station`.
 */
export function aliasHitsIdent(ident: string, alias: string): boolean {
  const a = String(alias || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const id = String(ident || '').toLowerCase();
  if (!a || !id) return false;
  if (id === a) return true;
  const tokens = id.split(/_+/).filter(Boolean);
  const aliasTokens = a.split(/_+/).filter(Boolean);
  if (!aliasTokens.length) return false;
  if (a.length <= 2) return tokens.includes(a);
  for (let i = 0; i <= tokens.length - aliasTokens.length; i++) {
    let ok = true;
    for (let j = 0; j < aliasTokens.length; j++) {
      if (tokens[i + j] !== aliasTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  if (aliasTokens.length === 1 && tokens.includes(a)) return true;
  if (a.length >= 4) {
    const padded = '_' + id + '_';
    if (padded.includes('_' + a + '_')) return true;
  }
  return false;
}

/** Display text from a string option or {text,label,labelEn,value} record. */
export function optionText(opt: unknown): string {
  if (opt == null) return '';
  if (typeof opt === 'string') return opt;
  if (typeof opt === 'object') {
    const o = opt as { text?: string; label?: string; labelEn?: string; labelHi?: string; value?: string };
    return String(o.text || o.labelEn || o.label || o.labelHi || o.value || '');
  }
  return String(opt);
}

export function optionTexts(options: unknown): string[] {
  if (!options || options === 'dynamic') return [];
  if (!Array.isArray(options)) return [];
  return options.map(optionText).filter(Boolean);
}

export const CcFieldIdent = {
  normalizeIdent,
  labelPrimaryIdent,
  normChoice,
  aliasHitsIdent,
  optionText,
  optionTexts,
};
