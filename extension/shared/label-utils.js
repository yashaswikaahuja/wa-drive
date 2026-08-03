// ── shared/label-utils.js ────────────────────────────────────────────────────
// Single source of truth for label normalization, semantic key mapping,
// and confidence calculation.
//
// Used by: mapper.js, background.js, popup.js, rule-engine.js
//
// NOTE: This file is loaded via <script> in popup.html AND injected into page
// context. Keep it pure functions, no DOM, no async.
// ────────────────────────────────────────────────────────────────────────────

const SEMANTIC_ALIASES = {
  'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
  'student name': 'name', 'name of candidate': 'name', 'name of applicant': 'name',
  'candidates name': 'name', 'applicants name': 'name',
  'date of birth': 'dob', 'birth date': 'dob', 'dob': 'dob', 'date of birth ddmmyyyy': 'dob',
  "fathers name": 'father_name', 'father name': 'father_name', "fathers husbands name": 'father_name',
  "mothers name": 'mother_name', 'mother name': 'mother_name',
  'aadhaar no': 'aadhaar_number', 'aadhaar number': 'aadhaar_number', 'aadhar no': 'aadhaar_number',
  'pan no': 'pan_number', 'pan number': 'pan_number', 'pan card': 'pan_number',
  'mobile no': 'mobile', 'mobile number': 'mobile', 'phone no': 'mobile', 'contact no': 'mobile',
  'email id': 'email', 'email address': 'email',
  'permanent address': 'address', 'residential address': 'address', 'correspondence address': 'address',
  'pin code': 'pincode', 'postal code': 'pincode', 'pincode': 'pincode',
  'state name': 'state', 'district name': 'district',
};

function normalizeLabel(label) {
  return (label || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return SEMANTIC_ALIASES[n] || n;
}

/**
 * Calculate confidence score for a field mapping.
 * Higher fills relative to corrections → higher confidence.
 * Corrections are weighted 3x to make confidence drop faster on errors.
 *
 * Returns 0.5 for new mappings (neutral), approaches 1.0 for well-established
 * mappings with no corrections, drops toward 0 for heavily corrected ones.
 *
 * @param {number} fills       - Number of successful fills
 * @param {number} corrections - Number of operator corrections
 * @returns {number} Confidence between 0 and 1
 */
function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}

/**
 * Strip leading numbering ("4. ", "a. ") and trailing asterisks from form labels.
 * Also collapses newlines to spaces.
 */
function normalizeFieldLabel(label) {
  return (label || '').replace(/\n/g, ' ').replace(/^\d+\.\s*/, '').replace(/^[a-z]\.\s*/i, '').replace(/\*$/, '').trim();
}
