;(function() {
  if (window._ccCSBridgeInit) return;
  window._ccCSBridgeInit = true;

  // Listen for messages from MAIN world (frontend page)
  window.addEventListener('message', (e) => {
    if (!e.data?._cc_to_cs) return;
    const { _cc_to_cs, _cc, _reqId, ...msg } = e.data;

    // Use sendMessage instead of port — wakes service worker reliably
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId, response: null, err: chrome.runtime.lastError.message }, '*');
        return;
      }
      window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId, response }, '*');
    });
  });

  // Also listen for messages FROM background (push events)
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg._cc_push) {
      window.postMessage({ _cc_from_cs: true, ...msg }, '*');
    }
    sendResponse({ ok: true });
  });
})();
