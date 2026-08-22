/**
 * cc-background/bridge — Frontend bridge: port handler, handleBridgeMessage,
 * and onMessageExternal for the service worker.
 *
 * Depends on globals from cc-background/auth: CC_TRUSTED_ONLY_TYPES,
 * ccIsTrustedFrontend, isLegacyClientFillAllowed, legacyClientFillDenied.
 * Calls: ccEnsureWss, runJobDispatch (must be loaded before this).
 */

// â”€â”€ Long-lived port â€” keeps SW alive and bridges postMessage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Content script connects a port on load. This keeps SW alive (no 30s timeout).
// Messages from the page are forwarded through the port.
const _pendingPortMessages = new Map(); // reqId -> resolve

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'cc_bridge') return;
  let connected = true;
  const portTrusted = ccIsTrustedFrontend(port.sender);
  port.onDisconnect.addListener(() => { connected = false; });
  port.onMessage.addListener((msg) => {
    const { _reqId, ...payload } = msg;
    handleBridgeMessage(payload, (response) => {
      if (connected) {
        try { port.postMessage({ _cc_reply: true, _reqId, response }); }
        catch (e) { /* port already disconnected */ }
      }
    }, portTrusted);
  });
});

function handleBridgeMessage(msg, sendResponse, trusted) {
  // SEC-003: defense-in-depth â€” auth/state-mutating messages require a trusted sender.
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !trusted) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return;
  }
  if (msg.type === 'CONNECT') {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) { sendResponse({ ok: false, error: 'missing token or backendUrl' }); return; }
    chrome.storage.local.set({ accessToken: token, refreshToken: refreshToken || null, user: user || null, backendUrl }, () => {
      ccEnsureWss('CONNECT');
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return;
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }
  if (msg.type === 'OPEN_AND_DISPATCH') {
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) { sendResponse({ ok: false, error: 'missing envelope or formUrl' }); return; }
    // Phase 0 (CYB-85): gated â€” async so port handler can reply after storage check.
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied('OPEN_AND_DISPATCH'));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!tab?.id) { sendResponse({ ok: false, error: 'failed to open tab' }); return; }
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return;
  }
  sendResponse({ ok: false, error: 'unknown type: ' + msg.type });
}

// â”€â”€ Frontend Bridge: zero-config auth handshake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Frontend sends { type: 'CONNECT', token, refreshToken, user, backendUrl }
// Extension stores credentials so it can act on behalf of the operator without popup config.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // SEC-003: auth/state-mutating external messages require a trusted origin.
  if (CC_TRUSTED_ONLY_TYPES[msg.type] && !ccIsTrustedFrontend(sender)) {
    sendResponse({ ok: false, error: 'untrusted sender' });
    return true;
  }
  if (msg.type === 'CONNECT') {
    const { token, refreshToken, user, backendUrl } = msg;
    if (!token || !backendUrl) { sendResponse({ ok: false, error: 'missing token or backendUrl' }); return; }
    chrome.storage.local.set({
      accessToken: token,
      refreshToken: refreshToken || null,
      user: user || null,
      backendUrl,
    }, () => {
      ccEnsureWss('CONNECT_EXTERNAL');
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    });
    return true;
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }
  if (msg.type === 'DISPATCH_JOB_DIRECT') {
    // Frontend sends dispatch envelope directly + tabId (the form tab to operate on)
    // Phase 0 (CYB-85): gated â€” not cafÃ© product path.
    const { envelope, tabId } = msg;
    if (!envelope || !tabId) { sendResponse({ ok: false, error: 'missing envelope or tabId' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        const denied = legacyClientFillDenied('DISPATCH_JOB_DIRECT');
        console.warn('[CC]', denied.error);
        sendResponse(denied);
        return;
      }
      sendResponse({ ok: true, accepted: true });
      runJobDispatch(envelope, tabId).catch(e => console.error('[CC] direct dispatch error:', e));
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return true;
  }
  if (msg.type === 'OPEN_AND_DISPATCH') {
    // Persist job to storage BEFORE opening tab so it survives SW termination.
    // content.js sends CONTENT_READY when the page is ready; background picks up
    // the pending job from storage and dispatches it then.
    // Phase 0 (CYB-85): gated.
    const { envelope, formUrl } = msg;
    if (!envelope || !formUrl) { sendResponse({ ok: false, error: 'missing envelope or formUrl' }); return true; }
    isLegacyClientFillAllowed().then((allowed) => {
      if (!allowed) {
        sendResponse(legacyClientFillDenied('OPEN_AND_DISPATCH'));
        return;
      }
      chrome.tabs.create({ url: formUrl, active: true }, (tab) => {
        if (!tab?.id) { sendResponse({ ok: false, error: 'failed to open tab' }); return; }
        // Persist â€” survives SW death between tab.create and page load
        chrome.storage.local.set({ _cc_pending_job: { envelope, tabId: tab.id, ts: Date.now() } });
        sendResponse({ ok: true, tabId: tab.id });
      });
    }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    return true;
  }
  if (msg.type === 'CONTENT_READY') {
    // content.js fires this when it's injected and ready to receive DISPATCH_JOB.
    // Pick up any pending job for this tab and dispatch it now.
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: true }); return true; }
    chrome.storage.local.get('_cc_pending_job', ({ _cc_pending_job: job }) => {
      if (!job || job.tabId !== tabId) { sendResponse({ ok: true }); return; }
      // Job is for this tab â€” clear it; only dispatch if legacy path allowed.
      chrome.storage.local.remove('_cc_pending_job');
      isLegacyClientFillAllowed().then((allowed) => {
        if (!allowed) {
          console.warn('[CC] CONTENT_READY: dropping pending job â€” legacy client fill disabled');
          sendResponse(legacyClientFillDenied('CONTENT_READY pending job'));
          return;
        }
        console.log('[CC] CONTENT_READY: dispatching pending job to tab', tabId);
        runJobDispatch(job.envelope, tabId).catch(e => console.error('[CC] pending dispatch error:', e));
        sendResponse({ ok: true, dispatching: true });
      }).catch((e) => sendResponse({ ok: false, error: e.message || 'legacy gate failed' }));
    });
    return true;
  }
    sendResponse({ ok: false, error: 'unknown message type' });
  return true;
});
