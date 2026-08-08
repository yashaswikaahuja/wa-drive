// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Confidence Evaluator — extension-service/confidence-evaluator.js
// Phase 4.3 — Cold-Start Semantic Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Evaluates confidence of AI-generated field mappings.
// Decides whether human confirmation is needed before promotion.
//
// Responsibilities:
//   - Check label↔profileKey semantic similarity
//   - Check field type compatibility with profile key
//   - Compute aggregate confidence score (0.0–1.0)
//   - Determine if human confirmation is needed (threshold: 0.7)
//   - One successful execution is NOT sufficient for promotion
//
// Does NOT own: AI calling, prompt construction, knowledge persistence.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} ConfidenceResult
 * @property {number} score — Aggregate confidence score (0.0–1.0)
 * @property {boolean} needsHumanConfirmation — Whether this mapping needs human review
 * @property {string} disposition — 'auto_accept' | 'needs_confirmation' | 'reject'
 * @property {object} breakdown — Individual signal scores
 * @property {number} breakdown.labelSimilarity — Label↔key match score (0–1)
 * @property {number} breakdown.typeCompatibility — Field type vs expected type (0–1)
 * @property {number} breakdown.reasoningQuality — Quality of AI reasoning (0–1)
 * @property {number} breakdown.contextRelevance — Page context match (0–1)
 * @property {string[]} flags — Risk flags or concerns
 */

// ── Thresholds ──────────────────────────────────────────────────────

/** Minimum confidence to avoid immediate rejection */
const REJECT_THRESHOLD = 0.3;

/** Confidence above which human confirmation is still recommended but not required */
const CONFIRMATION_THRESHOLD = 0.7;

/**
 * Minimum number of successful fill executions before a draft mapping can be
 * promoted to 'active'. One successful execution is NOT sufficient.
 */
export const MIN_EXECUTIONS_FOR_PROMOTION = 3;

// ── Weights for score aggregation ───────────────────────────────────

const WEIGHTS = {
  labelSimilarity: 0.35,
  typeCompatibility: 0.25,
  reasoningQuality: 0.20,
  contextRelevance: 0.20,
};

// ── Profile Key Type Expectations ───────────────────────────────────
// Maps profile keys to their expected field types for compatibility checks.

const PROFILE_KEY_TYPES = {
  // Text fields
  name: ['text', 'textarea'],
  first_name: ['text'],
  middle_name: ['text'],
  last_name: ['text'],
  father_name: ['text'],
  mother_name: ['text'],
  husband_name: ['text'],
  spouse_name: ['text'],
  address: ['text', 'textarea'],
  permanent_address: ['text', 'textarea'],
  current_address: ['text', 'textarea'],
  city: ['text', 'select'],
  district: ['text', 'select'],
  state: ['text', 'select'],
  country: ['text', 'select'],
  landmark: ['text'],
  university: ['text', 'select'],
  college: ['text', 'select'],
  board: ['text', 'select'],
  employer: ['text'],
  designation: ['text'],
  bank_name: ['text', 'select'],
  branch_name: ['text'],
  qualification: ['text', 'select'],
  degree: ['text', 'select'],
  stream: ['text', 'select'],
  specialization: ['text', 'select'],
  subject: ['text', 'select'],
  occupation: ['text', 'select'],
  // Date fields
  dob: ['date', 'text'],
  year_of_passing: ['text', 'select', 'date'],
  // Select fields
  gender: ['select', 'radio'],
  nationality: ['select', 'text'],
  category: ['select', 'radio'],
  religion: ['select', 'radio'],
  marital_status: ['select', 'radio'],
  blood_group: ['select'],
  division: ['select', 'text'],
  // Numeric fields
  pincode: ['text'],
  phone: ['text', 'tel'],
  mobile: ['text', 'tel'],
  alternate_phone: ['text', 'tel'],
  aadhaar_number: ['text'],
  pan_number: ['text'],
  voter_id_number: ['text'],
  passport_number: ['text'],
  driving_license_number: ['text'],
  account_number: ['text'],
  ifsc_code: ['text'],
  percentage: ['text'],
  cgpa: ['text'],
  roll_number: ['text'],
  enrollment_number: ['text'],
  experience_years: ['text', 'select'],
  salary: ['text'],
  employee_id: ['text'],
  age: ['text', 'select'],
  height: ['text'],
  weight: ['text'],
  // Email
  email: ['text', 'email'],
  alternate_email: ['text', 'email'],
  // File
  photo: ['file'],
  signature: ['file'],
};

// ── Label Synonyms Map ──────────────────────────────────────────────
// Common label text patterns mapped to their expected profile keys.

const LABEL_PATTERNS = {
  name: [/^(full\s*)?name$/i, /^applicant\s*name$/i, /^candidate\s*name$/i, /^your\s*name$/i],
  first_name: [/^first\s*name$/i, /^given\s*name$/i, /^forename$/i],
  middle_name: [/^middle\s*name$/i],
  last_name: [/^last\s*name$/i, /^surname$/i, /^family\s*name$/i],
  father_name: [/father/i, /^papa/i, /पिता/],
  mother_name: [/mother/i, /माता/i, /^mata/i],
  husband_name: [/husband/i, /^pati/i, /पति/],
  dob: [/date\s*of\s*birth/i, /birth\s*date/i, /^d\.?o\.?b\.?$/i, /जन्म\s*तिथि/],
  gender: [/^gender$/i, /^sex$/i, /^लिंग$/],
  phone: [/phone/i, /mobile/i, /contact\s*no/i, /मोबाइल/],
  email: [/e[\-\s]?mail/i, /ईमेल/],
  address: [/^address$/i, /^correspondence\s*address$/i, /^postal\s*address$/i, /पता/],
  permanent_address: [/permanent\s*address/i, /^स्थायी\s*पता$/],
  pincode: [/pin\s*code/i, /postal\s*code/i, /zip/i, /पिन\s*कोड/],
  city: [/^city$/i, /^town$/i, /^शहर$/],
  district: [/^district$/i, /^जिला$/],
  state: [/^state$/i, /^province$/i, /^राज्य$/],
  aadhaar_number: [/aadhaar/i, /aadhar/i, /uid/i, /आधार/],
  pan_number: [/^pan/i, /permanent\s*account/i],
  category: [/^category$/i, /^caste$/i, /^वर्ग$/i, /^जाति$/],
  religion: [/^religion$/i, /^धर्म$/],
  nationality: [/^nationality$/i, /^राष्ट्रीयता$/],
  qualification: [/^qualification$/i, /^education$/i, /^शिक्षा$/],
  photo: [/photo/i, /photograph/i, /image/i, /फोटो/],
  signature: [/signature/i, /sign/i, /हस्ताक्षर/],
  marital_status: [/marital/i, /marriage/i, /^married/i, /वैवाहिक/],
};

// ── Main Evaluation ─────────────────────────────────────────────────

/**
 * Evaluate the confidence of an AI-generated field mapping.
 *
 * @param {object} mapping — The AI-produced mapping result
 * @param {string} mapping.node_id — Target node
 * @param {string|null} mapping.profile_key — Mapped profile key
 * @param {string|null} mapping.semantic_key — Semantic key
 * @param {string|null} mapping.transformation — Transformation type
 * @param {string} mapping.reasoning — AI's reasoning
 * @param {object} field — The original field descriptor
 * @param {string} field.label — Field label
 * @param {string} field.field_type — Field type
 * @param {object} [pageContext] — Page context for relevance check
 * @returns {ConfidenceResult}
 */
export function evaluateConfidence(mapping, field, pageContext = {}) {
  const flags = [];

  // If AI returned null mapping (unmappable), accept with high confidence
  if (!mapping.profile_key) {
    return {
      score: 0.8,
      needsHumanConfirmation: false,
      disposition: 'auto_accept',
      breakdown: {
        labelSimilarity: 0.8,
        typeCompatibility: 1.0,
        reasoningQuality: mapping.reasoning ? 0.8 : 0.4,
        contextRelevance: 0.8,
      },
      flags: ['unmappable_field'],
    };
  }

  // 1. Label↔profileKey semantic similarity
  const labelSimilarity = computeLabelSimilarity(field.label, mapping.profile_key, mapping.semantic_key);
  if (labelSimilarity < 0.3) flags.push('low_label_match');

  // 2. Field type compatibility
  const typeCompatibility = computeTypeCompatibility(field.field_type, mapping.profile_key);
  if (typeCompatibility < 0.5) flags.push('type_mismatch');

  // 3. Reasoning quality
  const reasoningQuality = evaluateReasoning(mapping.reasoning, field.label, mapping.profile_key);
  if (reasoningQuality < 0.3) flags.push('weak_reasoning');

  // 4. Context relevance
  const contextRelevance = evaluateContextRelevance(mapping, field, pageContext);

  // Aggregate score
  const score = Math.min(1.0, Math.max(0.0,
    (labelSimilarity * WEIGHTS.labelSimilarity) +
    (typeCompatibility * WEIGHTS.typeCompatibility) +
    (reasoningQuality * WEIGHTS.reasoningQuality) +
    (contextRelevance * WEIGHTS.contextRelevance)
  ));

  // Determine disposition
  let disposition;
  let needsHumanConfirmation;
  if (score < REJECT_THRESHOLD) {
    disposition = 'reject';
    needsHumanConfirmation = false; // don't even bother the human
    flags.push('below_reject_threshold');
  } else if (score < CONFIRMATION_THRESHOLD) {
    disposition = 'needs_confirmation';
    needsHumanConfirmation = true;
  } else {
    // Even above threshold, still needs confirmation for first-time cold-start
    // One successful execution is NOT sufficient for promotion
    disposition = 'needs_confirmation';
    needsHumanConfirmation = true;
    flags.push('cold_start_always_confirm');
  }

  return {
    score,
    needsHumanConfirmation,
    disposition,
    breakdown: {
      labelSimilarity,
      typeCompatibility,
      reasoningQuality,
      contextRelevance,
    },
    flags,
  };
}

/**
 * Determine if a mapping with execution history can be promoted to 'active'.
 *
 * @param {object} params
 * @param {number} params.confidence — Current confidence score
 * @param {number} params.successfulExecutions — Number of times this mapping was used without correction
 * @param {number} params.totalExecutions — Total times executed (including corrections)
 * @param {boolean} params.humanConfirmed — Whether a human explicitly confirmed this mapping
 * @returns {{ canPromote: boolean, reason: string }}
 */
export function canPromoteToActive({ confidence, successfulExecutions, totalExecutions, humanConfirmed }) {
  // Human confirmation is the fast path
  if (humanConfirmed && confidence >= REJECT_THRESHOLD) {
    return { canPromote: true, reason: 'Human confirmed' };
  }

  // One successful execution is NOT sufficient
  if (successfulExecutions < MIN_EXECUTIONS_FOR_PROMOTION) {
    return {
      canPromote: false,
      reason: `Need ${MIN_EXECUTIONS_FOR_PROMOTION} successful executions, have ${successfulExecutions}`,
    };
  }

  // Must have high success rate
  const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
  if (successRate < 0.8) {
    return {
      canPromote: false,
      reason: `Success rate ${(successRate * 100).toFixed(0)}% below 80% threshold`,
    };
  }

  // Confidence must be above confirmation threshold after repeated success
  if (confidence < CONFIRMATION_THRESHOLD) {
    return {
      canPromote: false,
      reason: `Confidence ${confidence.toFixed(3)} below ${CONFIRMATION_THRESHOLD} threshold`,
    };
  }

  return { canPromote: true, reason: `${successfulExecutions} successful executions with ${(successRate * 100).toFixed(0)}% success rate` };
}

// ── Label Similarity ────────────────────────────────────────────────

/**
 * Compute semantic similarity between a field label and a profile key.
 * Uses pattern matching + normalized string distance.
 *
 * @param {string} label
 * @param {string} profileKey
 * @param {string|null} semanticKey
 * @returns {number} 0.0–1.0
 */
function computeLabelSimilarity(label, profileKey, semanticKey) {
  if (!label || !profileKey) return 0;

  const normalizedLabel = label.toLowerCase().trim();
  const normalizedKey = profileKey.toLowerCase().replace(/_/g, ' ');

  // Direct exact match
  if (normalizedLabel === normalizedKey) return 1.0;

  // Check pattern registry
  const patterns = LABEL_PATTERNS[profileKey];
  if (patterns) {
    for (const pattern of patterns) {
      if (pattern.test(label)) return 0.95;
    }
  }

  // Substring containment (key in label or label in key)
  if (normalizedLabel.includes(normalizedKey) || normalizedKey.includes(normalizedLabel)) {
    return 0.8;
  }

  // Semantic key match
  if (semanticKey) {
    const normalizedSemantic = semanticKey.toLowerCase().replace(/_/g, ' ');
    if (normalizedLabel.includes(normalizedSemantic) || normalizedSemantic.includes(normalizedLabel)) {
      return 0.75;
    }
  }

  // Word overlap
  const labelWords = normalizedLabel.split(/[\s_\-\/]+/).filter(w => w.length > 2);
  const keyWords = normalizedKey.split(/[\s_\-\/]+/).filter(w => w.length > 2);
  const overlap = labelWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
  if (overlap.length > 0 && keyWords.length > 0) {
    return 0.4 + (0.3 * overlap.length / Math.max(labelWords.length, keyWords.length));
  }

  // Low similarity — no recognizable match
  return 0.2;
}

// ── Type Compatibility ──────────────────────────────────────────────

/**
 * Check if the field type is compatible with the expected types for a profile key.
 *
 * @param {string} fieldType
 * @param {string} profileKey
 * @returns {number} 0.0–1.0
 */
function computeTypeCompatibility(fieldType, profileKey) {
  if (!fieldType || !profileKey) return 0.5;

  const expectedTypes = PROFILE_KEY_TYPES[profileKey];
  if (!expectedTypes) {
    // Unknown profile key — neutral score
    return 0.5;
  }

  const normalizedType = fieldType.toLowerCase().trim();

  // Exact match
  if (expectedTypes.includes(normalizedType)) return 1.0;

  // 'text' is broadly compatible with most fields
  if (normalizedType === 'text') return 0.7;

  // 'textarea' compatible with text-expecting fields
  if (normalizedType === 'textarea' && expectedTypes.includes('text')) return 0.8;

  // 'tel' type for phone fields
  if (normalizedType === 'tel' && expectedTypes.includes('text')) return 0.9;

  // Type mismatch (e.g. file type for a text field)
  return 0.2;
}

// ── Reasoning Quality ───────────────────────────────────────────────

/**
 * Evaluate the quality of AI's reasoning for a mapping.
 *
 * @param {string|null} reasoning
 * @param {string} label
 * @param {string} profileKey
 * @returns {number} 0.0–1.0
 */
function evaluateReasoning(reasoning, label, profileKey) {
  if (!reasoning) return 0.2;

  let score = 0.4; // base score for having reasoning

  const lowerReasoning = reasoning.toLowerCase();
  const lowerLabel = label.toLowerCase();
  const lowerKey = profileKey.replace(/_/g, ' ').toLowerCase();

  // Mentions the label
  if (lowerReasoning.includes(lowerLabel) || lowerReasoning.includes(label.toLowerCase().replace(/['"]/g, ''))) {
    score += 0.2;
  }

  // Mentions the profile key
  if (lowerReasoning.includes(lowerKey) || lowerReasoning.includes(profileKey)) {
    score += 0.2;
  }

  // Reasoning length (too short = low quality, too long = possibly hallucinating)
  if (reasoning.length >= 15 && reasoning.length <= 200) {
    score += 0.1;
  }

  // Contains explanation keywords
  if (/maps?\s*(to|directly|from)|corresponds|indicates|represents|matches/i.test(reasoning)) {
    score += 0.1;
  }

  return Math.min(1.0, score);
}

// ── Context Relevance ───────────────────────────────────────────────

/**
 * Evaluate how relevant the mapping is given the page context.
 *
 * @param {object} mapping
 * @param {object} field
 * @param {object} pageContext
 * @returns {number} 0.0–1.0
 */
function evaluateContextRelevance(mapping, field, pageContext) {
  let score = 0.6; // base score

  // If field has a group that matches common form sections
  if (field.group) {
    const group = field.group.toLowerCase();
    const key = mapping.profile_key;

    // Personal details section
    if (/personal|basic|identity/i.test(group)) {
      if (['name', 'first_name', 'last_name', 'middle_name', 'father_name', 'mother_name',
           'dob', 'gender', 'category', 'religion', 'nationality', 'marital_status'].includes(key)) {
        score += 0.3;
      }
    }
    // Contact section
    if (/contact|communication/i.test(group)) {
      if (['phone', 'mobile', 'email', 'alternate_phone', 'alternate_email'].includes(key)) {
        score += 0.3;
      }
    }
    // Address section
    if (/address|location|residence/i.test(group)) {
      if (['address', 'permanent_address', 'current_address', 'city', 'district',
           'state', 'pincode', 'country', 'landmark'].includes(key)) {
        score += 0.3;
      }
    }
    // Education section
    if (/education|academic|qualification/i.test(group)) {
      if (['qualification', 'degree', 'university', 'college', 'board', 'year_of_passing',
           'percentage', 'cgpa', 'stream', 'subject', 'roll_number'].includes(key)) {
        score += 0.3;
      }
    }
  }

  // Form heading context
  if (pageContext.form_heading) {
    const heading = pageContext.form_heading.toLowerCase();
    // Registration/application forms are typical profile data contexts
    if (/registration|application|enrollment|admission|form/i.test(heading)) {
      score += 0.1;
    }
  }

  return Math.min(1.0, score);
}

// ── Batch Evaluation ────────────────────────────────────────────────

/**
 * Evaluate confidence for a batch of AI-generated mappings.
 *
 * @param {object[]} mappings — Array of AI mapping results
 * @param {object[]} fields — Original field descriptors (matched by node_id)
 * @param {object} [pageContext] — Page context
 * @returns {Map<string, ConfidenceResult>} — node_id → confidence result
 */
export function evaluateBatch(mappings, fields, pageContext = {}) {
  const fieldMap = new Map(fields.map(f => [f.node_id, f]));
  const results = new Map();

  for (const mapping of mappings) {
    const field = fieldMap.get(mapping.node_id);
    if (!field) {
      results.set(mapping.node_id, {
        score: 0,
        needsHumanConfirmation: true,
        disposition: 'reject',
        breakdown: { labelSimilarity: 0, typeCompatibility: 0, reasoningQuality: 0, contextRelevance: 0 },
        flags: ['field_not_found'],
      });
      continue;
    }
    results.set(mapping.node_id, evaluateConfidence(mapping, field, pageContext));
  }

  return results;
}
