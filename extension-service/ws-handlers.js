/**
 * CyberControl WebSocket Message Handlers — extension-service/ws-handlers.js
 * Phase 3.4 — WSS Protocol
 *
 * Routes incoming WebSocket messages to appropriate handlers.
 * Messages from the extension:
 *   - page_snapshot: full snapshot of current page
 *   - page_delta: incremental changes
 *   - execution_observation: result of executing an action plan
 *   - sync_request: knowledge sync request
 *   - teach_observation: teach-mode behavioral data
 *   - heartbeat: keepalive acknowledgment
 *
 * Messages to the extension (sent via ws-server.send):
 *   - action_plan: instructions to execute
 *   - sync_response: knowledge data
 *   - teach_prompt: teach-mode prompts
 *   - status: server status updates
 *   - error: error responses
 *
 * ARCHITECTURE (constitution.yml):
 *   All planning, AI, knowledge interpretation, and learning happen here.
 *   The extension only observes and executes.
 */

import { send } from './ws-server.js';

/**
 * @typedef {object} HandlerContext
 * @property {function} getKnowledge — (workspaceId, kind, scope) => records
 * @property {function} resolveMapping — (workspaceId, snapshot) => actionPlan
 * @property {function} recordObservation — (workspaceId, observation) => void
 * @property {function} recordTeachData — (workspaceId, data) => void
 * @property {function} syncKnowledge — (workspaceId, request) => response
 */

/** Message type → handler function. */
const handlers = new Map();

/**
 * Initialize the handlers with service dependencies.
 *
 * @param {HandlerContext} [ctx] — service functions (injected for testability)
 * @returns {{ onMessage: function, onConnection: function, onClose: function }}
 */
export function createHandlers(ctx = {}) {
  /**
   * Handle an incoming message from a connected extension.
   * @param {object} session — from ws-server (sessionId, workspaceId, ws, etc.)
   * @param {object} message — parsed JSON with `type` field
   */
  function onMessage(session, message) {
    const handler = handlers.get(message.type);
    if (handler) {
      handler(session, message, ctx);
    } else {
      send(session.sessionId, {
        type: 'error',
        code: 'unknown_message_type',
        message: `Unknown message type: ${message.type}`,
        ref: message.id || null,
      });
    }
  }

  /**
   * Handle new connection.
   */
  function onConnection(session) {
    console.log(`[ws] Connected: ${session.sessionId} (workspace: ${session.workspaceId.slice(0, 8)}...)`);
  }

  /**
   * Handle connection close.
   */
  function onClose(session, code, reason) {
    console.log(`[ws] Disconnected: ${session.sessionId} (code=${code}, reason=${reason || 'none'})`);
  }

  return { onMessage, onConnection, onClose };
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * page_snapshot — Extension sends a full PageSnapshot v2.
 * Server acknowledges and may respond with an action_plan.
 */
handlers.set('page_snapshot', (session, message, ctx) => {
  const { snapshot } = message;
  if (!snapshot || snapshot.kind !== 'page_snapshot') {
    send(session.sessionId, { type: 'error', code: 'invalid_snapshot', message: 'Expected a valid PageSnapshot', ref: message.id });
    return;
  }

  // Acknowledge receipt
  send(session.sessionId, {
    type: 'snapshot_ack',
    snapshotId: snapshot.snapshot_id,
    revision: snapshot.revision,
    serverTime: Date.now(),
    ref: message.id,
    tabId: message.tabId || session.tabId || null,
    workflowId: message.workflowId || session.workflowId || null,
  });

  // If context has a resolver, attempt to generate an action plan
  if (ctx.resolveMapping) {
    try {
      const plan = ctx.resolveMapping(session.workspaceId, snapshot, {
        tabId: message.tabId || session.tabId,
        workflowId: message.workflowId || session.workflowId,
      });
      if (plan) {
        send(session.sessionId, {
          type: 'action_plan',
          plan,
          ref: message.id,
          tabId: message.tabId || session.tabId || null,
          workflowId: message.workflowId || session.workflowId || null,
        });
      }
    } catch (err) {
      console.error(`[ws] resolveMapping error:`, err.message);
    }
  }
});

/**
 * page_delta — Extension sends incremental changes.
 * Server acknowledges.
 */
handlers.set('page_delta', (session, message, ctx) => {
  const { delta } = message;
  if (!delta || delta.kind !== 'page_delta') {
    send(session.sessionId, { type: 'error', code: 'invalid_delta', message: 'Expected a valid PageDelta', ref: message.id });
    return;
  }

  send(session.sessionId, {
    type: 'delta_ack',
    resultSnapshotId: delta.result_snapshot_id,
    revision: delta.revision,
    serverTime: Date.now(),
    ref: message.id,
  });
});

/**
 * execution_observation — Extension reports action execution results.
 */
handlers.set('execution_observation', (session, message, ctx) => {
  const { observation } = message;
  if (!observation || observation.kind !== 'execution_observation') {
    send(session.sessionId, { type: 'error', code: 'invalid_observation', message: 'Expected ExecutionObservation', ref: message.id });
    return;
  }

  send(session.sessionId, {
    type: 'observation_ack',
    observationId: observation.observation_id,
    outcome: observation.outcome,
    ref: message.id,
  });

  if (ctx.recordObservation) {
    try {
      ctx.recordObservation(session.workspaceId, observation);
    } catch (err) {
      console.error(`[ws] recordObservation error:`, err.message);
    }
  }
});

/**
 * sync_request — Extension requests knowledge sync over WSS.
 * Mirrors the HTTP sync protocol but over the live connection.
 */
handlers.set('sync_request', (session, message, ctx) => {
  const { requestType, payload } = message;
  if (!requestType || !['bootstrap', 'delta', 'check'].includes(requestType)) {
    send(session.sessionId, { type: 'error', code: 'invalid_sync_request', message: 'requestType must be bootstrap|delta|check', ref: message.id });
    return;
  }

  if (ctx.syncKnowledge) {
    try {
      const response = ctx.syncKnowledge(session.workspaceId, { requestType, payload });
      send(session.sessionId, { type: 'sync_response', requestType, data: response, ref: message.id });
    } catch (err) {
      send(session.sessionId, { type: 'error', code: 'sync_failed', message: err.message, ref: message.id });
    }
  } else {
    send(session.sessionId, { type: 'error', code: 'sync_unavailable', message: 'Sync handler not configured', ref: message.id });
  }
});

/**
 * teach_observation — Extension sends behavioral observation during teach mode.
 */
handlers.set('teach_observation', (session, message, ctx) => {
  const { data } = message;
  if (!data) {
    send(session.sessionId, { type: 'error', code: 'invalid_teach_data', message: 'Missing teach observation data', ref: message.id });
    return;
  }

  send(session.sessionId, { type: 'teach_ack', ref: message.id });

  if (ctx.recordTeachData) {
    try {
      ctx.recordTeachData(session.workspaceId, data);
    } catch (err) {
      console.error(`[ws] recordTeachData error:`, err.message);
    }
  }
});

/**
 * ping — Client-initiated ping (in addition to WebSocket-level ping/pong).
 */
handlers.set('ping', (session, message) => {
  send(session.sessionId, { type: 'pong', serverTime: Date.now(), ref: message.id });
});

/**
 * resume — Client reconnected and wants to resume from a known state.
 */
handlers.set('resume', (session, message) => {
  const { lastSnapshotId, lastRevision } = message;
  send(session.sessionId, {
    type: 'resume_ack',
    accepted: true,
    lastSnapshotId: lastSnapshotId || null,
    lastRevision: lastRevision ?? null,
    serverTime: Date.now(),
    ref: message.id,
  });
});

export { handlers };
