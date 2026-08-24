/**
 * AUTO-GENERATED
 * Source: @cc/wss
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== reconnect-manager.js ==== */
/**
 * CyberControl Reconnect Manager — extension/runtime/reconnect-manager.js
 * Phase 3.4 — WSS Protocol
 *
 * Manages WebSocket reconnection with exponential backoff and jitter.
 * Implements Suspended Mode compliance: while disconnected, the extension
 * must not plan, map, interpret, choose recovery, or start learning.
 *
 * ARCHITECTURE (constitution.yml, Discussion 11):
 *   Extension = Eyes + Hands. When server is unavailable:
 *     MAY: preserve transport state, buffer observations, finish
 *          already-authorized safe instructions, reconnect, show status.
 *     MUST NOT: plan, map fields, interpret knowledge, invoke AI,
 *              choose recovery, start learning/teach, select strategies.
 */

/** Default configuration. */
const DEFAULTS = {
  /** Initial delay before first reconnect attempt (ms). T4: fail-fast, not 20–30s dead air. */
  baseDelayMs: 400,
  /** Maximum delay between attempts (ms). Cap short so reconnect feels live. */
  maxDelayMs: 8_000,
  /** Backoff multiplier per attempt. */
  multiplier: 1.6,
  /** Random jitter factor (0–1). Applied as ± jitter * delay. */
  jitter: 0.2,
  /** Maximum number of attempts before giving up (0 = unlimited). */
  maxAttempts: 0,
};

class ReconnectManager {
  /**
   * @param {object} [options]
   * @param {number} [options.baseDelayMs]
   * @param {number} [options.maxDelayMs]
   * @param {number} [options.multiplier]
   * @param {number} [options.jitter]
   * @param {number} [options.maxAttempts]
   * @param {function} [options.onAttempt] — (attempt, delayMs) => void
   * @param {function} [options.onGiveUp] — (attempts) => void
   */
  constructor(options = {}) {
    this._config = { ...DEFAULTS, ...options };
    this._onAttempt = options.onAttempt || null;
    this._onGiveUp = options.onGiveUp || null;

    /** @type {number} Current attempt count. */
    this._attempts = 0;

    /** @type {number|null} Current timer ID. */
    this._timer = null;

    /** @type {boolean} Whether reconnection is active. */
    this._active = false;
  }

  /**
   * Current attempt count.
   */
  get attempts() { return this._attempts; }

  /**
   * Whether reconnection scheduling is active.
   */
  get active() { return this._active; }

  /**
   * Schedule a reconnection attempt.
   * @param {function} connectFn — the function to call to initiate connection
   */
  scheduleReconnect(connectFn) {
    if (this._timer !== null) return; // Already scheduled
    this._active = true;
    this._attempts += 1;

    // Check max attempts
    if (this._config.maxAttempts > 0 && this._attempts > this._config.maxAttempts) {
      this._active = false;
      if (this._onGiveUp) this._onGiveUp(this._attempts - 1);
      return;
    }

    const delay = this._computeDelay();
    if (this._onAttempt) this._onAttempt(this._attempts, delay);

    this._timer = setTimeout(() => {
      this._timer = null;
      connectFn();
    }, delay);
  }

  /**
   * Reset the manager (on successful connection).
   */
  reset() {
    this._attempts = 0;
    this._active = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Cancel any pending reconnection.
   */
  cancel() {
    this._active = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Compute the next delay with exponential backoff and jitter.
   * @returns {number} delay in ms
   */
  _computeDelay() {
    const { baseDelayMs, maxDelayMs, multiplier, jitter } = this._config;
    // Exponential: base * multiplier^(attempts-1)
    const exponential = baseDelayMs * Math.pow(multiplier, this._attempts - 1);
    const capped = Math.min(exponential, maxDelayMs);
    // Jitter: ± jitter * capped
    const jitterRange = capped * jitter;
    const jitterValue = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(capped + jitterValue));
  }

  /**
   * Get the current state for diagnostics.
   */
  getState() {
    return {
      active: this._active,
      attempts: this._attempts,
      maxAttempts: this._config.maxAttempts,
      nextDelayEstimate: this._active ? this._computeDelay() : null,
    };
  }
}

// Export for both ESM and content-script/service-worker contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReconnectManager, DEFAULTS };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcReconnectManager = ReconnectManager;
}

/* ==== ws-client.js ==== */
/**
 * CyberControl WebSocket Client — extension/runtime/ws-client.js
 * Phase 3.4 — WSS Protocol
 *
 * Service-worker–compatible WSS client for the browser extension.
 * Handles message framing, auth handshake, typed message send/receive,
 * and integrates with the reconnect-manager for resilience.
 *
 * ARCHITECTURE (constitution.yml):
 *   Extension = Eyes + Hands.
 *   This client sends observations and receives instructions.
 *   It does NOT plan, interpret knowledge, or make recovery decisions.
 *   When disconnected → Suspended Mode (no autonomous action).
 */

/**
 * Connection states.
 */
const STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  SUSPENDED: 'suspended', // server unavailable — no autonomous decisions
};

/**
 * Message ID generator.
 */
let _msgSeq = 0;
function nextMsgId() {
  _msgSeq += 1;
  return `msg.${Date.now().toString(36)}.${_msgSeq}`;
}

class WsClient {
  /**
   * @param {object} options
   * @param {string} options.url — WSS endpoint (e.g. wss://api.cybercontrol.fun/ws)
   * @param {string} options.token — JWT auth token
   * @param {function} [options.onMessage] — (message: object) => void
   * @param {function} [options.onStateChange] — (state: string) => void
   * @param {function} [options.onError] — (error: Error) => void
   * @param {object} [options.reconnectManager] — ReconnectManager instance
   */
  constructor(options) {
    this._url = options.url;
    this._token = options.token;
    this._onMessage = options.onMessage || null;
    this._onStateChange = options.onStateChange || null;
    this._onError = options.onError || null;
    this._reconnectManager = options.reconnectManager || null;

    /** @type {WebSocket|null} */
    this._ws = null;

    /** @type {string} */
    this._state = STATE.DISCONNECTED;

    /** @type {string|null} Server-assigned session ID. */
    this._sessionId = null;

    /** @type {Map<string, {resolve, reject, timer}>} Pending request→response map. */
    this._pending = new Map();

    /** @type {number} Default timeout for request/response pairs (ms). */
    this._requestTimeout = 15_000;

    /** @type {string|null} Last snapshot ID sent (for resume). */
    this._lastSnapshotId = null;

    /** @type {number|null} Last revision sent. */
    this._lastRevision = null;

    /** @type {number} Outbound sequence for ordering. */
    this._outSeq = 0;

    /** Protocol version (must match server PROTOCOL_VERSION). */
    this._protocolVersion = 1;

    /** @type {string|null} Optional tab isolation. */
    this._tabId = options.tabId || null;

    /** @type {string|null} Optional workflow isolation. */
    this._workflowId = options.workflowId || null;

    /** @type {Set<string>} Server message ids already handled (dedupe action_plan etc.). */
    this._seenServerIds = new Set();

    /** @type {string|null} Last accepted action plan id (stale/dupe safety). */
    this._lastPlanId = null;
  }

  /**
   * Current connection state.
   */
  get state() { return this._state; }

  /**
   * Server-assigned session ID (null until connected).
   */
  get sessionId() { return this._sessionId; }

  /**
   * Connect to the WebSocket server.
   */
  connect() {
    if (this._state === STATE.CONNECTED || this._state === STATE.CONNECTING) return;
    this._setState(STATE.CONNECTING);

    const wsUrl = `${this._url}?token=${encodeURIComponent(this._token)}`;

    try {
      this._ws = new WebSocket(wsUrl);
    } catch (err) {
      this._setState(STATE.SUSPENDED);
      if (this._onError) this._onError(err);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      // Wait for the 'connected' message from server before declaring CONNECTED.
    };

    this._ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return; // Ignore non-JSON
      }
      this._handleMessage(msg);
    };

    this._ws.onerror = (event) => {
      if (this._onError) this._onError(new Error('WebSocket error'));
    };

    this._ws.onclose = (event) => {
      this._ws = null;
      this._sessionId = null;
      // Reject all pending requests
      for (const [id, entry] of this._pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Connection closed (code=${event.code})`));
      }
      this._pending.clear();

      if (this._state !== STATE.DISCONNECTED) {
        this._setState(STATE.SUSPENDED);
        this._scheduleReconnect();
      }
    };
  }

  /**
   * Gracefully disconnect.
   */
  disconnect() {
    this.stopHeartbeat();
    this._setState(STATE.DISCONNECTED);
    if (this._ws) {
      this._ws.close(1000, 'client_disconnect');
      this._ws = null;
    }
    this._sessionId = null;
    if (this._reconnectManager) this._reconnectManager.reset();
  }

  /**
   * Send a typed message. Returns a message ID.
   * @param {string} type
   * @param {object} [payload]
   * @returns {string} messageId
   */
  send(type, payload = {}) {
    if (this._state !== STATE.CONNECTED) {
      throw new Error(`Cannot send in state: ${this._state} (Suspended Mode)`);
    }
    const id = nextMsgId();
    this._outSeq += 1;
    const message = {
      v: this._protocolVersion,
      id,
      type,
      seq: this._outSeq,
      ts: Date.now(),
      ...(this._tabId ? { tabId: this._tabId } : {}),
      ...(this._workflowId ? { workflowId: this._workflowId } : {}),
      ...payload,
    };
    this._ws.send(JSON.stringify(message));
    return id;
  }

  /**
   * Send a message and wait for a response (matched by `ref` field).
   * @param {string} type
   * @param {object} [payload]
   * @param {number} [timeoutMs]
   * @returns {Promise<object>}
   */
  request(type, payload = {}, timeoutMs) {
    const timeout = timeoutMs || this._requestTimeout;
    const id = this.send(type, payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request timeout (${type}, ${id})`));
      }, timeout);
      this._pending.set(id, { resolve, reject, timer });
    });
  }

  // ─── Typed send helpers ───────────────────────────────────────────

  /**
   * Send a PageSnapshot to the server.
   */
  sendSnapshot(snapshot) {
    this._lastSnapshotId = snapshot.snapshot_id;
    this._lastRevision = snapshot.revision;
    return this.send('page_snapshot', { snapshot });
  }

  /**
   * Send a PageDelta to the server.
   */
  sendDelta(delta) {
    this._lastRevision = delta.revision;
    return this.send('page_delta', { delta });
  }

  /**
   * Send an ExecutionObservation.
   */
  sendObservation(observation) {
    return this.send('execution_observation', { observation });
  }

  /**
   * T5 — live fill/debug event stream (field.start / wait / done / fail).
   * Non-fatal if not connected; HTTPS session post remains durable end-state.
   * @param {'field.start'|'field.wait'|'field.done'|'field.fail'|'fill.start'|'fill.end'|'auth.presence'} event
   * @param {object} [payload]
   */
  sendFillDebugEvent(event, payload = {}) {
    if (this._state !== STATE.CONNECTED) return null;
    try {
      return this.send('fill_debug_event', {
        event,
        ts: Date.now(),
        ...payload,
      });
    } catch {
      return null;
    }
  }

  /**
   * T4 — explicit auth presence ping (fail-fast detection of dead sockets).
   */
  async pingAuth(timeoutMs = 3000) {
    if (this._state !== STATE.CONNECTED) {
      throw new Error(`Cannot ping in state: ${this._state}`);
    }
    return this.request('ping', { purpose: 'auth_presence' }, timeoutMs);
  }

  /**
   * Heartbeat helper for presence (T4). Call on an interval from popup/background.
   */
  startHeartbeat(intervalMs = 15000) {
    this.stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._state !== STATE.CONNECTED) return;
      try {
        this.send('ping', { purpose: 'heartbeat', ts: Date.now() });
      } catch { /* suspended */ }
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /**
   * Request knowledge sync over WSS.
   */
  async requestSync(requestType, payload = {}) {
    return this.request('sync_request', { requestType, payload });
  }

  /**
   * Send a teach-mode observation.
   */
  sendTeachObservation(data) {
    return this.send('teach_observation', { data });
  }

  /**
   * Send resume request after reconnection.
   */
  sendResume() {
    return this.send('resume', {
      lastSnapshotId: this._lastSnapshotId,
      lastRevision: this._lastRevision,
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────

  _handleMessage(msg) {
    // Dedupe server messages by id (prevents double-execute of action_plan)
    if (msg.id && typeof msg.id === 'string') {
      if (this._seenServerIds.has(msg.id)) {
        return; // drop duplicate
      }
      this._seenServerIds.add(msg.id);
      if (this._seenServerIds.size > 512) {
        const first = this._seenServerIds.values().next().value;
        this._seenServerIds.delete(first);
      }
    }

    // Check if this is a response to a pending request
    if (msg.ref && this._pending.has(msg.ref)) {
      const { resolve, timer } = this._pending.get(msg.ref);
      clearTimeout(timer);
      this._pending.delete(msg.ref);
      resolve(msg);
      return;
    }

    // Handle server-initiated messages
    switch (msg.type) {
      case 'connected':
        this._sessionId = msg.sessionId;
        if (msg.protocolVersion != null) this._protocolVersion = Number(msg.protocolVersion) || 1;
        this._setState(STATE.CONNECTED);
        if (this._reconnectManager) this._reconnectManager.reset();
        // If reconnecting, send resume
        if (this._lastSnapshotId) {
          this.sendResume();
        }
        break;

      case 'server_shutdown':
        // Server is shutting down gracefully
        this._setState(STATE.SUSPENDED);
        break;

      case 'action_plan': {
        // Stale plan safety: ignore same plan_id twice
        const planId = msg.plan?.plan_id || msg.plan?.id || null;
        if (planId && planId === this._lastPlanId) {
          return;
        }
        if (planId) this._lastPlanId = planId;
        if (this._onMessage) this._onMessage(msg);
        break;
      }

      case 'pong':
        // Server response to our ping — no-op
        break;

      case 'error':
        if (this._onError) this._onError(new Error(`Server error: ${msg.code} — ${msg.message}`));
        break;

      default:
        // Forward to the application-level message handler
        // Suspended Mode: still deliver server messages only when CONNECTED
        if (this._state === STATE.CONNECTED && this._onMessage) this._onMessage(msg);
        break;
    }
  }

  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    if (this._onStateChange) this._onStateChange(newState);
  }

  _scheduleReconnect() {
    if (this._state === STATE.DISCONNECTED) return; // intentional disconnect
    if (this._reconnectManager) {
      this._reconnectManager.scheduleReconnect(() => this.connect());
    }
  }
}

// Export for both ESM and content-script/service-worker contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WsClient, STATE };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcWsClient = WsClient;
  globalThis.CcWsClientSTATE = STATE;
}

/* ==== wss-session.js ==== */
/**
 * WSS session controller for the extension service worker (T4 Stage A).
 * Owns a single CcWsClient + ReconnectManager, persists presence state for the popup.
 *
 * HTTPS remains for token mint / profile CRUD.
 * This module opens authenticated WSS after credentials land in storage.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'ccWssState';
  let _client = null;
  let _reconnect = null;
  let _lastToken = null;
  let _lastUrl = null;

  function deriveWsUrl(backendUrl) {
    if (!backendUrl) return null;
    try {
      // https://api.x/api → wss://api.x/ws
      const trimmed = String(backendUrl).replace(/\/$/, '');
      const origin = trimmed.replace(/\/api$/i, '');
      const u = new URL(origin);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/ws';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return null;
    }
  }

  function publishState(partial) {
    const payload = {
      state: 'disconnected',
      sessionId: null,
      url: _lastUrl,
      lastError: null,
      updatedAt: Date.now(),
    };
    if (partial && typeof partial === 'object') {
      for (const k of Object.keys(partial)) {
        if (partial[k] !== undefined) payload[k] = partial[k];
      }
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } catch (e) {
      console.warn('[CC][wss] publishState failed:', e.message);
    }
    return payload;
  }

  function ensureClient(wsUrl, token) {
    const WsClient = root.CcWsClient;
    const ReconnectManager = root.CcReconnectManager;
    if (!WsClient) {
      publishState({ state: 'error', lastError: 'CcWsClient not loaded' });
      return null;
    }

    if (_client && _lastToken === token && _lastUrl === wsUrl) {
      if (_client.state === 'disconnected' || _client.state === 'suspended') {
        _client.connect();
      }
      return _client;
    }

    if (_client) {
      try { _client.disconnect(); } catch { /* ignore */ }
      _client = null;
    }

    _lastToken = token;
    _lastUrl = wsUrl;

    _reconnect = new ReconnectManager({
      baseDelayMs: 400,
      maxDelayMs: 8000,
      multiplier: 1.6,
      jitter: 0.2,
      onAttempt: (attempt, delayMs) => {
        publishState({
          state: 'reconnecting',
          sessionId: null,
          lastError: `reconnect #${attempt} in ${delayMs}ms`,
        });
      },
    });

    _client = new WsClient({
      url: wsUrl,
      token,
      reconnectManager: _reconnect,
      onStateChange: (state) => {
        publishState({
          state,
          sessionId: _client.sessionId || null,
          lastError: state === 'connected' ? null : undefined,
        });
        if (state === 'connected') {
          try { _client.startHeartbeat(15000); } catch { /* ignore */ }
          // Let background flush fill_debug outbox that queued while offline
          try {
            if (typeof root.__ccOnWssConnected === 'function') root.__ccOnWssConnected();
          } catch { /* ignore */ }
        }
      },
      onError: (err) => {
        publishState({
          state: _client ? _client.state : 'suspended',
          sessionId: null,
          lastError: (err && err.message) || String(err),
        });
      },
      onMessage: (msg) => {
        if (msg && msg.type === 'error') {
          publishState({
            state: _client ? _client.state : 'suspended',
            lastError: msg.message || msg.code || 'server error',
          });
        }
      },
    });

    publishState({ state: 'connecting', sessionId: null, lastError: null });
    _client.connect();
    return _client;
  }

  /**
   * Ensure WSS is up for current chrome.storage credentials.
   */
  async function ensureWssFromStorage() {
    const data = await chrome.storage.local.get(['accessToken', 'backendUrl']);
    if (!data.accessToken || !data.backendUrl) {
      disconnectWss('no credentials');
      return { ok: false, error: 'no_credentials' };
    }
    const wsUrl = deriveWsUrl(data.backendUrl);
    if (!wsUrl) {
      publishState({ state: 'error', lastError: 'bad backendUrl' });
      return { ok: false, error: 'bad_backend_url' };
    }
    const client = ensureClient(wsUrl, data.accessToken);
    return { ok: !!client, url: wsUrl, state: client ? client.state : 'error' };
  }

  function disconnectWss(reason) {
    if (_client) {
      try { _client.disconnect(); } catch { /* ignore */ }
      _client = null;
    }
    _lastToken = null;
    publishState({ state: 'disconnected', sessionId: null, lastError: reason || null });
  }

  function getClient() {
    return _client;
  }

  async function getState() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || { state: 'disconnected' };
  }

  /** Send fill debug event if connected. Returns message id or null. */
  function sendFillDebug(event, payload) {
    if (!_client || _client.state !== 'connected') return null;
    try {
      const raw = payload || {};
      // Avoid clobbering envelope fields (type/id/v/event) on the wire frame
      const {
        event: _ev,
        type: _ty,
        id: _id,
        v: _v,
        seq: _seq,
        ...rest
      } = raw;
      return _client.sendFillDebugEvent(event, rest);
    } catch (e) {
      console.warn('[CC][wss] fill_debug send failed:', e.message);
      publishState({
        state: 'suspended',
        sessionId: null,
        lastError: e.message || 'send failed',
      });
      try {
        if (_client && typeof _client.connect === 'function') _client.connect();
      } catch { /* ignore */ }
      return null;
    }
  }

  /** Stage C — request sequential fill mapping over WSS. */
  async function requestFillPlan(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('fill_request', payload || {}, timeoutMs || 20000);
  }

  /** Stage C — persist fill session over WSS. */
  async function postFillSession(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('fill_session', payload || {}, timeoutMs || 15000);
  }

  /** List profiles over WSS (UI). */
  async function requestProfilesList(timeoutMs) {
    await ensureWssFromStorage();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (_client && _client.state === 'connected') break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!_client || _client.state !== 'connected') {
      throw new Error('wss_not_connected');
    }
    return _client.request('profiles_list', {}, timeoutMs || 15000);
  }

  root.CcWssSession = {
    STORAGE_KEY,
    deriveWsUrl,
    ensureWssFromStorage,
    disconnectWss,
    getClient,
    getState,
    sendFillDebug,
    requestFillPlan,
    postFillSession,
    requestProfilesList,
    isConnected: () => !(!_client || _client.state !== 'connected'),
    publishState,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
