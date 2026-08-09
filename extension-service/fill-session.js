// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Fill Session — extension-service/fill-session.js
// Phase 4.1 — Server Fill Planner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Tracks fill progress per session and stores plan correlation.
// Each fill session corresponds to one form-fill attempt on a page.
//
// Responsibilities:
//   - Create/retrieve fill sessions
//   - Track step-level progress (pending → executing → completed/failed)
//   - Correlate plans to sessions for auditing
//   - Record timing and outcome metrics
//   - Expire stale sessions
//
// Does NOT own: plan generation, mapping, execution.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';

/**
 * @typedef {'pending'|'planning'|'executing'|'completed'|'failed'|'expired'|'cancelled'} SessionStatus
 */

/**
 * @typedef {'pending'|'executing'|'completed'|'failed'|'skipped'} StepStatus
 */

/**
 * @typedef {object} FillStepProgress
 * @property {string} step_id — ActionPlan step_id
 * @property {string} node_id — Target node
 * @property {StepStatus} status
 * @property {string|null} error_code — Failure reason if failed
 * @property {number|null} started_at — Timestamp when execution began
 * @property {number|null} completed_at — Timestamp when step finished
 * @property {number|null} duration_ms — Execution duration
 */

/**
 * @typedef {object} FillSession
 * @property {string} session_id — Unique session identifier
 * @property {string} workspace_id — Owning workspace
 * @property {string} document_id — Page document_id from snapshot
 * @property {string} snapshot_id — Snapshot the plan was built against
 * @property {string|null} plan_id — The ActionPlan issued for this session
 * @property {string} correlation_id — Request/response correlation
 * @property {SessionStatus} status
 * @property {number} total_steps — Number of steps in the plan
 * @property {number} completed_steps — Steps successfully executed
 * @property {number} failed_steps — Steps that failed
 * @property {FillStepProgress[]} steps — Per-step progress
 * @property {number} created_at — Session creation timestamp
 * @property {number} updated_at — Last update timestamp
 * @property {number|null} completed_at — Session completion timestamp
 * @property {object|null} metadata — Additional context (portal, form_key, etc.)
 */

/** Default session TTL: 30 minutes. */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** Maximum concurrent sessions per workspace (prevents runaway). */
const MAX_SESSIONS_PER_WORKSPACE = 50;

/**
 * In-memory session store.
 * Production would back this with PostgreSQL or Redis.
 * @type {Map<string, FillSession>}
 */
const sessions = new Map();

/** Index: workspace_id → Set<session_id> */
const workspaceIndex = new Map();

/**
 * Create a new fill session.
 *
 * @param {object} params
 * @param {string} params.workspace_id
 * @param {string} params.document_id
 * @param {string} params.snapshot_id
 * @param {string} params.correlation_id
 * @param {object} [params.metadata] — Additional context (portal_id, form_key, etc.)
 * @returns {FillSession}
 * @throws {Error} If workspace has too many active sessions
 */
export function createSession({ workspace_id, document_id, snapshot_id, correlation_id, metadata = null }) {
  // Enforce per-workspace limit
  const existing = workspaceIndex.get(workspace_id);
  if (existing && existing.size >= MAX_SESSIONS_PER_WORKSPACE) {
    // Evict expired sessions first
    evictExpired(workspace_id);
    const afterEvict = workspaceIndex.get(workspace_id);
    if (afterEvict && afterEvict.size >= MAX_SESSIONS_PER_WORKSPACE) {
      throw new Error(`Workspace ${workspace_id} has too many active fill sessions`);
    }
  }

  const now = Date.now();
  const session_id = `fsess:${randomUUID().replace(/-/g, '').slice(0, 24)}`;

  /** @type {FillSession} */
  const session = {
    session_id,
    workspace_id,
    document_id,
    snapshot_id,
    plan_id: null,
    correlation_id,
    status: 'pending',
    total_steps: 0,
    completed_steps: 0,
    failed_steps: 0,
    steps: [],
    created_at: now,
    updated_at: now,
    completed_at: null,
    metadata,
  };

  sessions.set(session_id, session);

  // Update workspace index
  if (!workspaceIndex.has(workspace_id)) {
    workspaceIndex.set(workspace_id, new Set());
  }
  workspaceIndex.get(workspace_id).add(session_id);

  return session;
}

/**
 * Retrieve a fill session by ID.
 *
 * @param {string} session_id
 * @returns {FillSession|null}
 */
export function getSession(session_id) {
  const session = sessions.get(session_id);
  if (!session) return null;

  // Check expiry
  if (isExpired(session)) {
    session.status = 'expired';
    session.updated_at = Date.now();
  }

  return session;
}

/**
 * Get all active sessions for a workspace.
 *
 * @param {string} workspace_id
 * @returns {FillSession[]}
 */
export function getWorkspaceSessions(workspace_id) {
  const ids = workspaceIndex.get(workspace_id);
  if (!ids) return [];

  const result = [];
  for (const id of ids) {
    const session = getSession(id);
    if (session && session.status !== 'expired') {
      result.push(session);
    }
  }
  return result;
}

/**
 * Attach a plan to a session. Transitions status to 'planning' → 'executing'.
 *
 * @param {string} session_id
 * @param {string} plan_id — The ActionPlan plan_id
 * @param {number} totalSteps — Number of steps in the plan
 * @param {string[]} stepIds — Step IDs from the plan
 * @param {string[]} nodeIds — Corresponding node IDs for each step
 * @param {object[]} [stepMetadata] — Server-private semantic/evidence metadata per step
 * @returns {FillSession}
 * @throws {Error} If session not found or in invalid state
 */
export function attachPlan(session_id, plan_id, totalSteps, stepIds, nodeIds, stepMetadata = []) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);
  if (session.status !== 'pending' && session.status !== 'planning') {
    throw new Error(`Cannot attach plan to session in status: ${session.status}`);
  }

  session.plan_id = plan_id;
  session.status = 'executing';
  session.total_steps = totalSteps;
  session.updated_at = Date.now();

  // Initialize step progress
  session.steps = stepIds.map((step_id, i) => ({
    step_id,
    node_id: nodeIds[i] || 'unknown',
    status: 'pending',
    error_code: null,
    started_at: null,
    completed_at: null,
    duration_ms: null,
    ...(stepMetadata[i] || {}),
  }));

  return session;
}

/**
 * Record a step execution start.
 *
 * @param {string} session_id
 * @param {string} step_id
 * @returns {FillSession}
 */
export function markStepStarted(session_id, step_id) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);

  const step = session.steps.find(s => s.step_id === step_id);
  if (step) {
    step.status = 'executing';
    step.started_at = Date.now();
  }

  session.updated_at = Date.now();
  return session;
}

/**
 * Record a step completion.
 *
 * @param {string} session_id
 * @param {string} step_id
 * @returns {FillSession}
 */
export function markStepCompleted(session_id, step_id) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);

  const step = session.steps.find(s => s.step_id === step_id);
  if (step) {
    const now = Date.now();
    step.status = 'completed';
    step.completed_at = now;
    step.duration_ms = step.started_at ? now - step.started_at : null;
    session.completed_steps++;
  }

  session.updated_at = Date.now();

  // Check if all steps are done
  if (session.completed_steps + session.failed_steps >= session.total_steps) {
    session.status = session.failed_steps > 0 ? 'failed' : 'completed';
    session.completed_at = Date.now();
  }

  return session;
}

/**
 * Record a step failure.
 *
 * @param {string} session_id
 * @param {string} step_id
 * @param {string} error_code — e.g. 'affordance_mismatch', 'stale_target', 'timeout'
 * @returns {FillSession}
 */
export function markStepFailed(session_id, step_id, error_code) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);

  const step = session.steps.find(s => s.step_id === step_id);
  if (step) {
    const now = Date.now();
    step.status = 'failed';
    step.error_code = error_code;
    step.completed_at = now;
    step.duration_ms = step.started_at ? now - step.started_at : null;
    session.failed_steps++;
  }

  session.updated_at = Date.now();
  const terminalCount = session.steps.filter(item => ['completed', 'failed', 'skipped'].includes(item.status)).length;
  if (terminalCount >= session.total_steps) {
    session.status = 'failed';
    session.completed_at = Date.now();
  }

  // If on_failure is abort_plan, mark remaining as skipped
  // (This is decided by the caller based on the plan step's on_failure field)
  return session;
}

/** Record a step the executor intentionally did not attempt. */
export function markStepSkipped(session_id, step_id) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);
  const step = session.steps.find(s => s.step_id === step_id);
  if (step && step.status === 'pending') {
    step.status = 'skipped';
    step.completed_at = Date.now();
  }
  session.updated_at = Date.now();
  const terminalCount = session.steps.filter(item => ['completed', 'failed', 'skipped'].includes(item.status)).length;
  if (terminalCount >= session.total_steps) {
    session.status = session.failed_steps > 0 ? 'failed' : 'completed';
    session.completed_at = Date.now();
  }
  return session;
}

/**
 * Skip all remaining pending steps (after an abort).
 *
 * @param {string} session_id
 * @returns {FillSession}
 */
export function abortRemaining(session_id) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);

  for (const step of session.steps) {
    if (step.status === 'pending') {
      step.status = 'skipped';
    }
  }

  session.status = 'failed';
  session.completed_at = Date.now();
  session.updated_at = Date.now();
  return session;
}

/**
 * Cancel a session (user-initiated).
 *
 * @param {string} session_id
 * @returns {FillSession}
 */
export function cancelSession(session_id) {
  const session = sessions.get(session_id);
  if (!session) throw new Error(`Session not found: ${session_id}`);

  session.status = 'cancelled';
  session.completed_at = Date.now();
  session.updated_at = Date.now();

  for (const step of session.steps) {
    if (step.status === 'pending' || step.status === 'executing') {
      step.status = 'skipped';
    }
  }

  return session;
}

/**
 * Get session metrics summary.
 *
 * @param {string} session_id
 * @returns {object|null}
 */
export function getSessionMetrics(session_id) {
  const session = sessions.get(session_id);
  if (!session) return null;

  const totalDuration = session.completed_at
    ? session.completed_at - session.created_at
    : Date.now() - session.created_at;

  const stepDurations = session.steps
    .filter(s => s.duration_ms != null)
    .map(s => s.duration_ms);

  return {
    session_id: session.session_id,
    status: session.status,
    total_steps: session.total_steps,
    completed_steps: session.completed_steps,
    failed_steps: session.failed_steps,
    skipped_steps: session.steps.filter(s => s.status === 'skipped').length,
    total_duration_ms: totalDuration,
    avg_step_duration_ms: stepDurations.length > 0
      ? Math.round(stepDurations.reduce((a, b) => a + b, 0) / stepDurations.length)
      : null,
    success_rate: session.total_steps > 0
      ? session.completed_steps / session.total_steps
      : 0,
  };
}

/**
 * Check if a session is expired.
 *
 * @param {FillSession} session
 * @returns {boolean}
 */
function isExpired(session) {
  if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
    return false; // Terminal states don't expire
  }
  return Date.now() - session.created_at > SESSION_TTL_MS;
}

/**
 * Evict expired sessions for a workspace.
 *
 * @param {string} workspace_id
 */
function evictExpired(workspace_id) {
  const ids = workspaceIndex.get(workspace_id);
  if (!ids) return;

  const toRemove = [];
  for (const id of ids) {
    const session = sessions.get(id);
    if (!session || isExpired(session)) {
      toRemove.push(id);
    }
  }

  for (const id of toRemove) {
    sessions.delete(id);
    ids.delete(id);
  }
}

/**
 * Clean up all expired sessions across all workspaces.
 * Call periodically (e.g. every 5 minutes).
 *
 * @returns {number} — Number of sessions evicted
 */
export function cleanupExpired() {
  let count = 0;
  for (const [workspace_id] of workspaceIndex) {
    const ids = workspaceIndex.get(workspace_id);
    if (!ids) continue;

    const toRemove = [];
    for (const id of ids) {
      const session = sessions.get(id);
      if (!session || isExpired(session)) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      sessions.delete(id);
      ids.delete(id);
      count++;
    }
  }
  return count;
}

/**
 * Get total session count (for monitoring).
 *
 * @returns {number}
 */
export function getSessionCount() {
  return sessions.size;
}
