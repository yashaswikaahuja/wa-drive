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

import * as knowledgeStore from '@cybercontrol/svc-knowledge';

/**
 * Field classification enum — determines fill eligibility.
 * Only PROFILE_DATA and DERIVED_DATA fields may enter fill.
 * @readonly
 * @enum {string}
 */
export const FieldClassification = Object.freeze({
  PROFILE_DATA: 'PROFILE_DATA',
  DERIVED_DATA: 'DERIVED_DATA',
  /** Radio/checkbox decisions — not free-text profile strings (T6). */
  CONDITIONAL: 'CONDITIONAL',
  /** Consent / I Agree / terms. */
  CONSENT: 'CONSENT',
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
  FieldClassification.CONDITIONAL,
  FieldClassification.CONSENT,
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
/**
 * Visible/active gate (T9): skip non-visual / hidden ServicePlus shells.
 * Prefer explicit state; fall back to geometry when present.
 */
export function isNodeVisibleActive(node) {
  if (!node) return false;
  if (node.state) {
    if (node.state.hidden === true || node.state.visible === false) return false;
    if (node.state.enabled === false) return false;
    if (node.state.readonly === true) return false;
  }
  const geom = node.geometry || node.observed?.geometry;
  if (geom) {
    if (geom.width === 0 && geom.height === 0) return false;
    if (geom.opacity === 0) return false;
  }
  // off-screen heuristic
  if (geom && typeof geom.top === 'number' && typeof geom.left === 'number') {
    if (geom.top < -5000 || geom.left < -5000) return false;
  }
  return true;
}

/** Label / name text used for conditional heuristics. */
function nodeLabelText(node) {
  const parts = [
    node?.observed?.accessible_name,
    node?.observed?.description,
    node?.observed?.label,
    node?.name,
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * T6 — radio/checkbox/toggle are CONDITIONAL (or CONSENT), never free-text DATA by default.
 */
export function classifyChoiceField(node) {
  const affordances = node.affordances || [];
  const widget = node.widget || {};
  const role = String(widget.role || widget.input_type || widget.control_type || '').toLowerCase();
  const isToggle =
    affordances.includes('toggle') ||
    /radio|checkbox|switch/.test(role) ||
    widget.behavior_kind === 'toggle' ||
    widget.behavior_kind === 'choice';

  if (!isToggle) return null;

  const label = nodeLabelText(node);
  // Consent / terms
  if (/\b(i\s*agree|accept|terms|privacy|consent|declaration|undertake)\b/i.test(label)) {
    return FieldClassification.CONSENT;
  }
  // Explicit human-only (captcha already handled as challenge)
  if (/\b(otp|captcha|verification code)\b/i.test(label)) {
    return FieldClassification.USER_CONFIRMATION;
  }
  return FieldClassification.CONDITIONAL;
}

export function classifyField(node) {
  if (!node) return FieldClassification.UNKNOWN;

  // T9 — non-visible / inactive never planned as DATA
  if (!isNodeVisibleActive(node)) {
    return FieldClassification.SYSTEM_CONTROL;
  }

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

  // Check privacy classification
  if (node.privacy) {
    if (node.privacy.classification === 'secret') return FieldClassification.SENSITIVE;
    if (node.privacy.classification === 'sensitive') return FieldClassification.SENSITIVE;
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

  // T6 — classify choice fields before defaulting to PROFILE_DATA
  const choiceClass = classifyChoiceField(node);
  if (choiceClass) return choiceClass;

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
/**
 * T2 — label is semantic authority. Score matches; DOM id/name alone never wins.
 * Returns score >= 0 (0 = no match). Higher = better label affinity.
 */
function scoreLabelMatch(nodeName, nodeDesc, payload, nodeIdHint) {
  let score = 0;
  const label = (payload.field_label || '').toLowerCase().trim();
  // Strong: accessible name contains taught field_label
  if (label && nodeName && (nodeName.includes(label) || label.includes(nodeName))) {
    score += 100;
  } else if (label && nodeDesc && nodeDesc.includes(label)) {
    score += 70;
  }

  if (Array.isArray(payload.match_patterns)) {
    for (const pattern of payload.match_patterns) {
      const p = pattern.toLowerCase().trim();
      if (!p) continue;
      if (nodeName && (nodeName.includes(p) || p.includes(nodeName))) score += 90;
      else if (nodeDesc && nodeDesc.includes(p)) score += 50;
    }
  }

  const semKey = (payload.semantic_key || '').toLowerCase().replace(/_/g, ' ');
  if (semKey && nodeName && nodeName.includes(semKey)) score += 60;

  // Weak: id/name hint only — never sole authority if label is empty
  // (prevents email←address, husband←father from id-only steal)
  if (score === 0 && nodeIdHint && payload.profile_key) {
    const idNorm = String(nodeIdHint).toLowerCase().replace(/[^a-z0-9]/g, '');
    const pk = String(payload.profile_key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (pk.length >= 4 && idNorm.includes(pk)) {
      // Require label presence for DATA maps; id-only is too weak
      return 0;
    }
  }

  return score;
}

/**
 * T7 — resolve Yes/No/option for CONDITIONAL / CONSENT from profile flags.
 */
export function resolveConditionalValue(node, profile, mappingPayload) {
  const label = nodeLabelText(node);
  const profileKey = mappingPayload?.profile_key;

  // Direct mapping to a profile flag if taught
  if (profileKey && profile) {
    const entry = profile[profileKey];
    if (entry != null) {
      const raw = String(entry.value ?? entry ?? '').trim();
      if (raw) return normalizeYesNoOption(raw, label);
    }
  }

  // Consent: default Yes when profile has no flag (operator can correct)
  if (/\b(i\s*agree|accept|terms|consent|declaration)\b/i.test(label)) {
    return 'Yes';
  }

  // Disability / PwD
  if (/disabilit|pwd|divyang|handicapped/i.test(label)) {
    const d = profileValue(profile, ['disability', 'pwd', 'is_disabled', 'divyang']);
    if (d != null) return normalizeYesNoOption(d, label);
    return 'No';
  }

  // Ex-serviceman
  if (/ex[-\s]?serviceman|ex[-\s]?service/i.test(label)) {
    const v = profileValue(profile, ['ex_serviceman', 'exserviceman', 'is_ex_serviceman']);
    if (v != null) return normalizeYesNoOption(v, label);
    return 'No';
  }

  // Gender radio group
  if (/\b(gender|sex|पुरुष|महिला)\b/i.test(label) || /male|female|other/i.test(label)) {
    const g = profileValue(profile, ['gender', 'sex']);
    if (g) return String(g);
  }

  // Marital
  if (/\b(marital|married|unmarried|widow)\b/i.test(label)) {
    const m = profileValue(profile, ['marital_status', 'marital', 'married']);
    if (m != null) return String(m);
  }

  // General / Tatkal etc. — only if taught
  return null;
}

function profileValue(profile, keys) {
  if (!profile) return null;
  for (const k of keys) {
    const entry = profile[k];
    if (entry == null) continue;
    const v = String(entry.value ?? entry ?? '').trim();
    if (v) return v;
  }
  return null;
}

function normalizeYesNoOption(raw, label) {
  const s = String(raw).trim().toLowerCase();
  const truthy = ['yes', 'y', 'true', '1', 'haan', 'हां', 'ha'];
  const falsy = ['no', 'n', 'false', '0', 'nahi', 'नहीं', 'na'];
  if (truthy.includes(s)) return /no|नहीं/i.test(label) && !/yes|हां/i.test(label) ? 'No' : 'Yes';
  if (falsy.includes(s)) return 'No';
  // Already an option string (e.g. "Male")
  return String(raw).trim();
}

export function resolveNodeMapping(node, mappings, derivationRules, profile) {
  const classification = classifyField(node);
  if (!isEligibleForFill(classification)) return null;

  // T2 — label is primary signal (accessible_name); description secondary; never id-only
  const nodeName = node.observed?.accessible_name?.toLowerCase()?.trim()
    || node.observed?.label?.toLowerCase()?.trim()
    || '';
  const nodeDesc = node.observed?.description?.toLowerCase()?.trim() || '';
  const nodeIdHint = node.observed?.dom_id || node.observed?.name || node.node_id || '';

  // Find matching field_mapping record by label score
  let bestMapping = null;
  let bestScore = 0;

  for (const record of mappings) {
    const payload = record.payload;
    if (!payload) continue;

    const score = scoreLabelMatch(nodeName, nodeDesc, payload, nodeIdHint)
      + ((payload.priority ?? 0) * 0.01);
    if (score > bestScore) {
      bestMapping = record;
      bestScore = score;
    }
  }

  // T6/T7 — CONDITIONAL / CONSENT may resolve without a taught DATA mapping
  if (
    (classification === FieldClassification.CONDITIONAL
      || classification === FieldClassification.CONSENT)
    && (!bestMapping || bestScore < 50)
  ) {
    const value = resolveConditionalValue(node, profile, bestMapping?.payload || null);
    if (value == null) {
      // No decision — leave unmapped (skip / human), never dump free profile text
      return null;
    }
    return {
      node_id: node.node_id,
      context_id: node.context_id,
      semantic_key: bestMapping?.payload?.semantic_key || 'conditional',
      profile_key: bestMapping?.payload?.profile_key || null,
      value,
      classification,
      transformation: 'conditional_decision',
      mapping_record: bestMapping,
    };
  }

  if (!bestMapping || bestScore < 50) return null;

  const payload = bestMapping.payload;
  let value = null;
  let transformation = 'direct';
  let resolvedClassification = classification === FieldClassification.CONDITIONAL
    || classification === FieldClassification.CONSENT
    ? classification
    : FieldClassification.PROFILE_DATA;

  // Conditional with taught map
  if (
    resolvedClassification === FieldClassification.CONDITIONAL
    || resolvedClassification === FieldClassification.CONSENT
  ) {
    value = resolveConditionalValue(node, profile, payload);
    transformation = 'conditional_decision';
  } else {
    // Check if this is a derivation target
    const derivation = derivationRules.find(
      r => r.payload?.output_key === payload.profile_key
    );

    if (derivation) {
      resolvedClassification = FieldClassification.DERIVED_DATA;
      value = computeDerivedValue(derivation, profile);
      transformation = derivation.payload.logic || 'derived';
    } else {
      // Direct profile lookup
      const entry = profile[payload.profile_key];
      if (entry) {
        value = String(entry.value ?? entry ?? '').trim() || null;
      }
    }
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
 * @returns {Promise<{ mappings: MappingResult[], unmapped: string[], excluded: string[] }>}
 */
export async function resolveAllMappings(snapshot, profile, scope) {
  const fieldMappings = await resolveFieldMappings(scope);
  const derivationRules = await resolveDerivationRules(scope);

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

    const result = resolveNodeMapping(node, fieldMappings, derivationRules, profile);
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
