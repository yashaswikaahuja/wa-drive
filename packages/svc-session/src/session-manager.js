// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Session Manager — extension-service/session-manager.js
// Phase 7 — Autonomous Runtime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Manages the full lifecycle of fill sessions at the orchestrator level.
// Wraps fill-session.js (step-level tracking) with higher-level concerns:
// evidence recording, workspace-level tracking, timeout/recovery, and metrics.
//
// Responsibilities:
//   - Track active sessions per workspace
//   - Record all evidence (snapshots, plans, observations)
//   - Handle session timeout and recovery
//   - Report session metrics (aggregated)
//   - Support session replay and auditing
//   - Coordinate with orchestrator for lifecycle events
//
// Architecture:
//   session-manager owns the LIFECYCLE (create, timeout, recover, close).
//   fill-session.js owns STEP-LEVEL progress within a session.
//   orchestrator.js coordinates the PIPELINE.
//
// Does NOT own: plan generation, execution, learning decisions.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';
import {
  createSession as createFillSession,
  getSession as getFillSession,
  getWorkspaceSessions as getFillWorkspaceSessions,
  getSessionMetrics as getFillSessionMetrics,
  cancelSession as cancelFillSession,
  cleanupExpired as cleanupExpiredFillSessions,
  getSessionCount as getFillSessionCount,
} from './fill-session.js';

// ── Configuration ───────────────────────────────────────────────────

/** Session timeout — how long before an idle session is expired (ms). */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Maximum evidence entries per session before trimming old entries. */
const MAX_EVIDENCE_PER_SESSION = 100;

/** Maximum sessions tracked per workspace. */
const MAX_SESSIONS_PER_WORKSPACE = 100;

/** How long completed sessions are retained for metrics (ms). */
const COMPLETED_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Metrics aggregation window (ms). */
const METRICS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ── Type Definitions ────────────────────────────────────────────────

/**
 * @typedef {object} ManagedSession
 * @property {string} managedId — Session manager's tracking ID
 * @property {string} fillSessionId — Underlying fill-session ID
 * @property {string} workspaceId — Owning workspace
 * @property {string} userId — Operator who initiated
 * @property {string} wssSessionId — WebSocket connection session
 * @property {string} orchestrationId — Linked orchestration
 * @property {string} status — 'active' | 'paused' | 'recovering' | 'completed' | 'failed' | 'timeout'
 * @property {object[]} evidence — Recorded evidence trail
 * @property {object} timing — Timing data
 * @property {object} metadata — Portal, form, workflow context
 * @property {number} lastActivity — Last activity timestamp
 */

/**
 * @typedef {object} EvidenceEntry
 * @property {string} id — Unique evidence ID
 * @property {string} type — 'snapshot' | 'plan' | 'observation' | 'correction' | 'error' | 'recovery'
 * @property {number} timestamp
 * @property {object} summary — Condensed data (not full payload)
 * @property {object|null} payload — Full payload (trimmed for large objects)
 */

/**
 * @typedef {object} SessionMetricsReport
 * @property {number} totalSessions — All tracked sessions
 * @property {number} activeSessions — Currently active
 * @property {number} completedSessions — Successfully completed
 * @property {number} failedSessions — Failed sessions
 * @property {number} timedOutSessions — Timed out
 * @property {number} avgDurationMs — Average session duration
 * @property {number} avgStepsCompleted — Average steps per session
 * @property {number} successRate — Completion rate (0-1)
 * @property {object} byWorkspace — Per-workspace breakdown
 */


// ── State ───────────────────────────────────────────────────────────

/**
 * Managed sessions indexed by managedId.
 * @type {Map<string, ManagedSession>}
 */
const managedSessions = new Map();

/**
 * Workspace → Set<managedId> index.
 * @type {Map<string, Set<string>>}
 */
const workspaceIndex = new Map();

/**
 * Fill session ID → managed ID reverse lookup.
 * @type {Map<string, string>}
 */
const fillSessionIndex = new Map();

/**
 * Completed session metrics (retained for aggregation).
 * @type {Map<string, { completedAt: number, durationMs: number, stepsCompleted: number, totalSteps: number, success: boolean, workspaceId: string }>}
 */
const completedMetrics = new Map();

/**
 * Generate a prefixed unique ID.
 * @param {string} prefix
 * @returns {string}
 */
function genId(prefix) {
  return `${prefix}:${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}


// ═══════════════════════════════════════════════════════════════════════
// SESSION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create and track a new managed fill session.
 *
 * @param {object} params
 * @param {string} params.workspaceId
 * @param {string} params.userId — Operator
 * @param {string} params.wssSessionId — WebSocket connection
 * @param {string} params.orchestrationId — Linked orchestration
 * @param {string} params.documentId — Page document_id
 * @param {string} params.snapshotId — Snapshot the plan targets
 * @param {string} params.correlationId — Request correlation
 * @param {object} [params.metadata] — Additional context { portalId, formKey, workflowId }
 * @returns {ManagedSession}
 * @throws {Error} If workspace limit exceeded
 */
export function createManagedSession(params) {
  const {
    workspaceId, userId, wssSessionId, orchestrationId,
    documentId, snapshotId, correlationId, metadata = {},
  } = params;

  // Enforce workspace limit
  const wsSet = workspaceIndex.get(workspaceId);
  if (wsSet && wsSet.size >= MAX_SESSIONS_PER_WORKSPACE) {
    // Try cleanup first
    cleanupWorkspaceSessions(workspaceId);
    const afterCleanup = workspaceIndex.get(workspaceId);
    if (afterCleanup && afterCleanup.size >= MAX_SESSIONS_PER_WORKSPACE) {
      throw new Error(`Workspace ${workspaceId} exceeded max managed sessions (${MAX_SESSIONS_PER_WORKSPACE})`);
    }
  }

  // Create underlying fill session
  const fillSession = createFillSession({
    workspace_id: workspaceId,
    document_id: documentId,
    snapshot_id: snapshotId,
    correlation_id: correlationId,
    metadata,
  });

  const now = Date.now();
  const managedId = genId('msess');

  /** @type {ManagedSession} */
  const managed = {
    managedId,
    fillSessionId: fillSession.session_id,
    workspaceId,
    userId,
    wssSessionId,
    orchestrationId,
    status: 'active',
    evidence: [],
    timing: {
      createdAt: now,
      firstPlanAt: null,
      firstExecutionAt: null,
      completedAt: null,
    },
    metadata: {
      portalId: metadata.portalId || null,
      formKey: metadata.formKey || null,
      workflowId: metadata.workflowId || null,
      documentId,
      snapshotId,
    },
    lastActivity: now,
  };

  // Register
  managedSessions.set(managedId, managed);
  fillSessionIndex.set(fillSession.session_id, managedId);

  if (!workspaceIndex.has(workspaceId)) {
    workspaceIndex.set(workspaceId, new Set());
  }
  workspaceIndex.get(workspaceId).add(managedId);

  // Record creation evidence
  recordEvidence(managedId, 'snapshot', {
    documentId,
    snapshotId,
    correlationId,
  }, null);

  return managed;
}

/**
 * Get a managed session by its managed ID.
 * @param {string} managedId
 * @returns {ManagedSession|null}
 */
export function getManagedSession(managedId) {
  return managedSessions.get(managedId) || null;
}

/**
 * Get a managed session by its fill session ID.
 * @param {string} fillSessionId
 * @returns {ManagedSession|null}
 */
export function getManagedByFillSession(fillSessionId) {
  const managedId = fillSessionIndex.get(fillSessionId);
  if (!managedId) return null;
  return managedSessions.get(managedId) || null;
}

/**
 * Get all active managed sessions for a workspace.
 * @param {string} workspaceId
 * @returns {ManagedSession[]}
 */
export function getWorkspaceManagedSessions(workspaceId) {
  const ids = workspaceIndex.get(workspaceId);
  if (!ids) return [];

  const results = [];
  for (const id of ids) {
    const session = managedSessions.get(id);
    if (session && session.status === 'active') {
      results.push(session);
    }
  }
  return results;
}


// ═══════════════════════════════════════════════════════════════════════
// EVIDENCE RECORDING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Record an evidence entry for a managed session.
 *
 * @param {string} managedId — Managed session ID
 * @param {string} type — 'snapshot' | 'plan' | 'observation' | 'correction' | 'error' | 'recovery'
 * @param {object} summary — Condensed representation
 * @param {object|null} [payload] — Full payload (will be trimmed if too large)
 */
export function recordEvidence(managedId, type, summary, payload = null) {
  const session = managedSessions.get(managedId);
  if (!session) return;

  // Trim evidence if at capacity
  if (session.evidence.length >= MAX_EVIDENCE_PER_SESSION) {
    // Remove oldest non-critical entries (keep first and last 10)
    const keep = [
      ...session.evidence.slice(0, 5),
      ...session.evidence.slice(-10),
    ];
    session.evidence = keep;
  }

  /** @type {EvidenceEntry} */
  const entry = {
    id: genId('ev'),
    type,
    timestamp: Date.now(),
    summary,
    payload: trimPayload(payload),
  };

  session.evidence.push(entry);
  session.lastActivity = Date.now();
}

/**
 * Record that a plan was issued for this session.
 * @param {string} managedId
 * @param {object} plan — The ActionPlan
 */
export function recordPlanIssued(managedId, plan) {
  const session = managedSessions.get(managedId);
  if (!session) return;

  if (!session.timing.firstPlanAt) {
    session.timing.firstPlanAt = Date.now();
  }

  recordEvidence(managedId, 'plan', {
    planId: plan.plan_id,
    stepCount: plan.steps?.length || 0,
    issuedAt: plan.issued_at,
    expiresAt: plan.expires_at,
    supersedesPlanId: plan.supersedes_plan_id || null,
  }, null); // Don't store full plan payload — it's large
}

/**
 * Record an execution observation for this session.
 * @param {string} managedId
 * @param {object} observation — ExecutionObservation
 */
export function recordObservation(managedId, observation) {
  const session = managedSessions.get(managedId);
  if (!session) return;

  if (!session.timing.firstExecutionAt) {
    session.timing.firstExecutionAt = Date.now();
  }

  const stepResults = observation.step_results || [];
  const completedCount = stepResults.filter(s => s.status === 'completed').length;
  const failedCount = stepResults.filter(s => s.status === 'failed').length;

  recordEvidence(managedId, 'observation', {
    observationId: observation.observation_id,
    outcome: observation.outcome,
    stepsReported: stepResults.length,
    stepsCompleted: completedCount,
    stepsFailed: failedCount,
    pageNavigated: observation.page_navigated || false,
  }, null);
}

/**
 * Record a correction event.
 * @param {string} managedId
 * @param {object[]} corrections — Array of corrections
 */
export function recordCorrections(managedId, corrections) {
  recordEvidence(managedId, 'correction', {
    count: corrections.length,
    fields: corrections.map(c => c.node_id || c.field_id || 'unknown').slice(0, 20),
  }, null);
}

/**
 * Record an error event.
 * @param {string} managedId
 * @param {string} errorMessage
 * @param {string} phase
 */
export function recordError(managedId, errorMessage, phase) {
  recordEvidence(managedId, 'error', {
    message: errorMessage,
    phase,
  }, null);
}

/**
 * Trim a payload to avoid memory bloat.
 * Removes large nested objects, keeps summary-level data.
 * @param {object|null} payload
 * @returns {object|null}
 */
function trimPayload(payload) {
  if (!payload) return null;

  const json = JSON.stringify(payload);
  // If payload is small enough, keep it as-is
  if (json.length <= 4096) return payload;

  // Otherwise, return a trimmed summary
  return {
    _trimmed: true,
    _originalSize: json.length,
    keys: Object.keys(payload),
  };
}


// ═══════════════════════════════════════════════════════════════════════
// TIMEOUT & RECOVERY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check and expire timed-out sessions.
 * @returns {string[]} — IDs of sessions that were timed out
 */
export function checkTimeouts() {
  const now = Date.now();
  const timedOut = [];

  for (const [id, session] of managedSessions) {
    if (session.status !== 'active') continue;
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      session.status = 'timeout';
      session.timing.completedAt = now;
      timedOut.push(id);

      recordEvidence(id, 'error', {
        message: 'Session timed out due to inactivity',
        phase: 'timeout',
        idleMs: now - session.lastActivity,
      }, null);

      // Also cancel the underlying fill session
      try {
        cancelFillSession(session.fillSessionId);
      } catch { /* ignore if already terminal */ }

      // Record in completed metrics
      recordCompletedMetric(session, false);
    }
  }

  return timedOut;
}

/**
 * Attempt to recover a timed-out or failed session.
 * Creates a new managed session linked to the same context.
 *
 * @param {string} managedId — The session to recover
 * @param {object} params
 * @param {string} params.newSnapshotId — Fresh snapshot for recovery
 * @param {string} params.newCorrelationId — New correlation
 * @returns {ManagedSession|null} — New recovered session or null
 */
export function recoverSession(managedId, params) {
  const original = managedSessions.get(managedId);
  if (!original) return null;
  if (original.status !== 'timeout' && original.status !== 'failed') return null;

  const { newSnapshotId, newCorrelationId } = params;

  try {
    const recovered = createManagedSession({
      workspaceId: original.workspaceId,
      userId: original.userId,
      wssSessionId: original.wssSessionId,
      orchestrationId: original.orchestrationId + '.recovered',
      documentId: original.metadata.documentId,
      snapshotId: newSnapshotId,
      correlationId: newCorrelationId,
      metadata: {
        ...original.metadata,
        recoveredFrom: managedId,
      },
    });

    recordEvidence(recovered.managedId, 'recovery', {
      recoveredFrom: managedId,
      originalStatus: original.status,
      originalEvidenceCount: original.evidence.length,
    }, null);

    return recovered;
  } catch (err) {
    console.warn(`[session-manager] Recovery failed for ${managedId}: ${err.message}`);
    return null;
  }
}

/**
 * Mark a session as completed.
 * @param {string} managedId
 * @param {boolean} success
 */
export function completeSession(managedId, success) {
  const session = managedSessions.get(managedId);
  if (!session) return;

  session.status = success ? 'completed' : 'failed';
  session.timing.completedAt = Date.now();
  session.lastActivity = Date.now();

  recordCompletedMetric(session, success);
}

/**
 * Pause a session (e.g., user switched tabs).
 * @param {string} managedId
 */
export function pauseSession(managedId) {
  const session = managedSessions.get(managedId);
  if (!session || session.status !== 'active') return;
  session.status = 'paused';
  session.lastActivity = Date.now();
}

/**
 * Resume a paused session.
 * @param {string} managedId
 */
export function resumeSession(managedId) {
  const session = managedSessions.get(managedId);
  if (!session || session.status !== 'paused') return;
  session.status = 'active';
  session.lastActivity = Date.now();
}

/**
 * Record a completed session's metrics for aggregation.
 * @param {ManagedSession} session
 * @param {boolean} success
 */
function recordCompletedMetric(session, success) {
  const fillMetrics = getFillSessionMetrics(session.fillSessionId);
  completedMetrics.set(session.managedId, {
    completedAt: Date.now(),
    durationMs: Date.now() - session.timing.createdAt,
    stepsCompleted: fillMetrics?.completed_steps || 0,
    totalSteps: fillMetrics?.total_steps || 0,
    success,
    workspaceId: session.workspaceId,
  });
}


// ═══════════════════════════════════════════════════════════════════════
// METRICS & REPORTING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get aggregated session metrics across all workspaces.
 * @param {number} [windowMs] — Time window for metrics (default 1 hour)
 * @returns {SessionMetricsReport}
 */
export function getAggregatedMetrics(windowMs = METRICS_WINDOW_MS) {
  const now = Date.now();
  const cutoff = now - windowMs;

  let totalSessions = 0;
  let activeSessions = 0;
  let completedSessions = 0;
  let failedSessions = 0;
  let timedOutSessions = 0;
  let totalDurationMs = 0;
  let totalStepsCompleted = 0;
  let sessionsWithDuration = 0;

  const byWorkspace = {};

  // Count active sessions
  for (const [, session] of managedSessions) {
    if (session.timing.createdAt < cutoff) continue;
    totalSessions++;

    const ws = session.workspaceId;
    if (!byWorkspace[ws]) byWorkspace[ws] = { active: 0, completed: 0, failed: 0, timeout: 0 };

    if (session.status === 'active' || session.status === 'paused') {
      activeSessions++;
      byWorkspace[ws].active++;
    }
  }

  // Count completed metrics
  for (const [, metric] of completedMetrics) {
    if (metric.completedAt < cutoff) continue;
    totalSessions++;
    sessionsWithDuration++;
    totalDurationMs += metric.durationMs;
    totalStepsCompleted += metric.stepsCompleted;

    const ws = metric.workspaceId;
    if (!byWorkspace[ws]) byWorkspace[ws] = { active: 0, completed: 0, failed: 0, timeout: 0 };

    if (metric.success) {
      completedSessions++;
      byWorkspace[ws].completed++;
    } else {
      failedSessions++;
      byWorkspace[ws].failed++;
    }
  }

  // Count timed-out from managed sessions
  for (const [, session] of managedSessions) {
    if (session.timing.createdAt < cutoff) continue;
    if (session.status === 'timeout') {
      timedOutSessions++;
      const ws = session.workspaceId;
      if (!byWorkspace[ws]) byWorkspace[ws] = { active: 0, completed: 0, failed: 0, timeout: 0 };
      byWorkspace[ws].timeout++;
    }
  }

  const totalTerminal = completedSessions + failedSessions + timedOutSessions;

  return {
    totalSessions,
    activeSessions,
    completedSessions,
    failedSessions,
    timedOutSessions,
    avgDurationMs: sessionsWithDuration > 0 ? Math.round(totalDurationMs / sessionsWithDuration) : 0,
    avgStepsCompleted: sessionsWithDuration > 0 ? Math.round(totalStepsCompleted / sessionsWithDuration) : 0,
    successRate: totalTerminal > 0 ? completedSessions / totalTerminal : 0,
    byWorkspace,
  };
}

/**
 * Get metrics for a specific workspace.
 * @param {string} workspaceId
 * @returns {object}
 */
export function getWorkspaceMetrics(workspaceId) {
  const ids = workspaceIndex.get(workspaceId);
  if (!ids) return { activeSessions: 0, totalEvidence: 0, sessions: [] };

  const sessions = [];
  let totalEvidence = 0;
  let activeSessions = 0;

  for (const id of ids) {
    const session = managedSessions.get(id);
    if (!session) continue;

    totalEvidence += session.evidence.length;
    if (session.status === 'active') activeSessions++;

    sessions.push({
      managedId: session.managedId,
      status: session.status,
      evidenceCount: session.evidence.length,
      lastActivity: session.lastActivity,
      durationMs: (session.timing.completedAt || Date.now()) - session.timing.createdAt,
    });
  }

  return { activeSessions, totalEvidence, sessions };
}


// ═══════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════

/**
 * Clean up terminal sessions for a workspace.
 * @param {string} workspaceId
 * @returns {number} — Sessions removed
 */
function cleanupWorkspaceSessions(workspaceId) {
  const ids = workspaceIndex.get(workspaceId);
  if (!ids) return 0;

  const now = Date.now();
  const toRemove = [];

  for (const id of ids) {
    const session = managedSessions.get(id);
    if (!session) {
      toRemove.push(id);
      continue;
    }

    const isTerminal = ['completed', 'failed', 'timeout'].includes(session.status);
    if (isTerminal && now - session.lastActivity > COMPLETED_SESSION_RETENTION_MS) {
      toRemove.push(id);
    }
  }

  for (const id of toRemove) {
    const session = managedSessions.get(id);
    if (session) fillSessionIndex.delete(session.fillSessionId);
    managedSessions.delete(id);
    ids.delete(id);
  }

  if (ids.size === 0) workspaceIndex.delete(workspaceId);
  return toRemove.length;
}

/**
 * Global cleanup of all stale data.
 * @returns {{ sessions: number, metrics: number }}
 */
export function cleanupAll() {
  const now = Date.now();
  let sessionsCleaned = 0;
  let metricsCleaned = 0;

  // Clean up old managed sessions
  for (const [workspaceId] of workspaceIndex) {
    sessionsCleaned += cleanupWorkspaceSessions(workspaceId);
  }

  // Clean up old completed metrics
  for (const [id, metric] of completedMetrics) {
    if (now - metric.completedAt > COMPLETED_SESSION_RETENTION_MS) {
      completedMetrics.delete(id);
      metricsCleaned++;
    }
  }

  // Also clean up underlying fill sessions
  cleanupExpiredFillSessions();

  return { sessions: sessionsCleaned, metrics: metricsCleaned };
}

// ── Periodic Timer ──────────────────────────────────────────────────

let _timer = null;

/**
 * Start periodic timeout checks and cleanup.
 * @param {number} [intervalMs=60000] — Check interval
 */
export function startSessionTimer(intervalMs = 60_000) {
  if (_timer) return;
  _timer = setInterval(() => {
    const timedOut = checkTimeouts();
    if (timedOut.length > 0) {
      console.log(`[session-manager] Timed out ${timedOut.length} session(s)`);
    }
    const cleaned = cleanupAll();
    if (cleaned.sessions > 0 || cleaned.metrics > 0) {
      console.log(`[session-manager] Cleaned ${cleaned.sessions} sessions, ${cleaned.metrics} metrics`);
    }
  }, intervalMs);
  if (_timer.unref) _timer.unref();
}

/**
 * Stop periodic timer.
 */
export function stopSessionTimer() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/**
 * Get total counts for monitoring.
 * @returns {{ managed: number, fillSessions: number, completedMetrics: number }}
 */
export function getCounts() {
  return {
    managed: managedSessions.size,
    fillSessions: getFillSessionCount(),
    completedMetrics: completedMetrics.size,
  };
}
