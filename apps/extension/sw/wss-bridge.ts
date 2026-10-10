/**
 * SW WSS bridge — ensure socket + reliable fill_debug outbox.
 * Loaded via importScripts from background.js (MV3 service worker).
 * Depends on: runtime/wss-session.js (CcWssSession).
 */
/* global CcWssSession, chrome */

function ccEnsureWss(reason) {
  if (typeof CcWssSession === 'undefined' || !CcWssSession.ensureWssFromStorage) {
    console.warn('[CC][wss] CcWssSession unavailable');
    return Promise.resolve({ ok: false, error: 'wss_session_missing' });
  }
  console.log('[CC][wss] ensure from', reason || 'unknown');
  return CcWssSession.ensureWssFromStorage().catch((e) => {
    console.warn('[CC][wss] ensure failed:', e.message);
    return { ok: false, error: e.message };
  });
}

// Long-lived fill debug port (page → SW → outbox → WSS).
const _fillDebugOutbox = [];
const _FILL_DEBUG_OUTBOX_MAX = 300;
let _fillDebugFlushTimer = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cc_fill_debug') return;
  console.log('[CC][wss] fill_debug port connected');
  port.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'FILL_DEBUG_BATCH' && Array.isArray(msg.events)) {
      for (const ev of msg.events) forwardFillDebug(ev);
      return;
    }
    if (msg.type === 'FILL_DEBUG') forwardFillDebug(msg);
  });
  port.onDisconnect.addListener(() => {
    console.log('[CC][wss] fill_debug port disconnected');
  });
});

function enqueueFillDebug(msg) {
  if (!msg) return;
  const event = msg.event || 'field.unknown';
  const { type: _t, event: _e, ...rest } = msg;
  _fillDebugOutbox.push({ event, payload: rest });
  if (_fillDebugOutbox.length > _FILL_DEBUG_OUTBOX_MAX) {
    _fillDebugOutbox.splice(0, _fillDebugOutbox.length - _FILL_DEBUG_OUTBOX_MAX);
  }
  flushFillDebugOutbox();
}

function flushFillDebugOutbox() {
  if (!_fillDebugOutbox.length) return;
  if (typeof CcWssSession === 'undefined' || !CcWssSession.sendFillDebug) {
    console.warn('[CC][wss] fill_debug outbox:', _fillDebugOutbox.length, '(no CcWssSession)');
    return;
  }
  const st = CcWssSession.getClient?.()?.state;
  if (st !== 'connected') {
    ccEnsureWss('FILL_DEBUG_OUTBOX');
    if (!_fillDebugFlushTimer) {
      _fillDebugFlushTimer = setTimeout(() => {
        _fillDebugFlushTimer = null;
        flushFillDebugOutbox();
      }, 200);
    }
    return;
  }
  let sent = 0;
  while (_fillDebugOutbox.length) {
    const item = _fillDebugOutbox[0];
    const ok = CcWssSession.sendFillDebug(item.event, item.payload);
    if (!ok) {
      console.warn('[CC][wss] fill_debug send failed, keeping outbox=', _fillDebugOutbox.length, item.event);
      ccEnsureWss('FILL_DEBUG_RETRY');
      if (!_fillDebugFlushTimer) {
        _fillDebugFlushTimer = setTimeout(() => {
          _fillDebugFlushTimer = null;
          flushFillDebugOutbox();
        }, 250);
      }
      break;
    }
    _fillDebugOutbox.shift();
    sent += 1;
  }
  if (sent) console.log('[CC][wss] fill_debug flushed', sent, 'left=', _fillDebugOutbox.length);
}

globalThis.__ccOnWssConnected = function () {
  if (_fillDebugOutbox.length) {
    console.log('[CC][wss] connected — flushing fill_debug outbox', _fillDebugOutbox.length);
    flushFillDebugOutbox();
  }
};

function forwardFillDebug(msg) {
  try {
    enqueueFillDebug(msg);
  } catch (e) {
    console.warn('[CC][wss] forwardFillDebug error:', e.message);
  }
}
