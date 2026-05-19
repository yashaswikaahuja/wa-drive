;(function() {
  if (window._ccCSBridgeInit) return;
  window._ccCSBridgeInit = true;

  let port = null;
  const pending = new Map();
  let retries = 0;

  function connect() {
    if (retries > 5) return; // Stop after 5 retries — extension popup will re-inject if needed
    try {
      port = chrome.runtime.connect({ name: 'cc_bridge' });
      retries = 0;
      port.onMessage.addListener((msg) => {
        if (!msg._cc_reply) return;
        const resolve = pending.get(msg._reqId);
        if (resolve) { pending.delete(msg._reqId); resolve(msg.response); }
        // Send reply back to MAIN world
        window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId: msg._reqId, response: msg.response }, '*');
      });
      port.onDisconnect.addListener(() => {
        port = null;
        retries++;
        setTimeout(connect, 2000 * retries);
      });
    } catch(e) { setTimeout(connect, 2000); }
  }
  connect();

  // Listen for messages from MAIN world relay
  window.addEventListener('message', (e) => {
    if (!e.data?._cc_to_cs) return;
    const { _cc_to_cs, _cc, _reqId, ...msg } = e.data;
    if (!port) { connect(); window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId, response: null, err: 'SW reconnecting...' }, '*'); return; }
    port.postMessage({ _reqId, ...msg });
  });
})();

// ── postMessage Bridge ────────────────────────────────────────────────────────
// Allows ANY frontend URL to communicate with the extension background.
// Frontend sends: window.postMessage({ _cc: true, type, ...payload }, '*')
// Content script relays to background via chrome.runtime.sendMessage.
// Background response is sent back via window.postMessage({ _cc_reply: true, ... })
// This replaces externally_connectable so any URL works (localhost, Vercel, GCP, etc.)

// Content script - floating autofill button + message listener
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') sendResponse({ ok: true });
});

// ── Floating AutoFill Button ─────────────────────────────────────────────────
