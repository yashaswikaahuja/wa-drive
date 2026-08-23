// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Validation Engine (Phase 2.4, Issue #88)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Validates knowledge records before persistence or publication.
// Ensures schema conformance, payload correctness per kind, scope
// consistency, lifecycle rules, and conflict detection.
//
// Server-side only. Extension does not validate knowledge.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Constants ───────────────────────────────────────────────────────

const VALID_KINDS = [
  'field_mapping', 'synonym', 'option_translation', 'component_adapter',
  'fill_rule', 'derivation_rule', 'validation_rule', 'portal_definition',
  'experience', 'correction', 'capability_reference',
];

const VALID_STATUSES = ['draft', 'active', 'validated', 'deprecated', 'superseded'];
const VALID_ORIGINS = ['manual', 'learned', 'derived', 'imported', 'ai_generated', 'correction'];
const VALID_LEVELS = ['portal_form', 'portal', 'organization', 'country', 'global'];

const VALID_TRANSITIONS = {
  draft:      ['active', 'deprecated'],
  active:     ['validated', 'deprecated', 'superseded'],
  validated:  ['deprecated', 'superseded'],
  deprecated: [],        // terminal
  superseded: [],        // terminal
};

// ── Main validation entry point ─────────────────────────────────────

/**
 * Validate a knowledge record fully.
 * Returns { valid: boolean, errors: ValidationError[] }
 */
export function validate(record, options = {}) {
  const errors = [];

  // 1. Envelope schema conformance
  errors.push(...validateEnvelope(record));

  // 2. Scope consistency
  if (record.scope) errors.push(...validateScope(record.scope));

  // 3. Payload per-kind validation
  if (record.kind && record.payload) {
    errors.push(...validatePayload(record.kind, record.payload));
  }

  // 4. Lifecycle transition (if updating)
  if (options.previousStatus && record.status) {
    errors.push(...validateTransition(options.previousStatus, record.status));
  }

  // 5. Confidence bounds
  if (record.confidence != null) {
    errors.push(...validateConfidence(record.confidence));
  }

  // 6. Referential integrity (if supersedes set)
  if (record.supersedes && options.checkReferences) {
    errors.push(...validateReferences(record, options));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate for conflicts against existing records.
 * Requires a list of existing candidates (fetched from DB).
 */
export function detectConflicts(record, existingRecords) {
  const conflicts = [];

  for (const existing of existingRecords) {
    // Same lineage + same status = duplicate version
    if (existing.lineage_id === record.lineage_id &&
        existing.version === record.version &&
        existing.id !== record.id) {
      conflicts.push(makeConflict('duplicate_version',
        `Record with lineage ${record.lineage_id} version ${record.version} already exists`,
        existing.id));
    }

    // Same kind + same scope + same semantic key = ambiguous
    if (existing.kind === record.kind &&
        existing.id !== record.id &&
        isSameScope(existing, record) &&
        isSameEntity(existing, record) &&
        isActive(existing)) {
      conflicts.push(makeConflict('ambiguous_scope',
        `Active record '${existing.id}' has same kind, scope, and entity key`,
        existing.id));
    }
  }

  return conflicts;
}

// ── Envelope validation ─────────────────────────────────────────────

function validateEnvelope(record) {
  const errors = [];

  if (!record || typeof record !== 'object') {
    return [makeError('envelope', 'Record must be a non-null object', 'critical')];
  }
  if (!record.kind) {
    errors.push(makeError('kind', 'kind is required', 'critical'));
  } else if (!VALID_KINDS.includes(record.kind)) {
    errors.push(makeError('kind', `Invalid kind: '${record.kind}'. Must be one of: ${VALID_KINDS.join(', ')}`, 'critical'));
  }
  if (record.status && !VALID_STATUSES.includes(record.status)) {
    errors.push(makeError('status', `Invalid status: '${record.status}'. Must be one of: ${VALID_STATUSES.join(', ')}`, 'critical'));
  }
  if (!record.scope) {
    errors.push(makeError('scope', 'scope is required', 'critical'));
  }
  if (!record.source) {
    errors.push(makeError('source', 'source is required', 'critical'));
  } else {
    if (!record.source.origin) {
      errors.push(makeError('source.origin', 'source.origin is required', 'critical'));
    } else if (!VALID_ORIGINS.includes(record.source.origin)) {
      errors.push(makeError('source.origin', `Invalid origin: '${record.source.origin}'`, 'critical'));
    }
  }
  if (record.payload === undefined || record.payload === null) {
    errors.push(makeError('payload', 'payload is required', 'critical'));
  } else if (typeof record.payload !== 'object' || Array.isArray(record.payload)) {
    errors.push(makeError('payload', 'payload must be a plain object', 'critical'));
  }
  if (record.version != null && (typeof record.version !== 'number' || record.version < 1 || !Number.isInteger(record.version))) {
    errors.push(makeError('version', 'version must be a positive integer', 'high'));
  }
  if (record.tags && !Array.isArray(record.tags)) {
    errors.push(makeError('tags', 'tags must be an array', 'low'));
  }

  return errors;
}

// ── Scope validation ────────────────────────────────────────────────

function validateScope(scope) {
  const errors = [];

  if (!scope.level) {
    errors.push(makeError('scope.level', 'scope.level is required', 'critical'));
    return errors;
  }
  if (!VALID_LEVELS.includes(scope.level)) {
    errors.push(makeError('scope.level', `Invalid scope level: '${scope.level}'`, 'critical'));
    return errors;
  }

  // Scope consistency checks
  if (scope.level === 'portal_form') {
    if (!scope.portal_id) errors.push(makeError('scope.portal_id', 'portal_form scope requires portal_id', 'critical'));
    if (!scope.form_key) errors.push(makeError('scope.form_key', 'portal_form scope requires form_key', 'critical'));
  }
  if (scope.level === 'portal' && !scope.portal_id) {
    errors.push(makeError('scope.portal_id', 'portal scope requires portal_id', 'critical'));
  }
  if (scope.level === 'organization' && !scope.organization_id) {
    errors.push(makeError('scope.organization_id', 'organization scope requires organization_id', 'critical'));
  }
  if (scope.level === 'country') {
    if (!scope.country) {
      errors.push(makeError('scope.country', 'country scope requires country code', 'critical'));
    } else if (!/^[A-Z]{2}$/.test(scope.country)) {
      errors.push(makeError('scope.country', `Invalid country code: '${scope.country}'. Must be ISO 3166-1 alpha-2 (e.g. IN, US)`, 'high'));
    }
  }

  // Warn on overly broad portal_id (no dots = likely not a hostname)
  if (scope.portal_id && !scope.portal_id.includes('.') && scope.portal_id.length < 5) {
    errors.push(makeError('scope.portal_id', `portal_id '${scope.portal_id}' looks invalid (expected hostname)`, 'low'));
  }

  return errors;
}

// ── Confidence validation ───────────────────────────────────────────

function validateConfidence(confidence) {
  const errors = [];
  if (typeof confidence !== 'number' || isNaN(confidence)) {
    errors.push(makeError('confidence', 'confidence must be a number', 'high'));
  } else if (confidence < 0 || confidence > 1) {
    errors.push(makeError('confidence', `confidence must be 0.0–1.0, got ${confidence}`, 'high'));
  }
  return errors;
}

// ── Lifecycle transition validation ─────────────────────────────────

function validateTransition(from, to) {
  const errors = [];
  if (from === to) return errors; // no-op transition is fine

  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) {
    errors.push(makeError('status', `Unknown previous status: '${from}'`, 'high'));
    return errors;
  }
  if (!allowed.includes(to)) {
    errors.push(makeError('status', `Invalid transition: '${from}' → '${to}'. Allowed: ${allowed.join(', ') || 'none (terminal)'}`, 'high'));
  }
  return errors;
}

// ── Referential integrity ───────────────────────────────────────────

function validateReferences(record, options) {
  const errors = [];
  if (record.supersedes && options.existingIds) {
    if (!options.existingIds.includes(record.supersedes)) {
      errors.push(makeError('supersedes', `Referenced record '${record.supersedes}' does not exist`, 'high'));
    }
  }
  return errors;
}

// ── Per-kind payload validation ─────────────────────────────────────

function validatePayload(kind, payload) {
  const validator = PAYLOAD_VALIDATORS[kind];
  if (!validator) return []; // unknown kind already caught by envelope
  return validator(payload);
}

const PAYLOAD_VALIDATORS = {
  field_mapping(p) {
    const e = [];
    if (!p.field_label || typeof p.field_label !== 'string') e.push(makeError('payload.field_label', 'field_label is required (string)', 'critical'));
    if (!p.semantic_key || typeof p.semantic_key !== 'string') e.push(makeError('payload.semantic_key', 'semantic_key is required (string)', 'critical'));
    if (!p.profile_key || typeof p.profile_key !== 'string') e.push(makeError('payload.profile_key', 'profile_key is required (string)', 'critical'));
    if (p.field_type && !['text','select','radio','checkbox','date','file','textarea','number'].includes(p.field_type)) {
      e.push(makeError('payload.field_type', `Invalid field_type: '${p.field_type}'`, 'medium'));
    }
    if (p.match_patterns && !Array.isArray(p.match_patterns)) e.push(makeError('payload.match_patterns', 'match_patterns must be an array', 'medium'));
    return e;
  },

  synonym(p) {
    const e = [];
    if (!p.canonical || typeof p.canonical !== 'string') e.push(makeError('payload.canonical', 'canonical is required (string)', 'critical'));
    if (!p.variants || !Array.isArray(p.variants) || p.variants.length === 0) e.push(makeError('payload.variants', 'variants must be a non-empty array', 'critical'));
    if (p.variants && p.variants.some(v => typeof v !== 'string')) e.push(makeError('payload.variants', 'All variants must be strings', 'medium'));
    return e;
  },

  option_translation(p) {
    const e = [];
    if (!p.profile_value || typeof p.profile_value !== 'string') e.push(makeError('payload.profile_value', 'profile_value is required (string)', 'critical'));
    if (!p.option_text || typeof p.option_text !== 'string') e.push(makeError('payload.option_text', 'option_text is required (string)', 'critical'));
    if (!p.field_semantic_key || typeof p.field_semantic_key !== 'string') e.push(makeError('payload.field_semantic_key', 'field_semantic_key is required (string)', 'critical'));
    return e;
  },

  component_adapter(p) {
    const e = [];
    if (!p.component_class || typeof p.component_class !== 'string') e.push(makeError('payload.component_class', 'component_class is required (string)', 'critical'));
    if (!p.detection || typeof p.detection !== 'object') e.push(makeError('payload.detection', 'detection is required (object)', 'critical'));
    if (!p.interaction || typeof p.interaction !== 'object') {
      e.push(makeError('payload.interaction', 'interaction is required (object)', 'critical'));
    } else {
      if (!p.interaction.trigger_selector) e.push(makeError('payload.interaction.trigger_selector', 'trigger_selector is required', 'high'));
      if (!p.interaction.option_selector) e.push(makeError('payload.interaction.option_selector', 'option_selector is required', 'high'));
    }
    return e;
  },

  fill_rule(p) {
    const e = [];
    if (!p.target_semantic_key || typeof p.target_semantic_key !== 'string') e.push(makeError('payload.target_semantic_key', 'target_semantic_key is required', 'critical'));
    if (!p.condition || typeof p.condition !== 'object') {
      e.push(makeError('payload.condition', 'condition is required (object)', 'critical'));
    } else {
      if (!p.condition.operator) e.push(makeError('payload.condition.operator', 'condition.operator is required', 'high'));
      if (!p.condition.field) e.push(makeError('payload.condition.field', 'condition.field is required', 'high'));
    }
    if (!p.action || typeof p.action !== 'object') {
      e.push(makeError('payload.action', 'action is required (object)', 'critical'));
    } else {
      if (!p.action.type) e.push(makeError('payload.action.type', 'action.type is required', 'high'));
      else if (!['fill','skip','transform','use_alternative'].includes(p.action.type)) {
        e.push(makeError('payload.action.type', `Invalid action type: '${p.action.type}'`, 'high'));
      }
    }
    return e;
  },

  derivation_rule(p) {
    const e = [];
    if (!p.output_key || typeof p.output_key !== 'string') e.push(makeError('payload.output_key', 'output_key is required', 'critical'));
    if (!p.inputs || !Array.isArray(p.inputs) || p.inputs.length === 0) e.push(makeError('payload.inputs', 'inputs must be a non-empty array', 'critical'));
    if (!p.logic || typeof p.logic !== 'string') e.push(makeError('payload.logic', 'logic is required (string)', 'critical'));
    return e;
  },

  validation_rule(p) {
    const e = [];
    if (!p.target_semantic_key || typeof p.target_semantic_key !== 'string') e.push(makeError('payload.target_semantic_key', 'target_semantic_key is required', 'critical'));
    if (!p.rule_type || typeof p.rule_type !== 'string') e.push(makeError('payload.rule_type', 'rule_type is required', 'critical'));
    else if (!['regex','length','range','format','dependency','custom'].includes(p.rule_type)) {
      e.push(makeError('payload.rule_type', `Invalid rule_type: '${p.rule_type}'`, 'high'));
    }
    if (!p.constraint || typeof p.constraint !== 'object') e.push(makeError('payload.constraint', 'constraint is required (object)', 'critical'));
    return e;
  },

  portal_definition(p) {
    const e = [];
    if (!p.hostname || typeof p.hostname !== 'string') e.push(makeError('payload.hostname', 'hostname is required', 'critical'));
    if (!p.display_name || typeof p.display_name !== 'string') e.push(makeError('payload.display_name', 'display_name is required', 'critical'));
    if (p.platform && !['serviceplus','asp_net','php','angular','react','static','unknown'].includes(p.platform)) {
      e.push(makeError('payload.platform', `Invalid platform: '${p.platform}'`, 'medium'));
    }
    return e;
  },

  experience(p) {
    const e = [];
    if (!p.session_id) e.push(makeError('payload.session_id', 'session_id is required', 'critical'));
    if (!p.portal_id) e.push(makeError('payload.portal_id', 'portal_id is required', 'critical'));
    if (!p.form_key) e.push(makeError('payload.form_key', 'form_key is required', 'critical'));
    if (!p.profile_id) e.push(makeError('payload.profile_id', 'profile_id is required', 'critical'));
    if (!p.outcome) e.push(makeError('payload.outcome', 'outcome is required', 'critical'));
    else if (!['success','partial','failure','abandoned'].includes(p.outcome)) {
      e.push(makeError('payload.outcome', `Invalid outcome: '${p.outcome}'`, 'high'));
    }
    return e;
  },

  correction(p) {
    const e = [];
    if (!p.target_record_id) e.push(makeError('payload.target_record_id', 'target_record_id is required', 'critical'));
    if (!p.target_kind) e.push(makeError('payload.target_kind', 'target_kind is required', 'critical'));
    if (!p.after || typeof p.after !== 'object') e.push(makeError('payload.after', 'after is required (object)', 'critical'));
    return e;
  },

  capability_reference(p) {
    const e = [];
    if (!p.capability_name || typeof p.capability_name !== 'string') e.push(makeError('payload.capability_name', 'capability_name is required', 'critical'));
    if (!p.description || typeof p.description !== 'string') e.push(makeError('payload.description', 'description is required', 'critical'));
    return e;
  },
};

// ── Helpers ─────────────────────────────────────────────────────────

function makeError(field, message, severity = 'medium') {
  return { field, message, severity };
}

function makeConflict(type, message, conflicting_id) {
  return { type, message, conflicting_id };
}

function isSameScope(a, b) {
  const aScope = a.scope || a;
  const bScope = b.scope || b;
  const aLevel = aScope.level || aScope.scope_level;
  const bLevel = bScope.level || bScope.scope_level;
  if (aLevel !== bLevel) return false;
  const aPortal = aScope.portal_id || aScope.scope_portal_id;
  const bPortal = bScope.portal_id || bScope.scope_portal_id;
  const aForm = aScope.form_key || aScope.scope_form_key;
  const bForm = bScope.form_key || bScope.scope_form_key;
  const aOrg = aScope.organization_id || aScope.scope_org_id;
  const bOrg = bScope.organization_id || bScope.scope_org_id;
  const aCountry = aScope.country || aScope.scope_country;
  const bCountry = bScope.country || bScope.scope_country;
  return aPortal === bPortal && aForm === bForm && aOrg === bOrg && aCountry === bCountry;
}

function isSameEntity(a, b) {
  const aKey = entityKey(a);
  const bKey = entityKey(b);
  return aKey && bKey && aKey === bKey;
}

function entityKey(record) {
  const p = record.payload || {};
  return p.semantic_key || p.canonical || p.component_class || p.capability_name || p.hostname || null;
}

function isActive(record) {
  const s = record.status || record.scope_status;
  return s === 'active' || s === 'validated';
}

// ── Exports ─────────────────────────────────────────────────────────

export {
  validateEnvelope,
  validateScope,
  validatePayload,
  validateTransition,
  validateConfidence,
  VALID_KINDS,
  VALID_STATUSES,
  VALID_ORIGINS,
  VALID_LEVELS,
  VALID_TRANSITIONS,
};
