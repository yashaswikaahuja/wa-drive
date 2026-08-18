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
        // Stage A: presence only. Stage B/C will route fill_debug / action_plan here.
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

  /** Send fill debug event if connected (Stage B helper). */
  function sendFillDebug(event, payload) {
    if (!_client || _client.state !== 'connected') return null;
    try {
      return _client.sendFillDebugEvent(event, payload || {});
    } catch (e) {
      console.debug('[CC][wss] fill_debug skip:', e.message);
      return null;
    }
  }

  root.CcWssSession = {
    STORAGE_KEY,
    deriveWsUrl,
    ensureWssFromStorage,
    disconnectWss,
    getClient,
    getState,
    sendFillDebug,
    publishState,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
