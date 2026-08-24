/**
 * decide-conditional — Decide Yes/No for conditional radio/checkbox fields
 */
import type { FormField, Profile } from './types.ts';

function normalizeIdent(s: string): string {
  return String(s || '').toLowerCase().replace(/[-\s:*()'./\\]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/** Decide Yes/No (or a profile value) for conditional choice fields. */
export function decideConditionalChoice(field: FormField, profile: Profile): string | null {
  const ident  = normalizeIdent([field.label, field.name, field.id].filter(Boolean).join(' '));
  const label  = String(field.label || '').toLowerCase();
  const nameId = ((field.name || '') + ' ' + (field.id || '')).toLowerCase();
  const blob   = ident + ' ' + label + ' ' + nameId;

  // Changed name?
  if (/changed|new_name|name_change|whether.*name/.test(blob)) {
    return profile.changed_name ? 'Yes' : 'No';
  }
  // Same address?
  if (/address.?same|same.?address|isaddresssame|correspondence.?same/.test(blob)) {
    if (profile.same_address != null) return /^(yes|true|1)$/i.test(String(profile.same_address)) ? 'Yes' : 'No';
    return 'Yes'; // default: same
  }
  // Disability / PwD
  if (/disabilit|pwd|divyang|handicapped|is_pwd/.test(blob)) {
    const d = profile.is_pwd || profile.disability || profile.pwd;
    if (d != null) return /^(yes|y|true|1)$/i.test(String(d)) ? 'Yes' : 'No';
    return 'No';
  }
  // Ex-serviceman
  if (/ex.?serviceman|ex.?service/.test(blob)) {
    const e = profile.ex_serviceman;
    if (e != null) return /^(yes|y|true|1)$/i.test(String(e)) ? 'Yes' : 'No';
    return 'No';
  }
  // Aadhaar declaration / consent
  if (/aadhar.?declar|aadhaar.?declar|declaration|consent|i_agree|i agree|confirm.*information/.test(blob)) {
    return 'Yes';
  }
  // Gender
  if (/gender|sex|ling|पुरुष|महिला|male|female|तृतीय/.test(blob)) {
    return (profile.gender || profile.sex || null) as string | null;
  }
  // Marital
  if (/marital|married|unmarried|विवाह/.test(blob)) {
    return (profile.marital_status || profile.marital || null) as string | null;
  }
  // Reserved category
  if (/reserv|category.?belong|is_reserved/.test(blob)) {
    const r = profile.is_reserved_category;
    if (r != null) return /^(yes|y|true|1)$/i.test(String(r)) ? 'Yes' : 'No';
  }
  return null;
}

export const CcDecideConditional = {
  decideConditionalChoice,
};
