/**
 * Live fill_debug emit (port + batch queue)
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDebug = function (k) {
    k._debugPort = null;
    k._debugQueue = [];
    k._debugFlushTimer = null;
  function ensureDebugPort() {
    if (k._debugPort) return k._debugPort;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) return null;
      k._debugPort = chrome.runtime.connect({ name: 'cc_fill_debug' });
      k._debugPort.onDisconnect.addListener(function () {
        k._debugPort = null;
      });
    } catch (e) {
      k._debugPort = null;
    }
    return k._debugPort;
  }
  function flushDebugQueue() {
    if (!k._debugQueue.length) return;
    const batch = k._debugQueue.splice(0, 40);
    try {
      const port = ensureDebugPort();
      if (port) {
        port.postMessage({ type: 'FILL_DEBUG_BATCH', events: batch });
        if (k._debugQueue.length) scheduleDebugFlush();
        return;
      }
    } catch (e) {
      k._debugPort = null;
    }
    // Fallback: one-by-one sendMessage (best-effort)
    for (let i = 0; i < batch.length; i++) {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: 'FILL_DEBUG' }, batch[i]), function () {
          void chrome.runtime.lastError;
        });
      } catch (e2) {
        /* ignore */
      }
    }
    if (k._debugQueue.length) scheduleDebugFlush();
  }
  function scheduleDebugFlush() {
    if (k._debugFlushTimer) return;
    k._debugFlushTimer = setTimeout(function () {
      k._debugFlushTimer = null;
      flushDebugQueue();
    }, 40);
  }
  function emitFillDebug(event, payload) {
    const evt = Object.assign(
      {
        event: event,
        fillRunId: k.fillRunId,
        hostname: typeof location !== 'undefined' ? location.hostname : '',
        ts: Date.now(),
        rv: k.RUNTIME_VERSION,
      },
      payload || {}
    );
    // Rename field widget type so it doesn't clash with message type
    if (evt.type && evt.type !== 'FILL_DEBUG') {
      evt.fieldType = evt.type;
      delete evt.type;
    }
    k._debugQueue.push(evt);
    // Start/end and large batches flush immediately; field.* coalesce ~40ms
    if (event === 'fill.start' || event === 'fill.end' || k._debugQueue.length >= 6) {
      if (k._debugFlushTimer) {
        clearTimeout(k._debugFlushTimer);
        k._debugFlushTimer = null;
      }
      flushDebugQueue();
    } else {
      scheduleDebugFlush();
    }
  }
    k.emitFillDebug = emitFillDebug;
    k.flushDebugQueue = flushDebugQueue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
