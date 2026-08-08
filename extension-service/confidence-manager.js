// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Confidence Manager — extension-service/confidence-manager.js
// Phase 5.2 — Learning Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Multi-dimensional confidence tracking for knowledge records.
// NOT a single percentage threshold — tracks multiple independent dimensions.
//
// Design principles (D11, FB-013):
//   - No single-percentage promotion threshold
//   - Multi-dimensional shadow promotion
//   - One critical-field error BLOCKS promotion entirely
//   - Single successful execution is NOT sufficient for promotion
//   - AI proposals need: semantic evidence + successful executions +
//     verification + no corrections + cross-operator consistency
//   - Independent lifecycles for semantic, behavioral, derivation knowledge
//   - Evidence-based promotion only
//
// Dimensions tracked per knowledge record:
//   1. field_mapping_correctness — How often the mapping produces correct fills
//   2. critical_field_correctness — Whether critical fields (name, ID, etc.) are correct
//   3. verification_success — Post-fill verification outcomes
//   4. operator_corrections — Number and severity of operator corrections
//   5. execution_failures — Technical failures during fill execution
//
// Does NOT own: Knowledge CRUD, AI calls, fill execution.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Confidence Dimensions ───────────────────────────────────────────

/**
 * The multi-dimensional confidence model.
 * Each dimension is tracked independently per knowledge record.
 */
export const CONFIDENCE_DIMENSIONS = {
  field_mapping_correctness: {
    description: 'How often the field mapping produces correct fills',
    initialValue: 0.5,
    weight: 0.30,
    minForPromotion: 0.7,
  },
  critical_field_correctness: {
    description: 'Whether critical fields (name, ID, DOB, etc.) are always correct',
    initialValue: 1.0, // starts perfect, any error drops it
    weight: 0.25,
    minForPromotion: 1.0, // MUST be perfect — one error blocks
    isBlocking: true,
  },
  verification_success: {
    description: 'Post-fill verification outcomes (screenshot/DOM check)',
    initialValue: 0.5,
    weight: 0.20,
    minForPromotion: 0.6,
  },
  operator_corrections: {
    description: 'Inverse of correction frequency (fewer corrections = higher)',
    initialValue: 1.0,
    weight: 0.15,
    minForPromotion: 0.8,
  },
  execution_failures: {
    description: 'Inverse of execution failure rate (fewer failures = higher)',
    initialValue: 1.0,
    weight: 0.10,
    minForPromotion: 0.7,
  },
};

// ── Promotion / Demotion Requirements ───────────────────────────────

/**
 * Minimum number of successful executions before ANY promotion is possible.
 * One successful execution is NOT sufficient (Phase 4.3, D11).
 */
const MIN_EXECUTIONS_FOR_PROMOTION = 3;

/**
 * Minimum number of distinct operators who must produce consistent results
 * for cross-operator consistency requirement (AI proposals).
 */
const MIN_OPERATORS_FOR_CONSISTENCY = 2;

/**
 * Number of consecutive corrections that triggers automatic demotion.
 */
const CONSECUTIVE_CORRECTIONS_DEMOTION = 3;

/**
 * Requirements for AI-generated records to be promoted.
 * ALL must be satisfied — no shortcuts.
 */
const AI_PROMOTION_REQUIREMENTS = {
  semanticEvidence: true,       // Must have semantic evidence (label similarity, type match)
  minSuccessfulExecutions: MIN_EXECUTIONS_FOR_PROMOTION,
  verificationRequired: true,   // Must pass post-fill verification
  zeroCorrections: true,        // Must have zero operator corrections
  crossOperatorConsistency: true, // Multiple operators must produce same result
};

/**
 * Lifecycle-specific promotion requirements.
 */
const LIFECYCLE_REQUIREMENTS = {
  semantic: {
    minExecutions: 3,
    minMappingCorrectness: 0.7,
    allowSingleOperator: false,
  },
  behavioral: {
    minExecutions: 5, // behavioral needs more evidence
    minMappingCorrectness: 0.8,
    allowSingleOperator: true, // behavioral can be operator-specific
  },
  derivation: {
    minExecutions: 3,
    minMappingCorrectness: 0.9, // derivation must be very accurate
    allowSingleOperator: false,
  },
};

// ── In-Memory Confidence State ──────────────────────────────────────

/**
 * Per-record confidence state.
 * @type {Map<string, ConfidenceState>}
 */
const confidenceStates = new Map();

/**
 * @typedef {object} ConfidenceState
 * @property {object} dimensions — Current dimension values
 * @property {number} totalExecutions — Total fill executions
 * @property {number} successfulExecutions — Successful (uncorrected) executions
 * @property {number} totalCorrections — Total corrections received
 * @property {number} consecutiveCorrections — Consecutive corrections without success
 * @property {boolean} criticalFieldError — Whether a critical field error occurred
 * @property {Set<string>} operators — Distinct operators who used this record
 * @property {boolean} verificationPassed — Whether verification has passed
 * @property {string} lifecycle — 'semantic' | 'behavioral' | 'derivation'
 * @property {string[]} events — Recent event log
 */

/**
 * Get or initialize the confidence state for a record.
 *
 * @param {string} recordId
 * @returns {ConfidenceState}
 */
function getOrCreateState(recordId) {
  if (!confidenceStates.has(recordId)) {
    confidenceStates.set(recordId, {
      dimensions: {
        field_mapping_correctness: CONFIDENCE_DIMENSIONS.field_mapping_correctness.initialValue,
        critical_field_correctness: CONFIDENCE_DIMENSIONS.critical_field_correctness.initialValue,
        verification_success: CONFIDENCE_DIMENSIONS.verification_success.initialValue,
        operator_corrections: CONFIDENCE_DIMENSIONS.operator_corrections.initialValue,
        execution_failures: CONFIDENCE_DIMENSIONS.execution_failures.initialValue,
      },
      totalExecutions: 0,
      successfulExecutions: 0,
      totalCorrections: 0,
      consecutiveCorrections: 0,
      criticalFieldError: false,
      operators: new Set(),
      verificationPassed: false,
      lifecycle: 'semantic',
      events: [],
    });
  }
  return confidenceStates.get(recordId);
}

// ── Recording Events ────────────────────────────────────────────────

/**
 * Record a successful execution (fill completed without correction).
 *
 * @param {string} recordId
 * @param {object} details — { operator, field, lifecycle }
 * @returns {{ currentConfidence: number, dimensions: object }}
 */
export function recordSuccessfulExecution(recordId, details = {}) {
  const state = getOrCreateState(recordId);

  state.totalExecutions += 1;
  state.successfulExecutions += 1;
  state.consecutiveCorrections = 0; // reset streak

  if (details.operator) {
    state.operators.add(details.operator);
  }
  if (details.lifecycle) {
    state.lifecycle = details.lifecycle;
  }

  // Update dimensions
  const successRate = state.successfulExecutions / state.totalExecutions;
  state.dimensions.field_mapping_correctness = successRate;

  // Execution failures dimension improves on success
  const failureRate = (state.totalExecutions - state.successfulExecutions) / state.totalExecutions;
  state.dimensions.execution_failures = 1 - failureRate;

  addEvent(state, `successful_execution operator=${details.operator || 'unknown'}`);

  return {
    currentConfidence: computeAggregateConfidence(state),
    dimensions: { ...state.dimensions },
  };
}

/**
 * Record an operator correction.
 *
 * @param {string} recordId
 * @param {object} details
 * @param {boolean} details.isCriticalField
 * @param {string} [details.operator]
 * @param {string} [details.field]
 * @param {string} [details.lifecycle]
 * @param {number} [details.degradationRate] — How much to degrade (0–1)
 * @param {number} [details.correctionWeight] — Weight multiplier
 * @returns {{ currentConfidence: number, dimensions: object }}
 */
export function recordCorrection(recordId, details = {}) {
  const state = getOrCreateState(recordId);

  state.totalCorrections += 1;
  state.consecutiveCorrections += 1;
  state.totalExecutions += 1;
  // Do NOT increment successfulExecutions

  if (details.operator) {
    state.operators.add(details.operator);
  }
  if (details.lifecycle) {
    state.lifecycle = details.lifecycle;
  }

  // Critical field errors BLOCK promotion permanently
  if (details.isCriticalField) {
    state.criticalFieldError = true;
    state.dimensions.critical_field_correctness = 0;
    addEvent(state, `CRITICAL_FIELD_ERROR field=${details.field}`);
  }

  // Degrade field_mapping_correctness
  const degradation = (details.degradationRate || 0.15) * (details.correctionWeight || 1.0);
  state.dimensions.field_mapping_correctness = Math.max(
    0,
    state.dimensions.field_mapping_correctness - degradation
  );

  // Degrade operator_corrections dimension
  // Formula: inversely proportional to correction density
  const correctionDensity = state.totalCorrections / Math.max(1, state.totalExecutions);
  state.dimensions.operator_corrections = Math.max(0, 1 - correctionDensity);

  // Update execution_failures (corrections count as "soft failures")
  const successRate = state.successfulExecutions / Math.max(1, state.totalExecutions);
  state.dimensions.execution_failures = successRate;

  addEvent(state, `correction field=${details.field} critical=${details.isCriticalField}`);

  return {
    currentConfidence: computeAggregateConfidence(state),
    dimensions: { ...state.dimensions },
  };
}

/**
 * Record an execution failure (technical error, timeout, crash).
 *
 * @param {string} recordId
 * @param {object} details — { reason, lifecycle }
 * @returns {{ currentConfidence: number, dimensions: object }}
 */
export function recordExecutionFailure(recordId, details = {}) {
  const state = getOrCreateState(recordId);

  state.totalExecutions += 1;
  // Do NOT increment successfulExecutions

  if (details.lifecycle) {
    state.lifecycle = details.lifecycle;
  }

  // Heavily degrade execution_failures dimension
  const failCount = state.totalExecutions - state.successfulExecutions;
  state.dimensions.execution_failures = Math.max(
    0,
    1 - (failCount / Math.max(1, state.totalExecutions))
  );

  addEvent(state, `execution_failure reason=${details.reason || 'unknown'}`);

  return {
    currentConfidence: computeAggregateConfidence(state),
    dimensions: { ...state.dimensions },
  };
}

/**
 * Record a successful verification (post-fill check).
 *
 * @param {string} recordId
 * @param {object} details — { verificationType, operator }
 * @returns {{ currentConfidence: number, dimensions: object }}
 */
export function recordVerificationSuccess(recordId, details = {}) {
  const state = getOrCreateState(recordId);

  state.verificationPassed = true;
  state.dimensions.verification_success = Math.min(
    1.0,
    state.dimensions.verification_success + 0.15
  );

  if (details.operator) {
    state.operators.add(details.operator);
  }

  addEvent(state, `verification_success type=${details.verificationType || 'unknown'}`);

  return {
    currentConfidence: computeAggregateConfidence(state),
    dimensions: { ...state.dimensions },
  };
}

/**
 * Record a failed verification.
 *
 * @param {string} recordId
 * @param {object} details — { reason, verificationType }
 * @returns {{ currentConfidence: number, dimensions: object }}
 */
export function recordVerificationFailure(recordId, details = {}) {
  const state = getOrCreateState(recordId);

  state.verificationPassed = false;
  state.dimensions.verification_success = Math.max(
    0,
    state.dimensions.verification_success - 0.25
  );

  addEvent(state, `verification_failure reason=${details.reason || 'unknown'}`);

  return {
    currentConfidence: computeAggregateConfidence(state),
    dimensions: { ...state.dimensions },
  };
}

// ── Promotion Decision ──────────────────────────────────────────────

/**
 * Determine whether a knowledge record should be promoted.
 * This is the core multi-dimensional decision — NOT a single threshold.
 *
 * @param {string} recordId
 * @param {object} context
 * @param {string} context.currentStatus — Current record status
 * @param {string} context.lifecycle — 'semantic' | 'behavioral' | 'derivation'
 * @param {object} context.executionStats — From knowledge record payload
 * @param {number} context.confidence — Current aggregate confidence
 * @param {string[]} context.tags — Current record tags
 * @returns {{ shouldPromote: boolean, targetStatus: string|null, reason: string, blockers: string[] }}
 */
export function getPromotionDecision(recordId, context) {
  const state = getOrCreateState(recordId);
  const blockers = [];

  // Sync state from context if provided
  if (context.executionStats) {
    state.totalExecutions = context.executionStats.total_executions || state.totalExecutions;
    state.successfulExecutions = context.executionStats.successful_executions || state.successfulExecutions;
  }
  if (context.lifecycle) {
    state.lifecycle = context.lifecycle;
  }

  const lifecycleReqs = LIFECYCLE_REQUIREMENTS[state.lifecycle] || LIFECYCLE_REQUIREMENTS.semantic;
  const isAIGenerated = (context.tags || []).includes('ai_generated');

  // ── Blocking conditions (any one blocks promotion) ──────────────

  // 1. Critical field error is an absolute blocker
  if (state.criticalFieldError) {
    blockers.push('critical_field_error: One or more critical field errors occurred');
  }

  // 2. Minimum executions not met
  if (state.successfulExecutions < lifecycleReqs.minExecutions) {
    blockers.push(
      `insufficient_executions: Need ${lifecycleReqs.minExecutions} successful, have ${state.successfulExecutions}`
    );
  }

  // 3. Field mapping correctness below threshold
  if (state.dimensions.field_mapping_correctness < lifecycleReqs.minMappingCorrectness) {
    blockers.push(
      `low_mapping_correctness: ${state.dimensions.field_mapping_correctness.toFixed(3)} < ${lifecycleReqs.minMappingCorrectness}`
    );
  }

  // 4. Check each dimension against its minimum
  for (const [dim, config] of Object.entries(CONFIDENCE_DIMENSIONS)) {
    if (config.isBlocking && state.dimensions[dim] < config.minForPromotion) {
      blockers.push(`${dim}_blocked: ${state.dimensions[dim].toFixed(3)} < ${config.minForPromotion}`);
    }
  }

  // 5. AI-generated records have stricter requirements
  if (isAIGenerated) {
    if (AI_PROMOTION_REQUIREMENTS.verificationRequired && !state.verificationPassed) {
      blockers.push('ai_needs_verification: Verification has not passed');
    }
    if (AI_PROMOTION_REQUIREMENTS.zeroCorrections && state.totalCorrections > 0) {
      blockers.push(`ai_has_corrections: ${state.totalCorrections} corrections received`);
    }
    if (AI_PROMOTION_REQUIREMENTS.crossOperatorConsistency) {
      if (!lifecycleReqs.allowSingleOperator && state.operators.size < MIN_OPERATORS_FOR_CONSISTENCY) {
        blockers.push(
          `ai_needs_cross_operator: Need ${MIN_OPERATORS_FOR_CONSISTENCY} operators, have ${state.operators.size}`
        );
      }
    }
  }

  // 6. Cross-operator consistency for non-behavioral
  if (!lifecycleReqs.allowSingleOperator && state.operators.size < MIN_OPERATORS_FOR_CONSISTENCY) {
    // Only a blocker for active → validated promotion
    if (context.currentStatus === 'active') {
      blockers.push(
        `needs_cross_operator: Need ${MIN_OPERATORS_FOR_CONSISTENCY} distinct operators, have ${state.operators.size}`
      );
    }
  }

  // ── Decision ────────────────────────────────────────────────────

  if (blockers.length > 0) {
    return {
      shouldPromote: false,
      targetStatus: null,
      reason: blockers[0],
      blockers,
    };
  }

  // Determine target status based on current
  let targetStatus;
  if (context.currentStatus === 'draft') {
    targetStatus = 'active';
  } else if (context.currentStatus === 'active') {
    targetStatus = 'validated';
  } else {
    return {
      shouldPromote: false,
      targetStatus: null,
      reason: `Cannot promote from status: ${context.currentStatus}`,
      blockers: [`invalid_status: ${context.currentStatus}`],
    };
  }

  return {
    shouldPromote: true,
    targetStatus,
    reason: `All ${blockers.length === 0 ? 'dimensions' : ''} requirements met for ${state.lifecycle} lifecycle`,
    blockers: [],
  };
}

// ── Demotion Decision ───────────────────────────────────────────────

/**
 * Determine whether a knowledge record should be demoted.
 *
 * @param {string} recordId
 * @param {object} context
 * @param {string} context.currentStatus
 * @param {string} context.lifecycle
 * @returns {{ shouldDemote: boolean, targetStatus: string|null, reason: string }}
 */
export function getDemotionDecision(recordId, context) {
  const state = getOrCreateState(recordId);

  // Cannot demote drafts further
  if (context.currentStatus === 'draft') {
    return { shouldDemote: false, targetStatus: null, reason: 'Already draft' };
  }
  if (context.currentStatus === 'deprecated' || context.currentStatus === 'superseded') {
    return { shouldDemote: false, targetStatus: null, reason: 'Already deprecated/superseded' };
  }

  // ── Demotion triggers ────────────────────────────────────────────

  // 1. Critical field error → immediate demotion to draft
  if (state.criticalFieldError) {
    return {
      shouldDemote: true,
      targetStatus: 'draft',
      reason: 'Critical field error detected — immediate demotion',
    };
  }

  // 2. Consecutive corrections exceed threshold
  if (state.consecutiveCorrections >= CONSECUTIVE_CORRECTIONS_DEMOTION) {
    return {
      shouldDemote: true,
      targetStatus: 'draft',
      reason: `${state.consecutiveCorrections} consecutive corrections — demotion triggered`,
    };
  }

  // 3. Aggregate confidence below threshold
  const aggregate = computeAggregateConfidence(state);
  if (aggregate < 0.3) {
    const target = context.currentStatus === 'validated' ? 'active' : 'draft';
    return {
      shouldDemote: true,
      targetStatus: target,
      reason: `Aggregate confidence ${aggregate.toFixed(3)} below 0.3`,
    };
  }

  // 4. Any blocking dimension at zero
  for (const [dim, config] of Object.entries(CONFIDENCE_DIMENSIONS)) {
    if (config.isBlocking && state.dimensions[dim] === 0) {
      return {
        shouldDemote: true,
        targetStatus: 'draft',
        reason: `Blocking dimension ${dim} is at zero`,
      };
    }
  }

  return { shouldDemote: false, targetStatus: null, reason: 'No demotion trigger' };
}

// ── Dimension Queries ───────────────────────────────────────────────

/**
 * Get the full confidence state for a record (for diagnostics/display).
 *
 * @param {string} recordId
 * @returns {object|null}
 */
export function getConfidenceState(recordId) {
  const state = confidenceStates.get(recordId);
  if (!state) return null;

  return {
    dimensions: { ...state.dimensions },
    aggregate: computeAggregateConfidence(state),
    totalExecutions: state.totalExecutions,
    successfulExecutions: state.successfulExecutions,
    totalCorrections: state.totalCorrections,
    consecutiveCorrections: state.consecutiveCorrections,
    criticalFieldError: state.criticalFieldError,
    operatorCount: state.operators.size,
    verificationPassed: state.verificationPassed,
    lifecycle: state.lifecycle,
    events: state.events.slice(-20), // last 20 events
  };
}

/**
 * Check if a record has any blocking conditions that prevent promotion.
 *
 * @param {string} recordId
 * @returns {{ blocked: boolean, reasons: string[] }}
 */
export function checkBlockers(recordId) {
  const state = getOrCreateState(recordId);
  const reasons = [];

  if (state.criticalFieldError) {
    reasons.push('critical_field_error');
  }

  for (const [dim, config] of Object.entries(CONFIDENCE_DIMENSIONS)) {
    if (config.isBlocking && state.dimensions[dim] < config.minForPromotion) {
      reasons.push(`${dim}_below_minimum`);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}

/**
 * Reset confidence state for a record (e.g., after re-mapping).
 *
 * @param {string} recordId
 */
export function resetState(recordId) {
  confidenceStates.delete(recordId);
}

/**
 * Initialize state from existing record data (e.g., on server restart).
 *
 * @param {string} recordId
 * @param {object} existingData
 * @param {object} existingData.executionStats
 * @param {number} existingData.confidence
 * @param {string[]} existingData.tags
 * @param {string} existingData.lifecycle
 */
export function initializeFromRecord(recordId, existingData) {
  const state = getOrCreateState(recordId);

  if (existingData.executionStats) {
    state.totalExecutions = existingData.executionStats.total_executions || 0;
    state.successfulExecutions = existingData.executionStats.successful_executions || 0;
  }

  if (existingData.lifecycle) {
    state.lifecycle = existingData.lifecycle;
  }

  // Reconstruct dimensions from stats
  if (state.totalExecutions > 0) {
    const successRate = state.successfulExecutions / state.totalExecutions;
    state.dimensions.field_mapping_correctness = successRate;
    state.dimensions.execution_failures = successRate;
  }

  if (existingData.confidence != null) {
    // Use provided confidence as a baseline for dimensions that can't be reconstructed
    state.dimensions.verification_success = Math.min(1, existingData.confidence + 0.1);
  }

  if (existingData.tags && existingData.tags.includes('critical_field_error')) {
    state.criticalFieldError = true;
    state.dimensions.critical_field_correctness = 0;
  }
}

// ── Aggregate Confidence ────────────────────────────────────────────

/**
 * Compute weighted aggregate confidence from all dimensions.
 * This is for display/sorting purposes ONLY — not for promotion decisions.
 * Promotion uses multi-dimensional checks, not this single number.
 *
 * @param {ConfidenceState} state
 * @returns {number} — 0.0 to 1.0
 */
function computeAggregateConfidence(state) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [dim, config] of Object.entries(CONFIDENCE_DIMENSIONS)) {
    const value = state.dimensions[dim] ?? config.initialValue;
    weightedSum += value * config.weight;
    totalWeight += config.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}

// ── Internal Helpers ────────────────────────────────────────────────

/**
 * Add an event to the state's event log (bounded).
 */
function addEvent(state, description) {
  state.events.push(`${new Date().toISOString()} ${description}`);
  if (state.events.length > 50) {
    state.events = state.events.slice(-40);
  }
}

// ── Exports ─────────────────────────────────────────────────────────

export {
  MIN_EXECUTIONS_FOR_PROMOTION,
  MIN_OPERATORS_FOR_CONSISTENCY,
  CONSECUTIVE_CORRECTIONS_DEMOTION,
  AI_PROMOTION_REQUIREMENTS,
  LIFECYCLE_REQUIREMENTS,
  computeAggregateConfidence,
};
