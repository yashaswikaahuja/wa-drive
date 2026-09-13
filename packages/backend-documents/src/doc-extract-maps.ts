/**
 * Per-document-type field maps for typed extraction (#313 intake pipeline).
 * Owner panel can override via workspace settings.ai.documentExtractMaps.
 * Runtime always falls back to DEFAULT_EXTRACT_MAPS.
 */
import { pool } from '@cybercontrol/backend-core';

export const DOC_TYPES = [
  'aadhaar', 'pan', 'passport', 'voter_id', 'driving_license', 'ration_card', 'ayushman',
  'marksheet_10th', 'marksheet_12th', 'marksheet_graduation', 'marksheet_postgrad',
  'admit_card', 'result', 'certificate', 'bank_passbook', 'photo', 'signature', 'form', 'other',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN', passport: 'Passport', voter_id: 'Voter ID',
  driving_license: 'Driving License', ration_card: 'Ration Card',
  ayushman: 'Ayushman',
  marksheet_10th: '10th Marksheet', marksheet_12th: '12th Marksheet',
  marksheet_graduation: 'Graduation', marksheet_postgrad: 'Post-Grad',
  admit_card: 'Admit Card', result: 'Result', certificate: 'Certificate',
  bank_passbook: 'Bank', photo: 'Photo', signature: 'Signature', form: 'Form', other: 'Other',
};

/** Inverse: Hub tag label → canonical type key (+ common aliases) */
export const LABEL_TO_DOC_TYPE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(DOC_TYPE_LABELS).map(([k, v]) => [v.toLowerCase(), k])),
  'ayushman bharat': 'ayushman',
  'ayushman card': 'ayushman',
  'pmjay': 'ayushman',
  'pm-jay': 'ayushman',
  'abha': 'ayushman',
  'abha card': 'ayushman',
};

/**
 * Default: which profile fields to extract from each document type.
 * Intentionally narrow so docs don't overwrite each other (Aadhaar owns address;
 * 10th owns DOB/academic; etc.). Owner panel can edit.
 */
export const DEFAULT_EXTRACT_MAPS: Record<string, string[]> = {
  aadhaar: [
    'name', 'first_name', 'middle_name', 'last_name', 'father_name', 'husband_name',
    'dob', 'gender', 'address', 'village', 'post_office', 'police_station', 'block',
    'sub_division', 'ward_no', 'city', 'district', 'state', 'pincode', 'aadhaar_number',
  ],
  pan: ['name', 'first_name', 'last_name', 'father_name', 'dob', 'pan_number'],
  passport: [
    'name', 'first_name', 'last_name', 'dob', 'gender', 'nationality',
    'passport_number', 'issue_date', 'expiry_date', 'place_of_issue', 'address',
  ],
  voter_id: ['name', 'father_name', 'husband_name', 'dob', 'gender', 'address', 'voter_id_number', 'district', 'state'],
  driving_license: [
    'name', 'dob', 'address', 'driving_license_number', 'issue_date', 'expiry_date', 'district', 'state',
  ],
  ration_card: ['name', 'father_name', 'address', 'ration_card_number', 'district', 'state', 'pincode'],
  // Ayushman Bharat / PM-JAY / ABHA — lean identity + card id (Hindi name often primary on card)
  ayushman: ['name', 'name_devanagari', 'ayushman_id', 'gender'],
  marksheet_10th: [
    'name', 'father_name', 'mother_name', 'dob', 'roll_number', 'registration_number',
    'board', 'school_name', 'marks_obtained', 'total_marks', 'percentage', 'division', 'passing_year',
  ],
  marksheet_12th: [
    'name', 'father_name', 'mother_name', 'dob', 'roll_number', 'registration_number',
    'board', 'school_name', 'stream', 'marks_obtained', 'total_marks', 'percentage', 'division', 'passing_year',
  ],
  marksheet_graduation: [
    'name', 'father_name', 'dob', 'roll_number', 'registration_number', 'university_name',
    'college_name', 'course', 'marks_obtained', 'total_marks', 'percentage', 'division', 'passing_year',
  ],
  marksheet_postgrad: [
    'name', 'father_name', 'dob', 'roll_number', 'university_name', 'course',
    'marks_obtained', 'total_marks', 'percentage', 'division', 'passing_year',
  ],
  admit_card: ['name', 'dob', 'roll_number', 'application_number', 'exam_name', 'exam_date', 'exam_center', 'exam_seat_number'],
  result: ['name', 'roll_number', 'exam_name', 'marks_obtained', 'total_marks', 'percentage', 'division'],
  certificate: ['name', 'father_name', 'dob', 'certificate_number', 'issue_date'],
  // Lean map: only banking identifiers (no address — avoids override fights).
  bank_passbook: [
    'bank_account_number', 'ifsc_code', 'cif_number', 'bank_name', 'branch_name',
  ],
  form: ['name', 'dob', 'phone', 'email', 'address'],
  photo: [],
  signature: [],
  other: [],
};

const CACHE_TTL_MS = 60_000;
let _mapsCache: { at: number; maps: Record<string, string[]> } | null = null;

/** Merge owner overrides onto defaults (owner wins per type when non-empty array). */
export function mergeExtractMaps(ownerMaps?: Record<string, string[]> | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of DOC_TYPES) {
    const o = ownerMaps?.[t];
    out[t] = Array.isArray(o) && o.length > 0
      ? [...new Set(o.map((k) => String(k).trim()).filter(Boolean))]
      : [...(DEFAULT_EXTRACT_MAPS[t] || [])];
  }
  // Preserve any extra owner-only types
  if (ownerMaps) {
    for (const [t, keys] of Object.entries(ownerMaps)) {
      if (out[t] || !Array.isArray(keys)) continue;
      out[t] = [...new Set(keys.map((k) => String(k).trim()).filter(Boolean))];
    }
  }
  return out;
}

/** Load owner-configured maps from any workspace settings (global AI config pattern). */
export async function loadOwnerExtractMaps(): Promise<Record<string, string[]>> {
  if (_mapsCache && Date.now() - _mapsCache.at < CACHE_TTL_MS) return _mapsCache.maps;
  try {
    const { rows } = await pool.query(
      `SELECT settings->'ai'->'documentExtractMaps' AS maps
       FROM workspaces
       WHERE settings->'ai'->'documentExtractMaps' IS NOT NULL
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`
    );
    const raw = rows[0]?.maps;
    const owner = raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : null;
    const maps = mergeExtractMaps(owner);
    _mapsCache = { at: Date.now(), maps };
    return maps;
  } catch {
    const maps = mergeExtractMaps(null);
    _mapsCache = { at: Date.now(), maps };
    return maps;
  }
}

export function invalidateExtractMapsCache() {
  _mapsCache = null;
}

export async function getExtractFieldsForType(docType: string): Promise<string[]> {
  const maps = await loadOwnerExtractMaps();
  const t = String(docType || '').toLowerCase().trim();
  return maps[t] || DEFAULT_EXTRACT_MAPS[t] || [];
}

export type TypeDecision = 'known' | 'uncertain' | 'unknown';

/** Decide whether we can run typed field extract. */
export function resolveDocTypeDecision(docType: string, confidence?: number): TypeDecision {
  const t = String(docType || '').toLowerCase().trim();
  if (!t || t === 'other') return 'unknown';
  if (t === 'photo' || t === 'signature') return 'known'; // known but no fields
  if (!(DOC_TYPES as readonly string[]).includes(t)) return 'unknown';
  if (typeof confidence === 'number' && confidence < 0.55) return 'uncertain';
  if (typeof confidence === 'number' && confidence < 0.75) return 'uncertain';
  return 'known';
}

export function normalizeDocTypeKey(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, '_');
  if ((DOC_TYPES as readonly string[]).includes(lower)) return lower;
  const fromLabel = LABEL_TO_DOC_TYPE[raw.toLowerCase()];
  return fromLabel || null;
}
