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
let _mapsCache: { at: number; maps: Record<string, string[]>; key: string } | null = null;

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

/** Load owner/learned maps (prefer a workspace when provided). */
export async function loadOwnerExtractMaps(workspaceId?: string | null): Promise<Record<string, string[]>> {
  const cacheKey = workspaceId || '_any';
  if (_mapsCache && _mapsCache.key === cacheKey && Date.now() - _mapsCache.at < CACHE_TTL_MS) {
    return _mapsCache.maps;
  }
  try {
    const { rows } = workspaceId
      ? await pool.query(
        `SELECT settings->'ai'->'documentExtractMaps' AS maps FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      : await pool.query(
        `SELECT settings->'ai'->'documentExtractMaps' AS maps
         FROM workspaces
         WHERE settings->'ai'->'documentExtractMaps' IS NOT NULL
         ORDER BY created_at DESC NULLS LAST
         LIMIT 1`,
      );
    const raw = rows[0]?.maps;
    const owner = raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : null;
    const maps = mergeExtractMaps(owner);
    _mapsCache = { at: Date.now(), maps, key: cacheKey };
    return maps;
  } catch {
    const maps = mergeExtractMaps(null);
    _mapsCache = { at: Date.now(), maps, key: cacheKey };
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

/** True when we already have a non-empty extract rule (seed or owner/learned). */
export async function hasExtractRule(docType: string): Promise<boolean> {
  const fields = await getExtractFieldsForType(docType);
  return fields.length > 0;
}

export type TypeDecision = 'known' | 'uncertain' | 'unknown';

/** Decide whether we can run typed field extract (or must learn a rule / ask operator). */
export function resolveDocTypeDecision(docType: string, confidence?: number): TypeDecision {
  const t = String(docType || '').toLowerCase().trim();
  if (!t || t === 'other') return 'unknown';
  if (t === 'photo' || t === 'signature') return 'known'; // known but no fields
  // Seed or learned snake_case types are eligible; confidence gates auto-learn path.
  if (typeof confidence === 'number' && confidence < 0.55) return 'uncertain';
  if (typeof confidence === 'number' && confidence < 0.75) return 'uncertain';
  return 'known';
}

/** Seed keys, label aliases, or safe dynamic snake_case (learned types). */
export function normalizeDocTypeKey(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!lower || lower === 'other') {
    const fromLabel = LABEL_TO_DOC_TYPE[raw.toLowerCase()];
    return fromLabel && fromLabel !== 'other' ? fromLabel : (lower === 'other' ? 'other' : null);
  }
  if ((DOC_TYPES as readonly string[]).includes(lower)) return lower;
  const fromLabel = LABEL_TO_DOC_TYPE[raw.toLowerCase()];
  if (fromLabel) return fromLabel;
  // Learned / dynamic type keys: a_z start, snake_case, max 40
  if (/^[a-z][a-z0-9_]{1,39}$/.test(lower)) return lower;
  return null;
}

/** Profile keys the rule maker may propose (keep extract maps stable & mergeable). */
export const PROFILE_KEY_ALLOWLIST = [
  'name', 'first_name', 'middle_name', 'last_name', 'name_devanagari',
  'father_name', 'mother_name', 'husband_name', 'guardian_name',
  'dob', 'gender', 'nationality', 'category', 'religion', 'marital_status',
  'phone', 'email', 'address', 'village', 'post_office', 'police_station', 'block',
  'sub_division', 'ward_no', 'city', 'district', 'state', 'pincode',
  'aadhaar_number', 'pan_number', 'passport_number', 'voter_id_number',
  'driving_license_number', 'ration_card_number', 'ayushman_id',
  'roll_number', 'registration_number', 'certificate_number', 'board', 'school_name',
  'college_name', 'university_name', 'course', 'stream', 'marks_obtained', 'total_marks',
  'percentage', 'division', 'passing_year', 'exam_name', 'exam_date', 'exam_center',
  'exam_seat_number', 'application_number',
  'bank_account_number', 'ifsc_code', 'cif_number', 'bank_name', 'branch_name', 'account_holder_name',
  'issue_date', 'expiry_date', 'place_of_issue',
  'departure', 'arrival', 'from_station', 'to_station', 'journey_date', 'return_date',
  'travel_class', 'quota', 'passenger_count',
] as const;

export function sanitizeProposedFields(fields: unknown): string[] {
  const allow = new Set(PROFILE_KEY_ALLOWLIST as readonly string[]);
  if (!Array.isArray(fields)) return [];
  return [...new Set(
    fields.map((k) => String(k || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, ''))
      .filter((k) => k && allow.has(k)),
  )];
}

/** Persist a learned/edited extract map for one document type (settings = form-mapping style). */
export async function saveExtractRule(
  workspaceId: string,
  docType: string,
  fields: string[],
  label?: string | null,
): Promise<Record<string, string[]>> {
  const type = normalizeDocTypeKey(docType);
  if (!type || type === 'other') throw new Error('Cannot save extract rule for invalid/other type');
  const clean = sanitizeProposedFields(fields);
  const current = await loadOwnerExtractMaps();
  const next = { ...current, [type]: clean };

  await pool.query(
    `UPDATE workspaces
     SET settings = jsonb_set(
       jsonb_set(COALESCE(settings, '{}'::jsonb), '{ai}', COALESCE(settings->'ai', '{}'::jsonb)),
       '{ai,documentExtractMaps}',
       $1::jsonb
     )
     WHERE id = $2`,
    [JSON.stringify(next), workspaceId],
  );

  if (label && String(label).trim()) {
    await pool.query(
      `UPDATE workspaces
       SET settings = jsonb_set(
         COALESCE(settings, '{}'::jsonb),
         '{ai,documentTypeLabels}',
         COALESCE(settings->'ai'->'documentTypeLabels', '{}'::jsonb) || $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify({ [type]: String(label).trim() }), workspaceId],
    );
  }

  invalidateExtractMapsCache();
  console.log(`[ExtractMaps] saved rule ${type} → [${clean.join(', ')}] ws=${workspaceId}`);
  return next;
}
