/**
 * CyberControl WebSocket Server — extension-service/ws-server.js
 * Phase 3.4 — WSS Protocol
 *
 * Upgrades the existing Express HTTP server to support WebSocket connections.
 * Handles authentication, session management, heartbeat/keepalive, and
 * delegates message routing to ws-handlers.js.
 *
 * ARCHITECTURE (constitution.yml):
 *   Server = Brain + Memory + Knowledge.
 *   Extension connects here to send observations and receive instructions.
 *   All planning, mapping, and AI remain server-side.
 */
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/** Heartbeat interval (ms). Clients must respond within this period. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Maximum time to wait for pong after ping (ms). */
const PONG_TIMEOUT_MS = 10_000;

/**
 * @typedef {object} WsSession
 * @property {string} workspaceId
 * @property {string} userId
 * @property {WebSocket} ws
 * @property {string} sessionId — unique per connection
 * @property {number} connectedAt
 * @property {number} lastActivity
 * @property {string} state — 'active' | 'idle' | 'closing'
 */

/** Active WebSocket sessions indexed by sessionId. */
const sessions = new Map();

/** Map workspaceId → Set<sessionId> for broadcast/lookup. */
const workspaceSessions = new Map();

let _wss = null;
let _heartbeatTimer = null;

/**
 * Attach WebSocket support to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer — the http.createServer() instance
 * @param {object} [options]
 * @param {function} [options.onConnection] — (session) => void
 * @param {function} [options.onMessage] — (session, parsed) => void
 * @param {function} [options.onClose] — (session, code, reason) => void
 * @param {function} [options.onError] — (session, error) => void
 * @returns {{ wss: WebSocketServer, sessions: Map, getSession: function, broadcast: function, send: function, shutdown: function }}
 */
export function attachWebSocket(httpServer, options = {}) {
  if (_wss) throw new Error('WebSocket server already attached');

  _wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 2 * 1024 * 1024, // 2 MB max message
  });

  _wss.on('connection', (ws, req) => {
    const session = _authenticate(ws, req);
    if (!session) return; // ws already closed by _authenticate

    // Register session
    sessions.set(session.sessionId, session);
    if (!workspaceSessions.has(session.workspaceId)) {
      workspaceSessions.set(session.workspaceId, new Set());
    }
    workspaceSessions.get(session.workspaceId).add(session.sessionId);

    // Send welcome
    _send(ws, {
      type: 'connected',
      sessionId: session.sessionId,
      serverTime: Date.now(),
      heartbeatMs: HEARTBEAT_INTERVAL_MS,
    });

    if (options.onConnection) options.onConnection(session);

    // ── Message handling ────────────────────────────────────────────
    ws.on('message', (data) => {
      session.lastActivity = Date.now();
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        _send(ws, { type: 'error', code: 'invalid_json', message: 'Message must be valid JSON' });
        return;
      }
      if (!parsed.type) {
        _send(ws, { type: 'error', code: 'missing_type', message: 'Message must have a "type" field' });
        return;
      }
      if (options.onMessage) options.onMessage(session, parsed);
    });

    // ── Pong response (heartbeat) ────────────────────────────────────
    ws.on('pong', () => {
      session._alive = true;
    });

    // ── Close handling ───────────────────────────────────────────────
    ws.on('close', (code, reason) => {
      _removeSession(session.sessionId);
      if (options.onClose) options.onClose(session, code, reason?.toString());
    });

    // ── Error handling ───────────────────────────────────────────────
    ws.on('error', (err) => {
      if (options.onError) options.onError(session, err);
    });
  });

  // ── Heartbeat timer ───────────────────────────────────────────────
  _heartbeatTimer = setInterval(() => {
    for (const [id, session] of sessions) {
      if (session._alive === false) {
        // Missed pong — terminate
        session.ws.terminate();
        _removeSession(id);
        if (options.onClose) options.onClose(session, 1001, 'heartbeat_timeout');
        continue;
      }
      session._alive = false;
      session.ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    wss: _wss,
    sessions,
    getSession,
    getWorkspaceSessions,
    broadcast,
    send,
    shutdown,
  };
}

/**
 * Authenticate incoming WebSocket upgrade request.
 * Expects: ws://host/ws?token=<jwt>
 * @returns {WsSession|null}
 */
function _authenticate(ws, req) {
  if (!JWT_SECRET) {
    ws.close(4001, 'Server misconfigured: no JWT_SECRET');
    return null;
  }

  const url = new URL(req.url, `http://localhost`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Missing token query parameter');
    return null;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    ws.close(4002, `Auth failed: ${err.message}`);
    return null;
  }

  if (!decoded.workspaceId) {
    ws.close(4003, 'Token missing workspaceId');
    return null;
  }

  const sessionId = `wss.${decoded.workspaceId.slice(0, 8)}.${Date.now().toString(36)}`;

  return {
    sessionId,
    workspaceId: decoded.workspaceId,
    userId: decoded.userId || null,
    role: decoded.role || null,
    ws,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    state: 'active',
    _alive: true,
  };
}

/**
 * Remove a session from all tracking maps.
 */
function _removeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  const wsSet = workspaceSessions.get(session.workspaceId);
  if (wsSet) {
    wsSet.delete(sessionId);
    if (wsSet.size === 0) workspaceSessions.delete(session.workspaceId);
  }
}

/**
 * Get a session by ID.
 */
export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Get all sessions for a workspace.
 */
export function getWorkspaceSessions(workspaceId) {
  const ids = workspaceSessions.get(workspaceId);
  if (!ids) return [];
  return [...ids].map((id) => sessions.get(id)).filter(Boolean);
}

/**
 * Send a message to a specific session.
 * @param {string} sessionId
 * @param {object} message
 * @returns {boolean} — true if sent
 */
export function send(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session || session.ws.readyState !== 1) return false;
  _send(session.ws, message);
  return true;
}

/**
 * Broadcast a message to all sessions in a workspace.
 * @param {string} workspaceId
 * @param {object} message
 */
export function broadcast(workspaceId, message) {
  const ids = workspaceSessions.get(workspaceId);
  if (!ids) return;
  const payload = JSON.stringify(message);
  for (const id of ids) {
    const session = sessions.get(id);
    if (session && session.ws.readyState === 1) {
      session.ws.send(payload);
    }
  }
}

/**
 * Gracefully shutdown the WebSocket server.
 */
export function shutdown() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  for (const [, session] of sessions) {
    _send(session.ws, { type: 'server_shutdown' });
    session.ws.close(1001, 'server_shutdown');
  }
  sessions.clear();
  workspaceSessions.clear();
  if (_wss) {
    _wss.close();
    _wss = null;
  }
}

/**
 * Internal: send JSON message over a WebSocket.
 */
function _send(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

export { sessions, HEARTBEAT_INTERVAL_MS, PONG_TIMEOUT_MS };
