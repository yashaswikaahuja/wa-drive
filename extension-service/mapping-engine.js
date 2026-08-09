// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Mapping Engine — extension-service/mapping-engine.js
// Phase 4.1 — Server Fill Planner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Resolves field→profileKey using knowledge-store field_mapping records.
// Handles multi-source mappings (e.g. full_name = first + middle + last)
// and one-to-many (dob → day/month/year fields).
//
// Responsibilities:
//   - Resolve each form node to a profile key via knowledge
//   - Compute fill values using profile data + transformations
//   - Handle multi-source concatenation (many profile keys → one field)
//   - Handle one-to-many extraction (one profile key → many fields)
//   - Classify field eligibility for fill
//
// Does NOT own: plan construction, ordering, session tracking.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as knowledgeStore from './knowledge-store.js';

/**
 * Field classification enum — determines fill eligibility.
 * Only PROFILE_DATA and DERIVED_DATA fields may enter fill.
 * @readonly
 * @enum {string}
 */
export const FieldClassification = Object.freeze({
  PROFILE_DATA: 'PROFILE_DATA',
  DERIVED_DATA: 'DERIVED_DATA',
  SYSTEM_CONTROL: 'SYSTEM_CONTROL',
  USER_CONFIRMATION: 'USER_CONFIRMATION',
  SENSITIVE: 'SENSITIVE',
  UNKNOWN: 'UNKNOWN',
  UNSUPPORTED: 'UNSUPPORTED',
});

/** Classifications eligible for automated fill. */
const FILLABLE_CLASSIFICATIONS = new Set([
  FieldClassification.PROFILE_DATA,
  FieldClassification.DERIVED_DATA,
]);

/**
 * @typedef {object} MappingResult
 * @property {string} node_id — Target node in the snapshot
 * @property {string} context_id — Context the node belongs to
 * @property {string} semantic_key — Resolved semantic meaning
 * @property {string} profile_key — Profile field(s) sourcing the value
 * @property {string|null} value — Resolved fill value
 * @property {string} classification — FieldClassification value
 * @property {string} transformation — How value is produced
 * @property {object|null} mapping_record — The knowledge record used
 */

/**
 * @typedef {object} MultiSourceMapping
 * @property {string} target_semantic_key — e.g. 'full_name'
 * @property {string[]} source_keys — e.g. ['first_name', 'middle_name', 'last_name']
 * @property {string} transformation — e.g. 'concatenate'
 * @property {object} [parameters] — e.g. { separator: ' ', skip_empty: true }
 */

/**
 * @typedef {object} OneToManyMapping
 * @property {string} source_key — e.g. 'dob'
 * @property {object[]} targets — Array of { semantic_key, transformation, parameters }
 */

/**
 * Classify a snapshot node for fill eligibility based on its widget/state info.
 *
 * @param {object} node — A node from the PageSnapshot
 * @returns {string} — FieldClassification value
 */
export function classifyField(node) {
  if (!node) return FieldClassification.UNKNOWN;

  // Check widget status
  const widget = node.widget;
  if (widget) {
    if (widget.status === 'unsupported') return FieldClassification.UNSUPPORTED;
    if (widget.status === 'inaccessible') return FieldClassification.UNSUPPORTED;
    // Challenge widgets (captcha, OTP) are user confirmation
    if (widget.behavior_kind === 'challenge') return FieldClassification.USER_CONFIRMATION;
    // Action buttons are system controls
    if (widget.behavior_kind === 'action') return FieldClassification.SYSTEM_CONTROL;
  }

  // Privacy sensitivity controls redaction and logging, not fill eligibility.
  // Only secrets (passwords, OTPs, CAPTCHA) are categorically non-fillable;
  // sensitive profile data such as Aadhaar/PAN remains PROFILE_DATA.
  if (node.privacy?.classification === 'secret') {
    return FieldClassification.SENSITIVE;
  }

  // Check node kind
  if (node.kind === 'navigation') return FieldClassification.SYSTEM_CONTROL;
  if (node.kind === 'validation_message') return FieldClassification.SYSTEM_CONTROL;

  // Check affordances — nodes without type_text/select/toggle are not fillable
  const affordances = node.affordances || [];
  const hasFillAffordance = affordances.some(a =>
    ['type_text', 'select_one', 'select_many', 'toggle', 'upload'].includes(a)
  );
  if (!hasFillAffordance) return FieldClassification.SYSTEM_CONTROL;

  // Check state
  if (node.state) {
    if (node.state.readonly === true) return FieldClassification.SYSTEM_CONTROL;
    if (node.state.enabled === false) return FieldClassification.SYSTEM_CONTROL;
  }

  // Default: potentially fillable — final classification depends on mapping resolution
  return FieldClassification.PROFILE_DATA;
}

/**
 * Check if a field classification is eligible for fill.
 *
 * @param {string} classification — FieldClassification value
 * @returns {boolean}
 */
export function isEligibleForFill(classification) {
  return FILLABLE_CLASSIFICATIONS.has(classification);
}

/**
 * Resolve all field mappings for a given form scope from the knowledge store.
 *
 * @param {object} scope — { portal_id, form_key, organization_id, country }
 * @returns {Promise<object[]>} — Knowledge records of kind 'field_mapping'
 */
export async function resolveFieldMappings(scope) {
  return knowledgeStore.resolveAll({
    kind: 'field_mapping',
    portal_id: scope.portal_id,
    form_key: scope.form_key,
    organization_id: scope.organization_id,
    country: scope.country,
  });
}

/**
 * Resolve derivation rules for computed/derived fields.
 *
 * @param {object} scope — { portal_id, form_key, organization_id, country }
 * @returns {Promise<object[]>} — Knowledge records of kind 'derivation_rule'
 */
export async function resolveDerivationRules(scope) {
  return knowledgeStore.resolveAll({
    kind: 'derivation_rule',
    portal_id: scope.portal_id,
    form_key: scope.form_key,
    organization_id: scope.organization_id,
    country: scope.country,
  });
}

/**
 * Apply a concatenation transformation (multi-source → single target).
 * e.g. full_name = first_name + ' ' + middle_name + ' ' + last_name
 *
 * @param {string[]} sourceKeys — Profile keys to concatenate
 * @param {object} profile — The user's profile data
 * @param {object} [parameters] — { separator, skip_empty }
 * @returns {string|null}
 */
export function applyConcatenate(sourceKeys, profile, parameters = {}) {
  const separator = parameters.separator ?? ' ';
  const skipEmpty = parameters.skip_empty !== false;

  const parts = sourceKeys.map(key => {
    const entry = profile[key];
    if (!entry) return '';
    return String(entry.value ?? entry ?? '').trim();
  });

  const filtered = skipEmpty ? parts.filter(p => p.length > 0) : parts;
  const result = filtered.join(separator).trim();
  return result || null;
}

/**
 * Apply an extraction transformation (one source → multiple targets).
 * e.g. dob '1995-03-15' → { day: '15', month: '03', year: '1995' }
 *
 * @param {string} sourceKey — Profile key to extract from
 * @param {object} profile — The user's profile data
 * @param {string} extractTarget — Which part to extract (e.g. 'day', 'month', 'year')
 * @param {object} [parameters] — { format, zero_pad }
 * @returns {string|null}
 */
export function applyExtract(sourceKey, profile, extractTarget, parameters = {}) {
  const entry = profile[sourceKey];
  if (!entry) return null;

  const rawValue = String(entry.value ?? entry ?? '').trim();
  if (!rawValue) return null;

  // Try to parse as date
  const date = parseDate(rawValue);
  if (!date) return null;

  const zeroPad = parameters.zero_pad !== false;

  switch (extractTarget) {
    case 'day':
      return zeroPad ? String(date.day).padStart(2, '0') : String(date.day);
    case 'month':
      return zeroPad ? String(date.month).padStart(2, '0') : String(date.month);
    case 'year':
      return String(date.year);
    default:
      return null;
  }
}

/**
 * Parse a date string in multiple formats.
 * Supports: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY (ISO detection)
 *
 * @param {string} dateStr
 * @returns {{ day: number, month: number, year: number }|null}
 */
function parseDate(dateStr) {
  // ISO format: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]), day: parseInt(isoMatch[3]) };
  }

  // DD/MM/YYYY or DD-MM-YYYY (Indian format — assumed default)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    return { day: parseInt(ddmmyyyy[1]), month: parseInt(ddmmyyyy[2]), year: parseInt(ddmmyyyy[3]) };
  }

  // Try native Date parsing as last resort
  const native = new Date(dateStr);
  if (!isNaN(native.getTime())) {
    return { year: native.getFullYear(), month: native.getMonth() + 1, day: native.getDate() };
  }

  return null;
}

/**
 * Resolve a single node's mapping and compute its fill value.
 *
 * @param {object} node — Snapshot node
 * @param {object[]} mappings — Resolved field_mapping knowledge records
 * @param {object[]} derivationRules — Resolved derivation_rule knowledge records
 * @param {object} profile — User's profile data
 * @returns {MappingResult|null}
 */
export function resolveNodeMapping(node, mappings, derivationRules, profile) {
  const classification = classifyField(node);
  if (!isEligibleForFill(classification)) return null;

  const nodeName = node.observed?.accessible_name?.toLowerCase()?.trim() || '';
  const nodeDesc = node.observed?.description?.toLowerCase()?.trim() || '';

  // Find matching field_mapping record.
  // Longest/most-specific matched pattern wins (so "father's name" matches
  // the `father_name` mapping via 'father' rather than the generic `name`).
  // Priority (if set) is a tiebreaker on top of match specificity.
  let bestMapping = null;
  let bestScore = 0;
  let bestPriority = -1;

  for (const record of mappings) {
    const payload = record.payload;
    if (!payload) continue;

    const score = matchLabelScore(nodeName, nodeDesc, payload);
    if (score === 0) continue;
    const priority = payload.priority ?? 0;
    if (score > bestScore || (score === bestScore && priority > bestPriority)) {
      bestMapping = record;
      bestScore = score;
      bestPriority = priority;
    }
  }

  if (!bestMapping) return null;

  const payload = bestMapping.payload;
  let value = null;
  let transformation = 'direct';
  let resolvedClassification = FieldClassification.PROFILE_DATA;

  // Check if this is a derivation target
  const derivation = derivationRules.find(
    r => r.payload?.output_key === payload.profile_key
  );

  if (derivation) {
    resolvedClassification = FieldClassification.DERIVED_DATA;
    value = computeDerivedValue(derivation, profile);
    transformation = derivation.payload.logic || 'derived';
  } else {
    // Direct profile lookup, with alias fallback for common key divergences
    // (e.g. seed uses `email` but real profiles store `email_id`).
    value = lookupProfileValue(profile, payload.profile_key);
  }

  return {
    node_id: node.node_id,
    context_id: node.context_id,
    semantic_key: payload.semantic_key,
    profile_key: payload.profile_key,
    value,
    classification: resolvedClassification,
    transformation,
    mapping_record: bestMapping,
  };
}

function resolveCandidateMapping(node, candidates, profile) {
  const candidate = candidates.find(item =>
    item.node_id === node.node_id && item.disposition === 'auto_accept' && item.profile_key
  );
  if (!candidate) return null;
  const value = lookupProfileValue(profile, candidate.profile_key);
  if (!value) return null;
  return {
    node_id: node.node_id,
    context_id: node.context_id,
    semantic_key: candidate.semantic_key || candidate.profile_key,
    profile_key: candidate.profile_key,
    value,
    classification: candidate.transformation && candidate.transformation !== 'direct'
      ? FieldClassification.DERIVED_DATA
      : FieldClassification.PROFILE_DATA,
    transformation: candidate.transformation || 'direct',
    mapping_record: candidate.knowledgeRecordId
      ? { id: candidate.knowledgeRecordId, status: 'draft', source: { origin: 'ai_generated' } }
      : null,
  };
}

/**
 * Score how specifically a node label matches a mapping record.
 * Returns the length of the LONGEST matched pattern (0 = no match).
 * Longer matches are more specific (e.g. 'father' beats generic 'name').
 *
 * @param {string} nodeName — Normalized accessible_name
 * @param {string} nodeDesc — Normalized description
 * @param {object} payload — field_mapping payload
 * @returns {number}
 */
function matchLabelScore(nodeName, nodeDesc, payload) {
  let best = 0;
  const consider = (raw) => {
    const c = String(raw || '').toLowerCase().trim().replace(/_/g, ' ');
    if (!c) return;
    if (nodeName.includes(c) || nodeDesc.includes(c)) {
      if (c.length > best) best = c.length;
    }
  };

  consider(payload.field_label);
  if (Array.isArray(payload.match_patterns)) {
    for (const pattern of payload.match_patterns) consider(pattern);
  }
  // Semantic key as a normalized fallback (underscores → spaces)
  consider((payload.semantic_key || '').replace(/_/g, ' '));

  return best;
}

/**
 * Boolean label match (backward-compatible wrapper).
 *
 * @param {string} nodeName
 * @param {string} nodeDesc
 * @param {object} payload
 * @returns {boolean}
 */
function matchesLabel(nodeName, nodeDesc, payload) {
  return matchLabelScore(nodeName, nodeDesc, payload) > 0;
}

/**
 * Resolve a profile value by key, with fallback to common key aliases.
 * Handles divergence between seed profile_keys and real profile schemas
 * (e.g. seed 'email' vs stored 'email_id').
 *
 * @param {object} profile — Flattened profile data
 * @param {string} profileKey — Primary key to look up
 * @returns {string|null}
 */
function lookupProfileValue(profile, profileKey) {
  const read = (k) => {
    const entry = profile[k];
    if (entry == null) return null;
    const v = String(entry.value ?? entry ?? '').trim();
    return v || null;
  };

  const direct = read(profileKey);
  if (direct) return direct;

  const aliases = PROFILE_KEY_ALIASES[profileKey];
  if (aliases) {
    for (const alt of aliases) {
      const v = read(alt);
      if (v) return v;
    }
  }
  return null;
}

/**
 * Fallback profile-key aliases for common schema divergences.
 * Keyed by the mapping's profile_key → candidate real profile keys.
 */
const PROFILE_KEY_ALIASES = Object.freeze({
  email: ['email_id', 'email_address', 'emailid'],
  email_id: ['email', 'email_address'],
  mobile: ['mobile_no', 'mobile_number', 'phone', 'phone_no', 'contact_no'],
  phone: ['mobile', 'mobile_no', 'phone_no'],
  name: ['full_name', 'candidate_name', 'applicant_name', 'fullname'],
  father_name: ['fathers_name', 'father'],
  mother_name: ['mothers_name', 'mother'],
  aadhaar_number: ['aadhaar', 'aadhar', 'aadhaar_no', 'aadhar_no', 'uid'],
  pan_number: ['pan', 'pan_no', 'pan_number'],
  dob: ['date_of_birth', 'birth_date'],
  pincode: ['pin_code', 'postal_code', 'pin'],
});

/**
 * Compute a derived value using a derivation rule and profile data.
 *
 * @param {object} derivationRecord — Knowledge record with derivation_rule payload
 * @param {object} profile — User's profile data
 * @returns {string|null}
 */
function computeDerivedValue(derivationRecord, profile) {
  const payload = derivationRecord.payload;
  const inputs = payload.inputs || [];
  const logic = payload.logic;
  const parameters = payload.parameters || {};

  switch (logic) {
    case 'concatenate':
      return applyConcatenate(inputs, profile, parameters);

    case 'date_format': {
      const sourceKey = inputs[0];
      if (!sourceKey) return null;
      const entry = profile[sourceKey];
      if (!entry) return null;
      const rawValue = String(entry.value ?? entry ?? '').trim();
      const date = parseDate(rawValue);
      if (!date) return null;
      const format = parameters.format || 'dd/mm/yyyy';
      return formatDate(date, format);
    }

    case 'age_from_dob': {
      const sourceKey = inputs[0];
      if (!sourceKey) return null;
      const entry = profile[sourceKey];
      if (!entry) return null;
      const rawValue = String(entry.value ?? entry ?? '').trim();
      const date = parseDate(rawValue);
      if (!date) return null;
      const today = new Date();
      let age = today.getFullYear() - date.year;
      const monthDiff = (today.getMonth() + 1) - date.month;
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.day)) {
        age--;
      }
      return String(age);
    }

    case 'name_split': {
      const sourceKey = inputs[0];
      if (!sourceKey) return null;
      const entry = profile[sourceKey];
      if (!entry) return null;
      const fullName = String(entry.value ?? entry ?? '').trim();
      const parts = fullName.split(/\s+/);
      const target = parameters.target || 'first';
      switch (target) {
        case 'first': return parts[0] || null;
        case 'middle': return parts.length > 2 ? parts.slice(1, -1).join(' ') : null;
        case 'last': return parts.length > 1 ? parts[parts.length - 1] : null;
        default: return null;
      }
    }

    default:
      return null;
  }
}

/**
 * Format a parsed date object into a string.
 *
 * @param {{ day: number, month: number, year: number }} date
 * @param {string} format — e.g. 'dd/mm/yyyy', 'yyyy-mm-dd', 'mm/dd/yyyy'
 * @returns {string}
 */
function formatDate(date, format) {
  const dd = String(date.day).padStart(2, '0');
  const mm = String(date.month).padStart(2, '0');
  const yyyy = String(date.year);
  return format
    .replace('dd', dd)
    .replace('mm', mm)
    .replace('yyyy', yyyy);
}

/**
 * Resolve all mappings for a full snapshot, computing fill values.
 * This is the main entry point for the mapping engine.
 *
 * @param {object} snapshot — Full PageSnapshot
 * @param {object} profile — User's profile data
 * @param {object} scope — { portal_id, form_key, organization_id, country }
 * @param {object} [options]
 * @param {object[]} [options.candidateMappings] — current-session high-confidence draft mappings
 * @returns {Promise<{ mappings: MappingResult[], unmapped: string[], excluded: string[] }>}
 */
export async function resolveAllMappings(snapshot, profile, scope, options = {}) {
  const fieldMappings = await resolveFieldMappings(scope);
  const derivationRules = await resolveDerivationRules(scope);
  const candidateMappings = options.candidateMappings || [];

  /** @type {MappingResult[]} */
  const mappings = [];
  /** @type {string[]} */
  const unmapped = [];
  /** @type {string[]} */
  const excluded = [];

  const nodes = snapshot.nodes || {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const classification = classifyField(node);

    // Eligibility gating
    if (!isEligibleForFill(classification)) {
      excluded.push(nodeId);
      continue;
    }

    const result = resolveNodeMapping(node, fieldMappings, derivationRules, profile)
      || resolveCandidateMapping(node, candidateMappings, profile);
    if (result) {
      mappings.push(result);
    } else {
      unmapped.push(nodeId);
    }
  }

  // Handle multi-source mappings (e.g. full_name) via derivation rules with 'concatenate'
  const multiSourceRules = derivationRules.filter(
    r => r.payload?.logic === 'concatenate' && r.payload?.inputs?.length > 1
  );
  for (const rule of multiSourceRules) {
    // Check if any mapped field targets this derivation output
    const outputKey = rule.payload.output_key;
    const existingMapping = mappings.find(m => m.profile_key === outputKey);
    if (existingMapping && !existingMapping.value) {
      existingMapping.value = applyConcatenate(rule.payload.inputs, profile, rule.payload.parameters);
      existingMapping.transformation = 'concatenate';
      existingMapping.classification = FieldClassification.DERIVED_DATA;
    }
  }

  // Handle one-to-many mappings (e.g. dob → day/month/year)
  // These are detected when multiple field_mappings reference the same profile_key
  // with different extract transformations
  const extractMappings = fieldMappings.filter(
    r => r.payload?.transformation === 'extract'
  );
  for (const extractRecord of extractMappings) {
    const mapping = mappings.find(
      m => m.semantic_key === extractRecord.payload.semantic_key && !m.value
    );
    if (mapping) {
      const extractTarget = extractRecord.payload.extract_part;
      const sourceKey = extractRecord.payload.profile_key;
      if (extractTarget && sourceKey) {
        mapping.value = applyExtract(sourceKey, profile, extractTarget, extractRecord.payload.parameters);
        mapping.transformation = `extract:${extractTarget}`;
        mapping.classification = FieldClassification.DERIVED_DATA;
      }
    }
  }

  return { mappings, unmapped, excluded };
}
