/**
 * Phase 4.13 — HIM Runtime Integration with Adaptive Execution
 *
 * Integrates the ratified HIM protocol (Phase 4.0) into the adaptive
 * execution loop (M4.5–M4.7) without redefining the frozen HIM contract.
 *
 * Responsibilities:
 * - Detect when a plan step requires HIM (human interaction checkpoint)
 * - Pause adaptive execution safely at checkpoint
 * - Resume after HIM confirmation with browser state revalidation
 * - Preserve operator-visible execution state across pause/resume
 *
 * Does NOT:
 * - Redefine HIM protocol or state machine
 * - Create a second human-interaction protocol
 * - Bypass safety demotion or plan race guards
 */

import { randomUUID } from 'node:crypto';

/**
 * Step risk levels that require HIM confirmation before execution.
 * Only 'irreversible' steps require human confirmation.
 */
const HIM_REQUIRED_RISKS = new Set(['irreversible']);

/**
 * Determine if a plan step requires a HIM checkpoint.
 *
 * @param {object} step - ActionPlan step
 * @param {object} planAuth - Plan authorization block
 * @returns {boolean}
 */
export function requiresHimCheckpoint(step, planAuth) {
  // Irreversible steps always require HIM unless operator pre-confirmed
  if (HIM_REQUIRED_RISKS.has(step.risk) && !planAuth?.operator_confirmed) {
    return true;
  }
  // Steps marked with explicit him_required flag
  if (step.him_required === true) {
    return true;
  }
  return false;
}

/**
 * @typedef {object} HimCheckpointRequest
 * @property {string} checkpoint_id
 * @property {string} session_id
 * @property {string} plan_id
 * @property {string} step_id
 * @property {string} nonce
 * @property {string} reason - Why checkpoint was triggered
 * @property {object} step_summary - Non-sensitive step info for operator
 * @property {string} expires_at - ISO timestamp
 */

/**
 * Create a HIM checkpoint request for a step.
 *
 * @param {object} params
 * @param {string} params.session_id
 * @param {string} params.plan_id
 * @param {object} params.step
 * @param {number} [params.timeout_ms=120000] - 2 minutes default
 * @returns {HimCheckpointRequest}
 */
export function createCheckpointRequest({ session_id, plan_id, step, timeout_ms = 120000 }) {
  const now = Date.now();
  return {
    checkpoint_id: `him:${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    session_id,
    plan_id,
    step_id: step.step_id,
    nonce: randomUUID(),
    reason: step.risk === 'irreversible' ? 'irreversible_action' : 'him_required',
    step_summary: {
      target_node_id: step.target?.node_id || null,
      action_op: step.action?.op || null,
      risk: step.risk,
    },
    expires_at: new Date(now + timeout_ms).toISOString(),
  };
}

/**
 * @typedef {object} HimResumeValidation
 * @property {boolean} valid
 * @property {string|null} rejection_reason
 * @property {boolean} requires_reperception
 */

/**
 * Validate that execution can safely resume after a HIM pause.
 * Checks that the browser state hasn't fundamentally changed.
 *
 * @param {object} params
 * @param {string} params.original_document_id - Document ID when paused
 * @param {string} params.current_document_id - Document ID now
 * @param {number} params.original_revision - Revision when paused
 * @param {number} params.current_revision - Revision now
 * @param {string} params.plan_id - Plan being resumed
 * @param {string} params.active_plan_id - Currently active plan in session
 * @returns {HimResumeValidation}
 */
export function validateResume({
  original_document_id,
  current_document_id,
  original_revision,
  current_revision,
  plan_id,
  active_plan_id,
}) {
  // Plan must still be the active one (not superseded)
  if (plan_id !== active_plan_id) {
    return { valid: false, rejection_reason: 'plan_superseded', requires_reperception: false };
  }

  // Document must not have been replaced (navigation)
  if (original_document_id !== current_document_id) {
    return { valid: false, rejection_reason: 'document_replaced', requires_reperception: false };
  }

  // If revision changed, re-perception is needed before continuing
  if (original_revision !== current_revision) {
    return { valid: true, rejection_reason: null, requires_reperception: true };
  }

  // All good — safe to continue without re-perception
  return { valid: true, rejection_reason: null, requires_reperception: false };
}

/**
 * Execution state snapshot taken at pause time.
 * Preserves operator-visible state for display during HIM.
 *
 * @param {object} params
 * @param {string} params.session_id
 * @param {string} params.plan_id
 * @param {number} params.completed_steps - Steps done so far
 * @param {number} params.total_steps - Total in current plan
 * @param {string} params.document_id - Current document_id
 * @param {number} params.revision - Current revision
 * @param {string} params.paused_at_step_id - Step that triggered pause
 * @returns {object}
 */
export function captureExecutionState({
  session_id, plan_id, completed_steps, total_steps,
  document_id, revision, paused_at_step_id,
}) {
  return {
    session_id,
    plan_id,
    completed_steps,
    total_steps,
    document_id,
    revision,
    paused_at_step_id,
    paused_at: new Date().toISOString(),
    status: 'paused_for_him',
  };
}

export { HIM_REQUIRED_RISKS };
