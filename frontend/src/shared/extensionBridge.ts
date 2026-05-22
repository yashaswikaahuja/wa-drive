/**
 * Frontend ↔ Extension Bridge (postMessage-based)
 *
 * Resilient flow:
 *   - First attempt: 10s timeout (cold service worker startup)
 *   - Auto-retry every 3s for first 30s after auth
 *   - Keepalive ping every 60s once connected (re-pushes token if SW restarted)
 *   - Status updates pushed to subscribers (sidebar indicator)
 */

let _reqCounter = 0;

function sendToExtension(msg: Record<string, unknown>, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve) => {
    const reqId = ++_reqCounter;
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve({ ok: false, error: 'Extension not responding — install/enable CyberControl extension' });
    }, timeoutMs);

    function handler(event: MessageEvent) {
      if (!event.data?._cc_reply || event.data._reqId !== reqId) return;
      clearTimeout(timer);
      window.removeEventListener('message', handler);
      if (event.data.err) resolve({ ok: false, error: event.data.err });
      else resolve(event.data.response ?? { ok: false });
    }

    window.addEventListener('message', handler);
    window.postMessage({ _cc: true, _reqId: reqId, ...msg }, '*');
  });
}

interface ConnectPayload {
  accessToken: string;
  refreshToken: string | null;
  user: any;
  backendUrl: string;
}

// ── Connection status (reactive) ────────────────────────────────────────
type Status = 'unknown' | 'connecting' | 'connected' | 'disconnected';
let _status: Status = 'unknown';
let _lastVersion: string | null = null;
const _statusListeners = new Set<(s: Status, version: string | null) => void>();

function setStatus(s: Status, version: string | null = _lastVersion) {
  if (s === _status && version === _lastVersion) return;
  _status = s;
  _lastVersion = version;
  _statusListeners.forEach(fn => { try { fn(s, version); } catch {} });
}

// ── Auto-retry / keepalive loop ────────────────────────────────────────
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let _currentPayload: ConnectPayload | null = null;
let _retryAttempt = 0;

function scheduleRetry(delay: number) {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => attemptConnect(), delay);
}

async function attemptConnect() {
  if (!_currentPayload) return;
  setStatus('connecting');
  _retryAttempt++;
  // First attempt: 10s timeout (cold SW). Subsequent: 5s.
  const timeout = _retryAttempt === 1 ? 10000 : 5000;
  const result = await sendToExtension({
    type: 'CONNECT',
    token: _currentPayload.accessToken,
    refreshToken: _currentPayload.refreshToken,
    user: _currentPayload.user,
    backendUrl: _currentPayload.backendUrl,
  }, timeout);

  if (result.ok) {
    setStatus('connected', result.version || null);
    _retryAttempt = 0;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    // Start keepalive: refresh token every 60s
    if (!_keepaliveTimer) {
      _keepaliveTimer = setInterval(() => attemptConnect(), 60_000);
    }
  } else {
    setStatus('disconnected');
    // Retry: 3s, 6s, 9s, ..., capped at 15s
    const delay = Math.min(_retryAttempt * 3000, 15000);
    scheduleRetry(delay);
  }
}

export const extensionBridge = {
  isAvailable(): boolean { return true; },

  getStatus(): { status: Status; version: string | null } {
    return { status: _status, version: _lastVersion };
  },

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onStatus(fn: (s: Status, version: string | null) => void): () => void {
    _statusListeners.add(fn);
    fn(_status, _lastVersion); // immediate call with current state
    return () => _statusListeners.delete(fn);
  },

  async ping(): Promise<{ ok: boolean; version?: string }> {
    return sendToExtension({ type: 'PING' }, 2000);
  },

  /** Start the connect+keepalive loop. Idempotent — safe to call multiple times. */
  connect(payload: ConnectPayload): Promise<{ ok: boolean; error?: string; version?: string }> {
    _currentPayload = payload;
    _retryAttempt = 0;
    return new Promise((resolve) => {
      // Resolve as soon as first attempt completes (success or failure)
      // but the retry loop continues in background regardless.
      const unsub = extensionBridge.onStatus((s, version) => {
        if (s === 'connected') { unsub(); resolve({ ok: true, version: version || undefined }); }
        else if (s === 'disconnected' && _retryAttempt >= 1) { /* keep waiting for next retry */ }
      });
      attemptConnect();
    });
  },

  /** Stop all retries and keepalives (call on logout). */
  disconnect() {
    _currentPayload = null;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    if (_keepaliveTimer) { clearInterval(_keepaliveTimer); _keepaliveTimer = null; }
    setStatus('unknown');
  },

  async openAndDispatch(envelope: any, formUrl: string): Promise<{ ok: boolean; tabId?: number; error?: string }> {
    return sendToExtension({ type: 'OPEN_AND_DISPATCH', envelope, formUrl }, 8000);
  },
};
