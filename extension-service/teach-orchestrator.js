/**
 * CyberControl Teach Orchestrator — extension-service/teach-orchestrator.js
 * Phase 5.1 — Server Behavioral Teach (Unknown Widgets)
 *
 * Server-side state machine that orchestrates teach sessions via WSS.
 * The extension only observes operator interactions and reports raw evidence.
 * All interpretation, pattern extraction, and knowledge creation happen here.
 *
 * ARCHITECTURE (constitution.yml / D03):
 *   - Server = Brain. Extension = Eyes + Hands.
 *   - Behavioral identification via affordances and state transitions.
 *   - No framework names (ng-select, react-select, etc.) as identity.
 *   - No AI/LLM calls from extension.
 *
 * State machine:
 *   idle → awaiting_demonstration → observing → extracting → complete
 *
 * Vocabulary (D03/D06):
 *   affordances — what the widget can mechanically do
 *   probing — testing widget responses without operator intent
 *   state_transitions — observable changes caused by interaction
 *   behavioral_fingerprint — identity derived from observed behavior only
 */

import { randomUUID } from 'node:crypto';
import { send, getWorkspaceSessions } from './ws-server.js';
import { extractPattern } from './pattern-extractor.js';
import { create as createKnowledgeRecord } from './knowledge-store.js';

// ═══════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Teach session states.
 * @enum {string}
 */
export const TeachState = {
  IDLE: 'idle',
  AWAITING_DEMONSTRATION: 'awaiting_demonstration',
  OBSERVING: 'observing',
  EXTRACTING: 'extracting',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

/**
 * Teach prompt types sent to the extension.
 * @enum {string}
 */
const PromptType = {
  BEGIN_OBSERVE: 'begin_observe',
  PROBE_REQUEST: 'probe_request',
  STOP_OBSERVE: 'stop_observe',
  SESSION_COMPLETE: 'session_complete',
  SESSION_FAILED: 'session_failed',
};

/** Maximum observations per session before forced extraction. */
const MAX_OBSERVATIONS = 200;

/** Maximum time for a teach session (ms). Auto-expires after this. */
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Minimum observations required for extraction. */
const MIN_OBSERVATIONS_FOR_EXTRACTION = 3;

// ═══════════════════════════════════════════════════════════════════════
// TEACH SESSION STORE
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} TeachSession
 * @property {string} sessionId — unique teach session ID
 * @property {string} workspaceId
 * @property {string} wssSessionId — WSS session handling this teach
 * @property {string} state — current TeachState
 * @property {string} targetNodeId — node_id of the widget being taught
 * @property {string} targetContextId — context_id of the widget
 * @property {object|null} targetHint — optional metadata about target (label, position)
 * @property {Array<object>} observations — collected behavioral observations
 * @property {object|null} extractedKnowledge — result after extraction
 * @property {string|null} knowledgeRecordId — ID of persisted knowledge record
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} expiresAt
 * @property {string|null} failureReason
 */

/** Active teach sessions indexed by sessionId. */
const teachSessions = new Map();

/** Map wssSessionId → teachSessionId for quick lookup. */
const sessionByWss = new Map();

// ═══════════════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Valid state transitions.
 */
const TRANSITIONS = {
  [TeachState.IDLE]: [TeachState.AWAITING_DEMONSTRATION],
  [TeachState.AWAITING_DEMONSTRATION]: [TeachState.OBSERVING, TeachState.FAILED],
  [TeachState.OBSERVING]: [TeachState.EXTRACTING, TeachState.FAILED],
  [TeachState.EXTRACTING]: [TeachState.COMPLETE, TeachState.FAILED],
  [TeachState.COMPLETE]: [],
  [TeachState.FAILED]: [],
};

/**
 * Transition a session to a new state. Validates the transition.
 * @param {TeachSession} session
 * @param {string} newState
 * @throws {Error} if transition is invalid
 */
function transitionTo(session, newState) {
  const allowed = TRANSITIONS[session.state];
  if (!allowed || !allowed.includes(newState)) {
    throw new Error(
      `Invalid teach state transition: ${session.state} → ${newState} (session: ${session.sessionId})`
    );
  }
  session.state = newState;
  session.updatedAt = Date.now();
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Start a new teach session for an unknown or partially-recognized widget.
 *
 * @param {object} params
 * @param {string} params.workspaceId — workspace context
 * @param {string} params.wssSessionId — the WSS session for communication
 * @param {string} params.targetNodeId — node_id of the widget in the PageSnapshot
 * @param {string} params.targetContextId — context_id containing the widget
 * @param {object} [params.targetHint] — optional { label, behavior_kind, position }
 * @param {string} [params.scopePortalId] — portal for scoping the resulting knowledge
 * @param {string} [params.scopeFormKey] — form key for scoping
 * @returns {TeachSession}
 */
export function startTeachSession(params) {
  const {
    workspaceId,
    wssSessionId,
    targetNodeId,
    targetContextId,
    targetHint,
    scopePortalId,
    scopeFormKey,
  } = params;

  // Prevent duplicate teach sessions on same WSS connection
  if (sessionByWss.has(wssSessionId)) {
    const existing = teachSessions.get(sessionByWss.get(wssSessionId));
    if (existing && existing.state !== TeachState.COMPLETE && existing.state !== TeachState.FAILED) {
      throw new Error(`Teach session already active on this connection: ${existing.sessionId}`);
    }
  }

  const now = Date.now();
  const session = {
    sessionId: `teach.${randomUUID().slice(0, 8)}.${now.toString(36)}`,
    workspaceId,
    wssSessionId,
    state: TeachState.IDLE,
    targetNodeId,
    targetContextId,
    targetHint: targetHint || null,
    scopePortalId: scopePortalId || null,
    scopeFormKey: scopeFormKey || null,
    observations: [],
    extractedKnowledge: null,
    knowledgeRecordId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SESSION_TIMEOUT_MS,
    failureReason: null,
  };

  teachSessions.set(session.sessionId, session);
  sessionByWss.set(wssSessionId, session.sessionId);

  // Transition to awaiting_demonstration
  transitionTo(session, TeachState.AWAITING_DEMONSTRATION);

  // Send teach prompt to extension: "start observing this widget"
  _sendTeachPrompt(session, PromptType.BEGIN_OBSERVE, {
    teachSessionId: session.sessionId,
    targetNodeId: session.targetNodeId,
    targetContextId: session.targetContextId,
    instructions: _generateInstructions(session),
  });

  console.log(`[teach] Started session ${session.sessionId} for node=${targetNodeId} (workspace=${workspaceId.slice(0, 8)}...)`);
  return session;
}

/**
 * Receive a behavioral observation from the extension during an active teach session.
 *
 * @param {string} teachSessionId
 * @param {object} observation — raw observation from extension
 * @param {string} observation.action_type — 'click' | 'type' | 'select' | 'focus' | 'blur' | 'keydown' | 'scroll' | 'hover'
 * @param {object} observation.target — { node_id, context_id, tag, role, label }
 * @param {object} [observation.state_before] — observable state before action
 * @param {object} [observation.state_after] — observable state after action
 * @param {number} observation.timestamp
 * @param {object} [observation.metadata] — additional context (key pressed, value typed, etc.)
 * @returns {{ acknowledged: boolean, shouldContinue: boolean }}
 */
export function receiveObservation(teachSessionId, observation) {
  const session = teachSessions.get(teachSessionId);
  if (!session) {
    return { acknowledged: false, shouldContinue: false, error: 'session_not_found' };
  }

  // Accept observations in AWAITING_DEMONSTRATION or OBSERVING states
  if (session.state === TeachState.AWAITING_DEMONSTRATION) {
    // First observation transitions to observing
    transitionTo(session, TeachState.OBSERVING);
  } else if (session.state !== TeachState.OBSERVING) {
    return { acknowledged: false, shouldContinue: false, error: `wrong_state:${session.state}` };
  }

  // Record the observation
  session.observations.push({
    seq: session.observations.length,
    ...observation,
    receivedAt: Date.now(),
  });
  session.updatedAt = Date.now();

  // Check if we've hit limits
  if (session.observations.length >= MAX_OBSERVATIONS) {
    // Force extraction
    _triggerExtraction(session);
    return { acknowledged: true, shouldContinue: false };
  }

  return { acknowledged: true, shouldContinue: true };
}

/**
 * Operator signals that demonstration is complete. Triggers extraction.
 *
 * @param {string} teachSessionId
 * @returns {{ success: boolean, error?: string }}
 */
export function completeDemonstration(teachSessionId) {
  const session = teachSessions.get(teachSessionId);
  if (!session) {
    return { success: false, error: 'session_not_found' };
  }

  if (session.state !== TeachState.OBSERVING && session.state !== TeachState.AWAITING_DEMONSTRATION) {
    return { success: false, error: `wrong_state:${session.state}` };
  }

  if (session.observations.length < MIN_OBSERVATIONS_FOR_EXTRACTION) {
    return {
      success: false,
      error: `insufficient_observations: need at least ${MIN_OBSERVATIONS_FOR_EXTRACTION}, have ${session.observations.length}`,
    };
  }

  // Tell extension to stop observing
  _sendTeachPrompt(session, PromptType.STOP_OBSERVE, {
    teachSessionId: session.sessionId,
  });

  _triggerExtraction(session);
  return { success: true };
}

/**
 * Cancel an active teach session.
 *
 * @param {string} teachSessionId
 * @param {string} [reason]
 * @returns {{ success: boolean }}
 */
export function cancelTeachSession(teachSessionId, reason) {
  const session = teachSessions.get(teachSessionId);
  if (!session) return { success: false };

  if (session.state === TeachState.COMPLETE || session.state === TeachState.FAILED) {
    return { success: false };
  }

  session.failureReason = reason || 'cancelled_by_user';
  transitionTo(session, TeachState.FAILED);

  _sendTeachPrompt(session, PromptType.SESSION_FAILED, {
    teachSessionId: session.sessionId,
    reason: session.failureReason,
  });

  _cleanupSession(session);
  return { success: true };
}

/**
 * Request a specific probe action from the extension.
 * Used when the server wants the extension to try a specific interaction
 * on the widget to observe its response (e.g. "click the trigger element").
 *
 * @param {string} teachSessionId
 * @param {object} probeSpec
 * @param {string} probeSpec.action — 'click' | 'type' | 'focus' | 'key_press'
 * @param {string} [probeSpec.targetNodeId] — specific node to probe (defaults to session target)
 * @param {object} [probeSpec.params] — action-specific parameters (e.g. { key: 'ArrowDown' })
 * @returns {{ success: boolean }}
 */
export function requestProbe(teachSessionId, probeSpec) {
  const session = teachSessions.get(teachSessionId);
  if (!session) return { success: false, error: 'session_not_found' };

  if (session.state !== TeachState.OBSERVING) {
    return { success: false, error: `wrong_state:${session.state}` };
  }

  _sendTeachPrompt(session, PromptType.PROBE_REQUEST, {
    teachSessionId: session.sessionId,
    probe: {
      action: probeSpec.action,
      targetNodeId: probeSpec.targetNodeId || session.targetNodeId,
      targetContextId: session.targetContextId,
      params: probeSpec.params || {},
    },
  });

  return { success: true };
}

/**
 * Get a teach session by its ID.
 * @param {string} teachSessionId
 * @returns {TeachSession|null}
 */
export function getTeachSession(teachSessionId) {
  return teachSessions.get(teachSessionId) || null;
}

/**
 * Get the active teach session for a WSS session.
 * @param {string} wssSessionId
 * @returns {TeachSession|null}
 */
export function getTeachSessionByWss(wssSessionId) {
  const id = sessionByWss.get(wssSessionId);
  if (!id) return null;
  return teachSessions.get(id) || null;
}

/**
 * Handle WSS disconnection: abort any active teach session for that connection.
 * @param {string} wssSessionId
 */
export function handleDisconnect(wssSessionId) {
  const id = sessionByWss.get(wssSessionId);
  if (!id) return;
  const session = teachSessions.get(id);
  if (session && session.state !== TeachState.COMPLETE && session.state !== TeachState.FAILED) {
    session.failureReason = 'wss_disconnected';
    transitionTo(session, TeachState.FAILED);
    _cleanupSession(session);
  }
}

/**
 * Expire stale teach sessions (called periodically or on demand).
 * @returns {number} — count of expired sessions
 */
export function expireStale() {
  const now = Date.now();
  let count = 0;
  for (const [id, session] of teachSessions) {
    if (session.expiresAt && now > session.expiresAt) {
      if (session.state !== TeachState.COMPLETE && session.state !== TeachState.FAILED) {
        session.failureReason = 'session_timeout';
        transitionTo(session, TeachState.FAILED);
        _sendTeachPrompt(session, PromptType.SESSION_FAILED, {
          teachSessionId: session.sessionId,
          reason: 'session_timeout',
        });
        _cleanupSession(session);
        count++;
      }
    }
  }
  return count;
}

// ═══════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Trigger pattern extraction from collected observations.
 * @param {TeachSession} session
 */
async function _triggerExtraction(session) {
  transitionTo(session, TeachState.EXTRACTING);

  try {
    const knowledge = extractPattern({
      targetNodeId: session.targetNodeId,
      targetContextId: session.targetContextId,
      targetHint: session.targetHint,
      observations: session.observations,
    });

    session.extractedKnowledge = knowledge;

    // Persist as Interaction Knowledge (component_adapter kind)
    const record = await _persistKnowledge(session, knowledge);
    session.knowledgeRecordId = record.id;

    transitionTo(session, TeachState.COMPLETE);

    // Notify the extension that teach is complete
    _sendTeachPrompt(session, PromptType.SESSION_COMPLETE, {
      teachSessionId: session.sessionId,
      knowledgeRecordId: record.id,
      summary: {
        affordances: knowledge.affordances,
        interaction_steps: knowledge.interaction_sequence.length,
        behavioral_fingerprint: knowledge.behavioral_fingerprint,
      },
    });

    console.log(
      `[teach] Session ${session.sessionId} complete. ` +
      `Knowledge record: ${record.id}, affordances: [${knowledge.affordances.join(', ')}]`
    );
  } catch (err) {
    session.failureReason = `extraction_failed: ${err.message}`;
    transitionTo(session, TeachState.FAILED);

    _sendTeachPrompt(session, PromptType.SESSION_FAILED, {
      teachSessionId: session.sessionId,
      reason: session.failureReason,
    });

    console.error(`[teach] Extraction failed for session ${session.sessionId}:`, err.message);
  }

  _cleanupSession(session);
}

/**
 * Persist extracted Interaction Knowledge as a knowledge_record.
 * @param {TeachSession} session
 * @param {object} knowledge — extracted pattern from pattern-extractor
 * @returns {object} — created record
 */
async function _persistKnowledge(session, knowledge) {
  const now = new Date().toISOString();

  const record = {
    kind: 'component_adapter',
    version: 1,
    status: 'draft',
    scope: {
      level: session.scopePortalId
        ? (session.scopeFormKey ? 'portal_form' : 'portal')
        : (session.workspaceId ? 'organization' : 'global'),
      portal_id: session.scopePortalId || null,
      form_key: session.scopeFormKey || null,
      organization_id: session.workspaceId || null,
      country: null,
    },
    confidence: knowledge.confidence,
    source: {
      origin: 'learned',
      actor: `teach:${session.sessionId}`,
      evidence_ref: session.sessionId,
      created_at: now,
      updated_at: now,
    },
    tags: ['teach_session', 'behavioral'],
    payload: {
      // Behavioral identity — no framework names
      behavioral_fingerprint: knowledge.behavioral_fingerprint,
      behavior_kind: knowledge.behavior_kind,
      cardinality: knowledge.cardinality,
      interaction_mode: knowledge.interaction_mode,

      // Affordances (D03/D06 vocabulary)
      affordances: knowledge.affordances,

      // Interaction sequence (how to operate it)
      interaction_sequence: knowledge.interaction_sequence,

      // State transitions (observable outcomes)
      state_transitions: knowledge.state_transitions,

      // Detection hints (for future matching) — behavioral, not selector-based
      detection: knowledge.detection || {},

      // Raw observation count for provenance
      observation_count: session.observations.length,
      teach_session_id: session.sessionId,
    },
  };

  return await createKnowledgeRecord(record);
}

/**
 * Send a teach prompt message to the extension via WSS.
 * @param {TeachSession} session
 * @param {string} promptType
 * @param {object} payload
 */
function _sendTeachPrompt(session, promptType, payload) {
  send(session.wssSessionId, {
    type: 'teach_prompt',
    promptType,
    ...payload,
    serverTime: Date.now(),
  });
}

/**
 * Generate human-readable instructions for the teach session.
 * @param {TeachSession} session
 * @returns {string}
 */
function _generateInstructions(session) {
  const hint = session.targetHint;
  const label = hint?.label || 'the target widget';

  return (
    `Please demonstrate how to interact with ${label}. ` +
    `Show the full interaction: opening, selecting/entering a value, and confirming. ` +
    `The system will observe your actions and learn the interaction pattern.`
  );
}

/**
 * Cleanup tracking maps for a completed/failed session.
 * Session remains in teachSessions for retrieval but removed from active tracking.
 * @param {TeachSession} session
 */
function _cleanupSession(session) {
  sessionByWss.delete(session.wssSessionId);
}

// ═══════════════════════════════════════════════════════════════════════
// EXPIRY TIMER
// ═══════════════════════════════════════════════════════════════════════

let _expiryTimer = null;

/**
 * Start periodic expiry check.
 * @param {number} [intervalMs=30000]
 */
export function startExpiryTimer(intervalMs = 30_000) {
  if (_expiryTimer) return;
  _expiryTimer = setInterval(() => {
    const expired = expireStale();
    if (expired > 0) {
      console.log(`[teach] Expired ${expired} stale teach session(s)`);
    }
  }, intervalMs);
}

/**
 * Stop periodic expiry check.
 */
export function stopExpiryTimer() {
  if (_expiryTimer) {
    clearInterval(_expiryTimer);
    _expiryTimer = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS (for testing)
// ═══════════════════════════════════════════════════════════════════════

export { teachSessions, sessionByWss, SESSION_TIMEOUT_MS, MAX_OBSERVATIONS, MIN_OBSERVATIONS_FOR_EXTRACTION };
