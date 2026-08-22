/** AUTO-GENERATED — source: packages/cc-background/label-utils/src/label-utils.js */
/**
 * cc-background/label-utils — Label normalisation and semantic alias resolution
 * for the service worker (background.js).
 *
 * NOTE: Keep in sync with packages/cc-shared/src/label-utils.js
 * (page-context version). The SW cannot importScripts page-context
 * scripts so this is a separate copy.
 *
 * Public API (on globalThis):
 *   SEMANTIC_ALIASES          — object
 *   normalizeLabel(label)     => string
 *   getSemanticKey(label)     => string
 *   getSemanticKeyResolved(label) => Promise<string>
 *   calcConfidence(fills, corrections) => number
 */

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

async function getSemanticKeyResolved(label) {
  const n = normalizeLabel(label);
  if (SEMANTIC_ALIASES[n]) return SEMANTIC_ALIASES[n];
  // Check cached server aliases (variant→canonical lookup)
  if (typeof ccKnowledgeSync !== 'undefined') {
    const aliases = await ccKnowledgeSync.getCachedAliases();
    for (const [canonical, variants] of Object.entries(aliases)) {
      if (variants.includes(n) || variants.includes(label)) return canonical;
    }
  }
  return n;
}

function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}

// Expose as globals for service worker scope
globalThis.SEMANTIC_ALIASES         = SEMANTIC_ALIASES;
globalThis.normalizeLabel           = normalizeLabel;
globalThis.getSemanticKey           = getSemanticKey;
globalThis.getSemanticKeyResolved   = getSemanticKeyResolved;
globalThis.calcConfidence           = calcConfidence;
