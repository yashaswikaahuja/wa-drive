// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl HIM Engine — extension-service/him-engine.js
// Phase 4.0 — Human Interaction Mode (Server-Side Policy Engine)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Server-authoritative nonce management and HIM policy engine.
// Implements the him-protocol.yml contract:
//   - Nonce generation, validation, consumption, expiry
//   - HIM message construction (him_request, him_response, him_timeout)
//   - Timeout policy per interaction type
//   - Periodic cleanup of expired nonces
//
// Doctrine (ADR-0010):
//   Only the server may authorize continuation.
//   Nonces are single-use, cryptographically random, session-bound.
//
// Does NOT own: WebSocket transport, plan execution, extension UI.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';

/** HIM protocol version (matches him-protocol.yml). */
const HIM_PROTOCOL_VERSION = '1.0.0';

/** Grace period after expires_at (§6 anti-replay). */
const GRACE_PERIOD_MS = 5_000;

/** Cleanup interval for expired nonces. */
const CLEANUP_INTERVAL_MS = 60_000;

/** TTL for consumed nonces (kept for audit/replay detection). */
const CONSUMED_NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * @typedef {object} NonceRecord
 * @property {string} nonce — UUID v4
 * @property {string} session_id — Bound session
 * @property {string} plan_id — Bound plan
 * @property {string} step_id — Bound step
 * @property {number} issued_at — Timestamp (ms epoch)
 * @property {number} expires_at — Timestamp (ms epoch)
 * @property {'active'|'consumed'|'expired'} state
 * @property {number|null} consumed_at — When nonce was consumed
 */

/**
 * Active nonces awaiting operator confirmation.
 * Key: nonce string → NonceRecord
 * @type {Map<string, NonceRecord>}
 */
const activeNonces = new Map();

/**
 * Consumed nonces (replay detection). Purged after TTL.
 * Key: nonce string → NonceRecord
 * @type {Map<string, NonceRecord>}
 */
const consumedNonces = new Map();

/**
 * Timeout values per interaction_type (§6 expiry_policy).
 * @type {Record<string, number>}
 */
const TIMEOUT_MAP = {
  otp_entry: 180_000,
  captcha_solve: 180_000,
  payment_authorization: 120_000,
  irreversible_submit: 120_000,
  signature: 120_000,
  manual_review: 300_000,
  file_upload: 300_000,
  custom: 300_000,
};

const DEFAULT_TIMEOUT_MS = 300_000;

// ═══════════════════════════════════════════════════════════════════════
// NONCE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a new HIM nonce bound to a specific (session, plan, step).
 *
 * @param {string} session_id — Active session identifier
 * @param {string} plan_id — Plan being executed
 * @param {string} step_id — Step requiring human interaction
 * @param {string} [interaction_type='custom'] — Used to determine timeout
 * @returns {{ nonce: string, issued_at: number, expires_at: number }}
 */
export function generateNonce(session_id, plan_id, step_id, interaction_type = 'custom') {
  const nonce = randomUUID();
  const issued_at = Date.now();
  const timeout = getTimeoutMs(interaction_type);
  const expires_at = issued_at + timeout;

  /** @type {NonceRecord} */
  const record = {
    nonce,
    session_id,
    plan_id,
    step_id,
    issued_at,
    expires_at,
    state: 'active',
    consumed_at: null,
  };

  activeNonces.set(nonce, record);

  return { nonce, issued_at, expires_at };
}

/**
 * Validate an operator confirmation against the nonce store.
 *
 * Checks (per §6 anti-replay):
 *   1. Nonce exists in active_nonces
 *   2. Nonce NOT in consumed_nonces (replay)
 *   3. confirmed_at < expires_at + grace (timing)
 *   4. session_id matches bound session
 *
 * @param {string} session_id — Session claiming the confirmation
 * @param {string} plan_id — Plan ID from the confirmation
 * @param {string} step_id — Step ID from the confirmation
 * @param {string} nonce — Nonce from the confirmation
 * @param {number} confirmed_at — Timestamp of confirmation (ms epoch)
 * @returns {{ valid: boolean, rejection_reason: string|null }}
 */
export function validateConfirmation(session_id, plan_id, step_id, nonce, confirmed_at) {
  // Check replay — consumed nonces
  if (consumedNonces.has(nonce)) {
    return { valid: false, rejection_reason: 'already_consumed' };
  }

  // Check existence in active nonces
  const record = activeNonces.get(nonce);
  if (!record) {
    return { valid: false, rejection_reason: 'nonce_mismatch' };
  }

  // Check session binding
  if (record.session_id !== session_id) {
    return { valid: false, rejection_reason: 'session_mismatch' };
  }

  // Check plan/step binding (additional safety)
  if (record.plan_id !== plan_id || record.step_id !== step_id) {
    return { valid: false, rejection_reason: 'nonce_mismatch' };
  }

  // Check expiry with grace period
  const deadline = record.expires_at + GRACE_PERIOD_MS;
  if (confirmed_at > deadline) {
    return { valid: false, rejection_reason: 'expired' };
  }

  return { valid: true, rejection_reason: null };
}

/**
 * Consume a valid nonce — move from active to consumed (single-use).
 * Must be called after successful validation.
 *
 * @param {string} nonce — The nonce to consume
 */
export function consumeNonce(nonce) {
  const record = activeNonces.get(nonce);
  if (!record) return;

  record.state = 'consumed';
  record.consumed_at = Date.now();

  activeNonces.delete(nonce);
  consumedNonces.set(nonce, record);
}

/**
 * Expire a nonce — mark as expired and remove from active set.
 * Called on timeout or operator cancellation.
 *
 * @param {string} nonce — The nonce to expire
 */
export function expireNonce(nonce) {
  const record = activeNonces.get(nonce);
  if (!record) return;

  record.state = 'expired';
  activeNonces.delete(nonce);

  // Keep in consumed set for replay detection during grace period
  consumedNonces.set(nonce, record);
}

// ═══════════════════════════════════════════════════════════════════════
// POLICY DECISIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Determine if a plan step requires HIM (human interaction).
 * A step requires HIM if:
 *   - step.him_required is explicitly true, OR
 *   - step.risk === 'irreversible' (§5 hard rules)
 *
 * @param {object} step — ActionPlan step
 * @returns {boolean}
 */
export function isStepHimRequired(step) {
  if (!step) return false;
  if (step.him_required === true) return true;
  if (step.risk === 'irreversible') return true;
  return false;
}

/**
 * Get the timeout duration for a given interaction type.
 *
 * @param {string} interaction_type — One of the HIM interaction types
 * @returns {number} — Timeout in milliseconds
 */
export function getTimeoutMs(interaction_type) {
  return TIMEOUT_MAP[interaction_type] || DEFAULT_TIMEOUT_MS;
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a him_request message per §2 message contract.
 * Server → Extension: instructs pause and operator engagement.
 *
 * @param {string} session_id — Active session
 * @param {string} plan_id — Plan being executed
 * @param {object} step — The plan step requiring HIM
 * @param {object|null} target — Semantic target (context_id, node_id) or null
 * @returns {object} — Complete him_request message
 */
export function buildHimRequest(session_id, plan_id, step, target) {
  const interaction_type = step.interaction_type || step.him_interaction_type || 'custom';
  const { nonce, issued_at, expires_at } = generateNonce(session_id, plan_id, step.step_id, interaction_type);

  return {
    him_protocol_version: HIM_PROTOCOL_VERSION,
    message_type: 'him_request',
    session_id,
    plan_id,
    step_id: step.step_id,
    nonce,
    issued_at: new Date(issued_at).toISOString(),
    expires_at: new Date(expires_at).toISOString(),
    interaction_type,
    prompt: step.him_prompt || step.prompt || `Operator action required: ${interaction_type}`,
    target: target || null,
    sensitive_field: step.sensitive_field === true,
    auto_detect: step.auto_detect || null,
    show_summary: step.show_summary === true,
    destructive_warning: step.risk === 'irreversible' || step.destructive_warning === true,
  };
}

/**
 * Build a him_response message per §2 message contract.
 * Server → Extension: result of confirmation validation.
 *
 * @param {string} session_id — Active session
 * @param {string} plan_id — Plan ID
 * @param {string} step_id — Step ID
 * @param {string} nonce — Original nonce (echoed for correlation)
 * @param {'continue'|'reject'|'re_prompt'} action — Validation result
 * @param {string|null} rejection_reason — If action=reject
 * @param {string|null} new_nonce — If action=re_prompt, fresh nonce
 * @param {string|null} new_expires_at — If action=re_prompt, new expiry
 * @returns {object} — Complete him_response message
 */
export function buildHimResponse(session_id, plan_id, step_id, nonce, action, rejection_reason = null, new_nonce = null, new_expires_at = null) {
  return {
    him_protocol_version: HIM_PROTOCOL_VERSION,
    message_type: 'him_response',
    session_id,
    plan_id,
    step_id,
    nonce,
    action,
    rejection_reason: rejection_reason || null,
    new_nonce: new_nonce || null,
    new_expires_at: new_expires_at || null,
  };
}

/**
 * Build a him_timeout message per §2 message contract.
 * Server → Extension: HIM request expired without confirmation.
 *
 * @param {string} session_id — Active session
 * @param {string} plan_id — Plan ID
 * @param {string} step_id — Step ID
 * @param {string} nonce — Expired nonce
 * @param {'abort_plan'|'re_prompt'|'escalate_operator'} disposition — Server's decision
 * @returns {object} — Complete him_timeout message
 */
export function buildHimTimeout(session_id, plan_id, step_id, nonce, disposition) {
  return {
    him_protocol_version: HIM_PROTOCOL_VERSION,
    message_type: 'him_timeout',
    session_id,
    plan_id,
    step_id,
    nonce,
    timed_out_at: new Date().toISOString(),
    disposition,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// NONCE LOOKUP & INSPECTION (for timeout scheduler)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get an active nonce record by nonce string.
 *
 * @param {string} nonce
 * @returns {NonceRecord|null}
 */
export function getActiveNonce(nonce) {
  return activeNonces.get(nonce) || null;
}

/**
 * Get all active nonces (for timeout scheduling).
 *
 * @returns {NonceRecord[]}
 */
export function getAllActiveNonces() {
  return [...activeNonces.values()];
}

/**
 * Check if a nonce is expired (past expires_at, no grace).
 *
 * @param {string} nonce
 * @returns {boolean}
 */
export function isNonceExpired(nonce) {
  const record = activeNonces.get(nonce);
  if (!record) return true;
  return Date.now() > record.expires_at;
}

// ═══════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Purge expired nonces from both active and consumed maps.
 * Active nonces past expires_at + grace → moved to consumed with state=expired.
 * Consumed nonces past their TTL → deleted entirely.
 *
 * @returns {{ purged_active: number, purged_consumed: number }}
 */
export function purgeExpiredNonces() {
  const now = Date.now();
  let purged_active = 0;
  let purged_consumed = 0;

  // Purge active nonces past expiry + grace
  for (const [nonce, record] of activeNonces) {
    if (now > record.expires_at + GRACE_PERIOD_MS) {
      record.state = 'expired';
      activeNonces.delete(nonce);
      consumedNonces.set(nonce, record);
      purged_active++;
    }
  }

  // Purge consumed nonces past TTL
  for (const [nonce, record] of consumedNonces) {
    const expireTime = record.consumed_at || record.expires_at;
    if (now > expireTime + CONSUMED_NONCE_TTL_MS) {
      consumedNonces.delete(nonce);
      purged_consumed++;
    }
  }

  return { purged_active, purged_consumed };
}

/** Cleanup interval handle (for shutdown). */
let _cleanupTimer = null;

/**
 * Start the periodic cleanup timer.
 * Call once at server startup.
 */
export function startCleanup() {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const result = purgeExpiredNonces();
    if (result.purged_active > 0 || result.purged_consumed > 0) {
      console.log(`[him-engine] Cleanup: purged ${result.purged_active} active, ${result.purged_consumed} consumed nonces`);
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit even if timer is active
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

/**
 * Stop the periodic cleanup timer.
 * Call on server shutdown.
 */
export function stopCleanup() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TESTING HELPERS (not for production use)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reset all internal state. For testing only.
 */
export function _resetState() {
  activeNonces.clear();
  consumedNonces.clear();
}

/**
 * Get internal map sizes. For testing/monitoring.
 *
 * @returns {{ active: number, consumed: number }}
 */
export function getStats() {
  return { active: activeNonces.size, consumed: consumedNonces.size };
}
