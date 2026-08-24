// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Learning Engine — extension-service/learning-engine.js
// Phase 5.2 — Learning Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Processes operator corrections into knowledge updates.
// Routes corrections to the appropriate knowledge-type handler
// and applies independent lifecycles per knowledge kind.
//
// Responsibilities:
//   - Receive correction records (from /api/corrections handler)
//   - Identify affected knowledge records
//   - Route to semantic / behavioral / derivation handler
//   - Apply confidence degradation via confidence-manager
//   - Trigger re-mapping when confidence falls below threshold
//   - Maintain observation journal per session (audit trail)
//
// Does NOT own: Knowledge persistence (delegates to knowledge-store),
//   scope promotion (delegates to generalization-engine),
//   AI calls, fill planning.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as knowledgeStore from '@cybercontrol/svc-knowledge';
import {
  recordCorrection,
  recordExecutionFailure,
  getPromotionDecision,
  getDemotionDecision,
  CONFIDENCE_DIMENSIONS,
} from './confidence-manager.js';

// ── Configuration ───────────────────────────────────────────────────

/** Confidence threshold below which re-mapping is triggered */
const REMAP_THRESHOLD = 0.25;

/** Maximum journal entries per session before rotation */
const MAX_JOURNAL_ENTRIES = 500;

/** How long a session journal is kept in memory (ms) */
const SESSION_JOURNAL_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Knowledge Lifecycle Types ───────────────────────────────────────

/**
 * Independent lifecycle categories. Each has different promotion/demotion
 * behavior per D11 requirements.
 */
const LIFECYCLE_TYPES = {
  semantic: {
    kinds: ['field_mapping', 'synonym', 'option_translation'],
    correctionWeight: 1.0,
    remapThreshold: REMAP_THRESHOLD,
    degradationRate: 0.15, // per correction
  },
  behavioral: {
    kinds: ['component_adapter', 'fill_rule'],
    correctionWeight: 0.8,
    remapThreshold: 0.20,
    degradationRate: 0.10,
  },
  derivation: {
    kinds: ['derivation_rule', 'validation_rule'],
    correctionWeight: 1.2, // derivation errors are more costly
    remapThreshold: 0.30,
    degradationRate: 0.20,
  },
};

// ── Session Observation Journal ─────────────────────────────────────

/**
 * In-memory observation journals per session.
 * Provides audit trail of all learning decisions.
 * @type {Map<string, { entries: Array, createdAt: number }>}
 */
const sessionJournals = new Map();

/**
 * Record an observation to the session journal.
 *
 * @param {string} sessionId
 * @param {object} entry
 */
function journalRecord(sessionId, entry) {
  if (!sessionId) return;

  let journal = sessionJournals.get(sessionId);
  if (!journal) {
    journal = { entries: [], createdAt: Date.now() };
    sessionJournals.set(sessionId, journal);
  }

  journal.entries.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });

  // Rotate if too many entries
  if (journal.entries.length > MAX_JOURNAL_ENTRIES) {
    journal.entries = journal.entries.slice(-Math.floor(MAX_JOURNAL_ENTRIES * 0.8));
  }
}

/**
 * Get the observation journal for a session.
 *
 * @param {string} sessionId
 * @returns {Array}
 */
export function getSessionJournal(sessionId) {
  const journal = sessionJournals.get(sessionId);
  return journal ? journal.entries : [];
}

/**
 * Clean up expired session journals.
 */
export function cleanupExpiredJournals() {
  const now = Date.now();
  for (const [sessionId, journal] of sessionJournals) {
    if (now - journal.createdAt > SESSION_JOURNAL_TTL_MS) {
      sessionJournals.delete(sessionId);
    }
  }
}

// Periodic cleanup every 5 minutes
const _cleanupInterval = setInterval(cleanupExpiredJournals, 5 * 60 * 1000);
// Allow process to exit without waiting for this timer
if (_cleanupInterval.unref) _cleanupInterval.unref();

// ── Lifecycle Resolution ────────────────────────────────────────────

/**
 * Determine which lifecycle type a knowledge kind belongs to.
 *
 * @param {string} kind — Knowledge record kind
 * @returns {object|null} — Lifecycle config or null if unknown
 */
function resolveLifecycle(kind) {
  for (const [type, config] of Object.entries(LIFECYCLE_TYPES)) {
    if (config.kinds.includes(kind)) {
      return { type, ...config };
    }
  }
  return null;
}

// ── Correction Processing ───────────────────────────────────────────

/**
 * @typedef {object} CorrectionRecord
 * @property {string} field — Field label or semantic key
 * @property {string} [originalValue] — What was filled
 * @property {string} [finalOperatorValue] — What operator changed it to
 * @property {string} [operatorValue] — Alternative field for final value
 * @property {string} [reason] — Why the correction was made
 * @property {boolean} [isCriticalField] — Whether this field is critical (name, ID, etc.)
 */

/**
 * @typedef {object} CorrectionContext
 * @property {string} workspaceId
 * @property {string} [userId] — Operator who made the correction
 * @property {string} [sessionId] — Fill session ID
 * @property {string} hostname — Portal hostname
 * @property {string} [semanticFormKey] — Form identifier
 * @property {string} [profileId] — Profile being filled
 * @property {string} [trigger] — What triggered the correction (manual, verification, etc.)
 */

/**
 * Process a batch of corrections from a fill session.
 * This is the main entry point called by the corrections route.
 *
 * @param {CorrectionRecord[]} corrections
 * @param {CorrectionContext} context
 * @returns {Promise<ProcessingResult>}
 */
export async function processCorrections(corrections, context) {
  if (!Array.isArray(corrections) || corrections.length === 0) {
    return { processed: 0, updated: 0, remapped: 0, errors: [] };
  }

  const result = {
    processed: 0,
    updated: 0,
    remapped: 0,
    demoted: 0,
    errors: [],
  };

  journalRecord(context.sessionId, {
    event: 'correction_batch_received',
    count: corrections.length,
    context: {
      hostname: context.hostname,
      formKey: context.semanticFormKey,
      operator: context.userId,
      trigger: context.trigger,
    },
  });

  for (const correction of corrections) {
    try {
      const outcome = await processSingleCorrection(correction, context);
      result.processed++;

      if (outcome.updated) result.updated++;
      if (outcome.remapped) result.remapped++;
      if (outcome.demoted) result.demoted++;

      journalRecord(context.sessionId, {
        event: 'correction_processed',
        field: correction.field,
        outcome,
      });
    } catch (err) {
      result.errors.push({
        field: correction.field,
        error: err.message,
      });

      journalRecord(context.sessionId, {
        event: 'correction_error',
        field: correction.field,
        error: err.message,
      });
    }
  }

  journalRecord(context.sessionId, {
    event: 'correction_batch_complete',
    result,
  });

  return result;
}

/**
 * Process a single correction record.
 *
 * @param {CorrectionRecord} correction
 * @param {CorrectionContext} context
 * @returns {Promise<object>}
 */
async function processSingleCorrection(correction, context) {
  const outcome = {
    updated: false,
    remapped: false,
    demoted: false,
    affectedRecords: [],
    lifecycle: null,
  };

  // 1. Find the affected knowledge record(s)
  const affectedRecords = await findAffectedRecords(correction, context);

  if (affectedRecords.length === 0) {
    // No existing knowledge record — this is a new mapping opportunity
    outcome.action = 'no_record_found';
    return outcome;
  }

  for (const record of affectedRecords) {
    const lifecycle = resolveLifecycle(record.kind);
    if (!lifecycle) {
      outcome.action = 'unknown_lifecycle';
      continue;
    }

    outcome.lifecycle = lifecycle.type;

    // 2. Route to appropriate handler based on lifecycle type
    const handlerResult = await routeToHandler(lifecycle.type, record, correction, context);

    // 3. Apply confidence degradation via confidence-manager
    const confidenceUpdate = recordCorrection(record.id, {
      isCriticalField: correction.isCriticalField || false,
      operator: context.userId,
      field: correction.field,
      lifecycle: lifecycle.type,
      degradationRate: lifecycle.degradationRate,
      correctionWeight: lifecycle.correctionWeight,
    });

    // 4. Check for demotion
    const demotionDecision = getDemotionDecision(record.id, {
      currentStatus: record.status,
      lifecycle: lifecycle.type,
    });

    if (demotionDecision.shouldDemote) {
      await applyDemotion(record, demotionDecision, context);
      outcome.demoted = true;
    }

    // 5. Check if confidence degraded below re-mapping threshold
    if (confidenceUpdate.currentConfidence < lifecycle.remapThreshold) {
      await triggerRemap(record, correction, context);
      outcome.remapped = true;
    }

    // 6. Update the knowledge record with correction metadata
    if (handlerResult.updatedPayload) {
      await knowledgeStore.update(record.id, {
        payload: handlerResult.updatedPayload,
        confidence: confidenceUpdate.currentConfidence,
        tags: appendTag(record.tags, 'corrected'),
      });
      outcome.updated = true;
    }

    outcome.affectedRecords.push(record.id);
  }

  return outcome;
}

// ── Knowledge Record Lookup ─────────────────────────────────────────

/**
 * Find knowledge records affected by a correction.
 *
 * @param {CorrectionRecord} correction
 * @param {CorrectionContext} context
 * @returns {Promise<object[]>}
 */
async function findAffectedRecords(correction, context) {
  const semanticKey = normalizeSemanticKey(correction.field);
  const records = [];

  // Search for field_mapping records matching the field
  const fieldMappings = await knowledgeStore.query({
    kind: 'field_mapping',
    scope: {
      portal_id: context.hostname,
      form_key: context.semanticFormKey,
    },
    status: 'active',
  });

  for (const record of fieldMappings) {
    if (record.payload.semantic_key === semanticKey) {
      records.push(record);
    }
  }

  // Also check draft records that may have been used
  const draftMappings = await knowledgeStore.query({
    kind: 'field_mapping',
    scope: {
      portal_id: context.hostname,
      form_key: context.semanticFormKey,
    },
    status: 'draft',
  });

  for (const record of draftMappings) {
    if (record.payload.semantic_key === semanticKey) {
      records.push(record);
    }
  }

  // Search for component_adapter records if this looks behavioral
  if (correction.reason && /interact|click|select|dropdown|widget/i.test(correction.reason)) {
    const adapters = await knowledgeStore.query({
      kind: 'component_adapter',
      scope: {
        portal_id: context.hostname,
        form_key: context.semanticFormKey,
      },
      status: 'active',
    });
    records.push(...adapters);
  }

  return records;
}

// ── Lifecycle-Specific Handlers ─────────────────────────────────────

/**
 * Route a correction to the appropriate lifecycle handler.
 *
 * @param {string} lifecycleType — 'semantic' | 'behavioral' | 'derivation'
 * @param {object} record — Affected knowledge record
 * @param {CorrectionRecord} correction
 * @param {CorrectionContext} context
 * @returns {Promise<{ updatedPayload: object|null }>}
 */
async function routeToHandler(lifecycleType, record, correction, context) {
  switch (lifecycleType) {
    case 'semantic':
      return handleSemanticCorrection(record, correction, context);
    case 'behavioral':
      return handleBehavioralCorrection(record, correction, context);
    case 'derivation':
      return handleDerivationCorrection(record, correction, context);
    default:
      return { updatedPayload: null };
  }
}

/**
 * Handle a correction to a semantic knowledge record (field_mapping, synonym, etc.).
 * Semantic corrections usually mean the profile_key mapping was wrong.
 */
async function handleSemanticCorrection(record, correction, context) {
  const payload = { ...record.payload };

  // Track correction history in payload
  if (!payload.correction_history) {
    payload.correction_history = [];
  }

  payload.correction_history.push({
    at: new Date().toISOString(),
    operator: context.userId,
    original_value: correction.originalValue || null,
    corrected_value: correction.finalOperatorValue || correction.operatorValue || null,
    reason: correction.reason || null,
    is_critical: correction.isCriticalField || false,
  });

  // If the correction provides a different mapping target
  const finalValue = correction.finalOperatorValue || correction.operatorValue;
  if (finalValue && finalValue !== correction.originalValue) {
    payload.last_correction = {
      original_profile_key: payload.profile_key,
      corrected_at: new Date().toISOString(),
      operator: context.userId,
    };
  }

  // Update execution stats to reflect the failure
  if (payload.execution_stats) {
    payload.execution_stats.total_executions =
      (payload.execution_stats.total_executions || 0) + 1;
    // Do NOT increment successful_executions — this was a correction
  }

  return { updatedPayload: payload };
}

/**
 * Handle a correction to a behavioral knowledge record (component_adapter, fill_rule).
 * Behavioral corrections mean the interaction pattern was wrong or incomplete.
 */
async function handleBehavioralCorrection(record, correction, context) {
  const payload = { ...record.payload };

  if (!payload.behavioral_corrections) {
    payload.behavioral_corrections = [];
  }

  payload.behavioral_corrections.push({
    at: new Date().toISOString(),
    operator: context.userId,
    description: correction.reason || 'Behavioral interaction failed',
    field: correction.field,
  });

  // Mark behavioral fingerprint as potentially stale
  if (payload.behavioral_fingerprint) {
    payload.fingerprint_stale = true;
    payload.stale_since = new Date().toISOString();
  }

  return { updatedPayload: payload };
}

/**
 * Handle a correction to a derivation knowledge record (derivation_rule, validation_rule).
 * Derivation corrections are the most severe — they indicate logic errors.
 */
async function handleDerivationCorrection(record, correction, context) {
  const payload = { ...record.payload };

  if (!payload.derivation_corrections) {
    payload.derivation_corrections = [];
  }

  payload.derivation_corrections.push({
    at: new Date().toISOString(),
    operator: context.userId,
    input_value: correction.originalValue || null,
    expected_output: correction.finalOperatorValue || correction.operatorValue || null,
    reason: correction.reason || null,
    is_critical: correction.isCriticalField || false,
  });

  // Derivation rules with corrections are marked suspect
  payload.derivation_status = 'suspect';
  payload.suspect_since = new Date().toISOString();

  return { updatedPayload: payload };
}

// ── Demotion ────────────────────────────────────────────────────────

/**
 * Apply a demotion decision to a knowledge record.
 *
 * @param {object} record
 * @param {object} demotionDecision
 * @param {CorrectionContext} context
 */
async function applyDemotion(record, demotionDecision, context) {
  const newStatus = demotionDecision.targetStatus || 'draft';

  await knowledgeStore.update(record.id, {
    status: newStatus,
    tags: appendTag(record.tags, 'demoted'),
    payload: {
      ...record.payload,
      demotion_history: [
        ...(record.payload.demotion_history || []),
        {
          at: new Date().toISOString(),
          from_status: record.status,
          to_status: newStatus,
          reason: demotionDecision.reason,
          operator: context.userId,
        },
      ],
    },
  });

  journalRecord(context.sessionId, {
    event: 'record_demoted',
    recordId: record.id,
    from: record.status,
    to: newStatus,
    reason: demotionDecision.reason,
  });
}

// ── Re-Mapping Trigger ──────────────────────────────────────────────

/**
 * Trigger re-mapping when confidence degrades below threshold.
 * Marks the record as needing re-evaluation and optionally
 * schedules a semantic-mapper re-run on next fill.
 *
 * @param {object} record
 * @param {CorrectionRecord} correction
 * @param {CorrectionContext} context
 */
async function triggerRemap(record, correction, context) {
  // Deprecate the current record
  await knowledgeStore.update(record.id, {
    status: 'deprecated',
    tags: appendTag(record.tags, 'confidence_degraded'),
    payload: {
      ...record.payload,
      deprecated_reason: 'confidence_below_threshold',
      deprecated_at: new Date().toISOString(),
      last_correction: {
        field: correction.field,
        operator: context.userId,
      },
    },
  });

  journalRecord(context.sessionId, {
    event: 'remap_triggered',
    recordId: record.id,
    kind: record.kind,
    reason: 'confidence_below_threshold',
    field: correction.field,
  });
}

// ── Execution Outcome Tracking ──────────────────────────────────────

/**
 * Record a successful fill execution (no correction was made).
 * Called when a fill session completes without operator intervention.
 *
 * @param {string} recordId — Knowledge record ID
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function recordSuccessfulExecution(recordId, context) {
  const record = await knowledgeStore.getById(recordId);
  if (!record) return { success: false, reason: 'Record not found' };

  const lifecycle = resolveLifecycle(record.kind);
  if (!lifecycle) return { success: false, reason: 'Unknown lifecycle' };

  // Update execution stats
  const payload = { ...record.payload };
  if (!payload.execution_stats) {
    payload.execution_stats = {
      successful_executions: 0,
      total_executions: 0,
      human_confirmed: false,
      last_executed_at: null,
    };
  }

  payload.execution_stats.successful_executions += 1;
  payload.execution_stats.total_executions += 1;
  payload.execution_stats.last_executed_at = new Date().toISOString();

  // Check for promotion via confidence-manager
  const promotionDecision = getPromotionDecision(recordId, {
    currentStatus: record.status,
    lifecycle: lifecycle.type,
    executionStats: payload.execution_stats,
    confidence: record.confidence,
    tags: record.tags,
  });

  if (promotionDecision.shouldPromote) {
    await knowledgeStore.update(record.id, {
      status: promotionDecision.targetStatus,
      confidence: Math.min(0.95, record.confidence + 0.03),
      payload: {
        ...payload,
        promoted_at: new Date().toISOString(),
        promotion_reason: promotionDecision.reason,
      },
      tags: appendTag(record.tags, 'promoted').filter(t => t !== 'needs_confirmation'),
    });

    journalRecord(context.sessionId, {
      event: 'record_promoted',
      recordId: record.id,
      to: promotionDecision.targetStatus,
      reason: promotionDecision.reason,
    });

    return { success: true, promoted: true, reason: promotionDecision.reason };
  }

  // Just update stats
  await knowledgeStore.update(record.id, {
    payload,
  });

  journalRecord(context.sessionId, {
    event: 'execution_recorded',
    recordId: record.id,
    stats: payload.execution_stats,
  });

  return { success: true, promoted: false };
}

/**
 * Record an execution failure (fill attempted but crashed/timed out).
 *
 * @param {string} recordId
 * @param {object} failureDetails — { reason, errorType, field }
 * @param {object} context
 * @returns {Promise<object>}
 */
export async function recordFailedExecution(recordId, failureDetails, context) {
  const record = await knowledgeStore.getById(recordId);
  if (!record) return { success: false, reason: 'Record not found' };

  // Record failure in confidence-manager
  recordExecutionFailure(recordId, {
    reason: failureDetails.reason,
    lifecycle: resolveLifecycle(record.kind)?.type || 'semantic',
  });

  const payload = { ...record.payload };
  if (!payload.execution_stats) {
    payload.execution_stats = {
      successful_executions: 0,
      total_executions: 0,
      human_confirmed: false,
      last_executed_at: null,
    };
  }
  payload.execution_stats.total_executions += 1;
  payload.execution_stats.last_executed_at = new Date().toISOString();

  if (!payload.failure_log) payload.failure_log = [];
  payload.failure_log.push({
    at: new Date().toISOString(),
    reason: failureDetails.reason,
    errorType: failureDetails.errorType,
    field: failureDetails.field,
  });

  // Keep failure log bounded
  if (payload.failure_log.length > 20) {
    payload.failure_log = payload.failure_log.slice(-15);
  }

  await knowledgeStore.update(record.id, {
    payload,
    confidence: Math.max(0, record.confidence - 0.05),
  });

  journalRecord(context.sessionId, {
    event: 'execution_failed',
    recordId: record.id,
    reason: failureDetails.reason,
  });

  return { success: true };
}

// ── Utilities ───────────────────────────────────────────────────────

/**
 * Normalize a field label into a semantic key.
 * @param {string} label
 * @returns {string}
 */
function normalizeSemanticKey(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_');
}

/**
 * Append a tag to a tags array without duplicates.
 * @param {string[]} tags
 * @param {string} tag
 * @returns {string[]}
 */
function appendTag(tags, tag) {
  const arr = Array.isArray(tags) ? [...tags] : [];
  if (!arr.includes(tag)) arr.push(tag);
  return arr;
}

// ── Exports ─────────────────────────────────────────────────────────

export {
  resolveLifecycle,
  LIFECYCLE_TYPES,
  REMAP_THRESHOLD,
  normalizeSemanticKey,
};
