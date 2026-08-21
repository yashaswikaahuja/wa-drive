/**
 * Live fill_debug emit (port + batch queue)
 * Part of sequential kernel — load before autofill/executor.js
 *
 * fill-debug-emitter.js owns the pure event queue + batch logic.
 * This file owns the Chrome transport and wires it to the kernel.
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDebug = function (k) {
    k._debugPort = null;
    k._debugQueue = [];
    k._debugFlushTimer = null;

  // ── fill-debug-emitter.js is the single source for queue + event assembly ──
  // Must be loaded before debug.js (see build-executor-bundle.mjs ORDER).
  var _fde = root.CcFillDebugEmitter || {};

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

  function chromeSend(batch) {
    try {
      var port = ensureDebugPort();
      if (port) {
        port.postMessage({ type: 'FILL_DEBUG_BATCH', events: batch });
        return;
      }
    } catch (e) {
      k._debugPort = null;
    }
    // Fallback: one-by-one sendMessage (best-effort)
    for (var i = 0; i < batch.length; i++) {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: 'FILL_DEBUG' }, batch[i]), function () {
          void chrome.runtime.lastError;
        });
      } catch (e2) { /* ignore */ }
    }
  }

  var _emitter;
  if (_fde.createEmitter) {
    _emitter = _fde.createEmitter({
      getRunId:    function () { return k.fillRunId || ''; },
      getRv:       function () { return k.RUNTIME_VERSION || ''; },
      send:        chromeSend,
    });
  }

  function emitFillDebug(event, payload) {
    if (_emitter) { _emitter.emit(event, payload); return; }
    // Safe fallback if emitter not loaded
    console.warn('[CC] fill-debug-emitter not loaded, event dropped:', event);
  }

  function flushDebugQueue() {
    if (_emitter) _emitter.flush();
  }

    k.emitFillDebug = emitFillDebug;
    k.flushDebugQueue = flushDebugQueue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
