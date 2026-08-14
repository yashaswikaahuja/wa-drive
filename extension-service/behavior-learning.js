/**
 * Phase 4.12 — Learn Verified Form Dynamic Behavior
 *
 * Stores verified behavior knowledge (STATIC/DYNAMIC) with confidence,
 * provenance, and expiry. Improves future Auto classification.
 *
 * Architecture: Server = Brain + Memory + Knowledge.
 * Behavior learning happens only on the server, never in the extension.
 *
 * Integration: Uses the existing Phase 2 knowledge model (KEYS.MAPPINGS store)
 * rather than a parallel store. Behavior stored under `_behavior` key per form scope.
 */

/**
 * @typedef {object} BehaviorRecord
 * @property {string} behavior - 'static' | 'dynamic'
 * @property {string} classification - 'STATIC' | 'DYNAMIC'
 * @property {number} confidence - 0.0 to 1.0
 * @property {number} hard_evidence_count - total hard DOM evidence events observed
 * @property {number} static_success_count - successful static batch completions
 * @property {number} observation_count - total observations recorded
 * @property {string} last_dynamic_at - ISO timestamp of last dynamic evidence
 * @property {string} last_static_at - ISO timestamp of last static success
 * @property {string} last_observed_at - ISO timestamp of last observation
 * @property {string} first_observed_at - ISO timestamp of first observation
 * @property {string[]} provenance - source evidence types that contributed
 * @property {string|null} expires_at - ISO timestamp when record becomes stale (null = no expiry)
 */

/** After this many days without observation, confidence decays. */
const STALENESS_DAYS = 30;

/** Maximum confidence for dynamic classification. */
const MAX_CONFIDENCE = 0.95;

/** Confidence per hard evidence event. */
const CONFIDENCE_PER_HARD_EVIDENCE = 0.15;

/** Confidence per successful static batch (argues against dynamic). */
const CONFIDENCE_PER_STATIC_SUCCESS = 0.10;

/** Minimum hard evidence count to reach "high confidence" dynamic. */
const HIGH_CONFIDENCE_THRESHOLD = 3;

/**
 * Compute confidence score from evidence counts.
 *
 * @param {object} record - Partial BehaviorRecord
 * @returns {number} 0.0 to MAX_CONFIDENCE
 */
export function computeConfidence(record) {
  const hardCount = record.hard_evidence_count || 0;
  const staticCount = record.static_success_count || 0;

  if (hardCount === 0 && staticCount === 0) return 0;

  // Dynamic evidence increases confidence toward dynamic
  const dynamicSignal = Math.min(hardCount * CONFIDENCE_PER_HARD_EVIDENCE, MAX_CONFIDENCE);

  // Static successes decrease dynamic confidence (contradicting evidence)
  const staticSignal = Math.min(staticCount * CONFIDENCE_PER_STATIC_SUCCESS, 0.5);

  // Dynamic dominates: net = dynamic - fraction of static
  if (hardCount > 0 && dynamicSignal > staticSignal) {
    return Math.min(dynamicSignal - staticSignal * 0.5, MAX_CONFIDENCE);
  }
  // Static dominates: net = static - fraction of dynamic
  if (staticCount > 0 && staticSignal >= dynamicSignal) {
    return Math.min(staticSignal - dynamicSignal * 0.5, MAX_CONFIDENCE);
  }
  return Math.min(dynamicSignal, MAX_CONFIDENCE);
}

/**
 * Determine effective behavior classification from a record.
 *
 * @param {object} record - BehaviorRecord
 * @returns {'STATIC' | 'DYNAMIC' | 'UNKNOWN'}
 */
export function effectiveClassification(record) {
  if (!record) return 'UNKNOWN';

  // Check staleness
  if (isStale(record)) return 'UNKNOWN';

  const confidence = computeConfidence(record);
  const hardCount = record.hard_evidence_count || 0;
  const staticCount = record.static_success_count || 0;

  // High confidence dynamic
  if (hardCount >= HIGH_CONFIDENCE_THRESHOLD && confidence >= 0.4) {
    return 'DYNAMIC';
  }

  // Any hard evidence with positive confidence → dynamic
  if (hardCount > 0 && confidence > 0.1) {
    return 'DYNAMIC';
  }

  // Strong static history with no dynamic evidence
  if (staticCount >= 3 && hardCount === 0) {
    return 'STATIC';
  }

  return 'UNKNOWN';
}

/**
 * Check if a behavior record is stale (no observations in STALENESS_DAYS).
 *
 * @param {object} record
 * @returns {boolean}
 */
export function isStale(record) {
  if (!record?.last_observed_at) return true;
  if (record.expires_at) {
    const expiryDate = new Date(record.expires_at);
    if (expiryDate.getTime() <= Date.now()) return true;
  }

  const lastObserved = new Date(record.last_observed_at);
  const staleCutoff = new Date(Date.now() - STALENESS_DAYS * 24 * 60 * 60 * 1000);
  return lastObserved < staleCutoff;
}

/**
 * Update a behavior record with new dynamic evidence.
 *
 * @param {object|null} existing - Current BehaviorRecord or null
 * @param {object} evidence
 * @param {number} evidence.hard_count - Number of hard DOM evidence events
 * @param {string[]} evidence.types - Evidence type strings (provenance)
 * @returns {BehaviorRecord}
 */
export function recordDynamicEvidence(existing, evidence) {
  const now = new Date().toISOString();
  const record = existing ? { ...existing } : {
    behavior: 'dynamic',
    classification: 'DYNAMIC',
    confidence: 0,
    hard_evidence_count: 0,
    static_success_count: 0,
    observation_count: 0,
    last_dynamic_at: null,
    last_static_at: null,
    last_observed_at: null,
    first_observed_at: now,
    provenance: [],
    expires_at: null,
  };

  record.hard_evidence_count = (record.hard_evidence_count || 0) + (evidence.hard_count || 0);
  record.observation_count = (record.observation_count || 0) + 1;
  record.last_dynamic_at = now;
  record.last_observed_at = now;
  record.behavior = 'dynamic';
  record.classification = 'DYNAMIC';

  // Add provenance (dedupe)
  const provSet = new Set(record.provenance || []);
  for (const type of (evidence.types || [])) {
    provSet.add(type);
  }
  record.provenance = [...provSet];

  // Recompute confidence
  record.confidence = computeConfidence(record);

  // Reset expiry on fresh evidence
  record.expires_at = null;

  return record;
}

/**
 * Update a behavior record with a successful static completion.
 * This is contradicting evidence: the form worked fine in static mode.
 *
 * @param {object|null} existing - Current BehaviorRecord or null
 * @returns {BehaviorRecord}
 */
export function recordStaticSuccess(existing) {
  const now = new Date().toISOString();
  const record = existing ? { ...existing } : {
    behavior: 'static',
    classification: 'STATIC',
    confidence: 0,
    hard_evidence_count: 0,
    static_success_count: 0,
    observation_count: 0,
    last_dynamic_at: null,
    last_static_at: null,
    last_observed_at: null,
    first_observed_at: now,
    provenance: [],
    expires_at: null,
  };

  record.static_success_count = (record.static_success_count || 0) + 1;
  record.observation_count = (record.observation_count || 0) + 1;
  record.last_static_at = now;
  record.last_observed_at = now;

  // If static successes now dominate, reclassify
  const effectiveClass = effectiveClassification(record);
  if (effectiveClass === 'STATIC') {
    record.behavior = 'static';
    record.classification = 'STATIC';
  }

  record.confidence = computeConfidence(record);
  return record;
}

/**
 * Expire/correct a behavior record (manual or automatic).
 * Sets expiry so next classification returns UNKNOWN.
 *
 * @param {object} record
 * @returns {object}
 */
export function expireBehavior(record) {
  if (!record) return record;
  return {
    ...record,
    expires_at: new Date().toISOString(),
    confidence: 0,
  };
}

export {
  STALENESS_DAYS,
  MAX_CONFIDENCE,
  CONFIDENCE_PER_HARD_EVIDENCE,
  HIGH_CONFIDENCE_THRESHOLD,
};
