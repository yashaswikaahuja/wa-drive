;(function() {
  if (window._ccCSBridgeInit) return;
  window._ccCSBridgeInit = true;

  // ── SEC-001: authenticated, allowlisted page→extension bridge ──────────────
  // The bridge forwards page postMessage payloads to the extension background.
  // Hostile page scripts (including on matched government portals) must NOT be
  // able to drive it. We only accept a message when ALL of the following hold:
  //   1. it originates from THIS window (not an iframe/opener/other frame),
  //   2. its origin is the trusted CyberControl frontend origin,
  //   3. it is a genuine bridge message ({ _cc: true }) and not our own reply,
  //   4. its type is in an explicit allowlist.
  // Replies are posted back to the sender's exact origin, never broadcast to '*'.
  // Local Vite defaults. Prod app origin via __CC_APP_ORIGIN / __CC_PUBLIC_DOMAIN /
  // __CC_TRUSTED_ORIGINS — no baked-in company domain required.
  var TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  try {
    if (typeof globalThis.__CC_APP_ORIGIN === 'string' && globalThis.__CC_APP_ORIGIN) {
      TRUSTED_ORIGINS.unshift(String(globalThis.__CC_APP_ORIGIN).replace(/\/$/, ''));
    } else if (typeof globalThis.__CC_PUBLIC_DOMAIN === 'string' && globalThis.__CC_PUBLIC_DOMAIN) {
      TRUSTED_ORIGINS.unshift('https://app.' + String(globalThis.__CC_PUBLIC_DOMAIN).replace(/^\./, ''));
    }
    if (Array.isArray(globalThis.__CC_TRUSTED_ORIGINS)) {
      for (var i = 0; i < globalThis.__CC_TRUSTED_ORIGINS.length; i++) {
        if (TRUSTED_ORIGINS.indexOf(globalThis.__CC_TRUSTED_ORIGINS[i]) === -1) {
          TRUSTED_ORIGINS.push(globalThis.__CC_TRUSTED_ORIGINS[i]);
        }
      }
    }
  } catch (_) {}
  var ALLOWED_TYPES = [
    'CONNECT',
    'PING',
    'OPEN_AND_DISPATCH',
    'DISPATCH_JOB',
    'DISPATCH_JOB_DIRECT',
    'CONTENT_READY',
    'GET_TAB_ID',
    'AUTOFILL_TRIGGER',
    'TEACH_JOB'
  ];

  // Pure decision function (exposed for tests; no side effects).
  function ccBridgeAccept(e) {
    if (!e || e.source !== window) return false;
    if (TRUSTED_ORIGINS.indexOf(e.origin) === -1) return false;
    var d = e.data;
    if (!d || d._cc !== true) return false;
    if (d._cc_from_cs) return false; // ignore our own replies
    if (typeof d.type !== 'string' || ALLOWED_TYPES.indexOf(d.type) === -1) return false;
    return true;
  }
  try { globalThis.__ccBridgeAccept = ccBridgeAccept; } catch (_) {}

  // Soft guard: after extension reload/update, old content scripts stay but
  // chrome.runtime is an invalidated context — any API throws (operator noise).
  function runtimeAlive() {
    try {
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function safeSend(msg, cb) {
    if (!runtimeAlive()) {
      if (typeof cb === 'function') {
        cb(null, 'Extension context invalidated. Reload this page after updating the extension.');
      }
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        var err = null;
        try {
          err = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        } catch (_) {
          err = 'Extension context invalidated.';
        }
        if (typeof cb === 'function') cb(response, err);
      });
    } catch (e) {
      if (typeof cb === 'function') cb(null, (e && e.message) || String(e));
    }
  }

  window.addEventListener('message', (e) => {
    if (!ccBridgeAccept(e)) return;
    const replyTo = e.origin;
    const { _cc, _cc_to_cs, _reqId, ...msg } = e.data;
    const reqId = _reqId || e.data._reqId;

    safeSend(msg, (response, err) => {
      if (err) {
        window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId: reqId, response: null, err: err }, replyTo);
        return;
      }
      window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId: reqId, response }, replyTo);
    });
  });
})();
