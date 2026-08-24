/**
 * field-ident — Field identity normalisation helpers
 */
import type { FormField, LabelIdent } from './types.ts';

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

export const CcFieldIdent = {
  normalizeIdent,
  labelPrimaryIdent,
  normChoice,
};
