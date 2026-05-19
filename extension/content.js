;(function() {
  if (window._ccCSBridgeInit) return;
  window._ccCSBridgeInit = true;

  // Listen for messages from page (frontend sends {_cc: true, type, ...})
  window.addEventListener('message', (e) => {
    if (!e.data?._cc) return;
    if (e.data._cc_from_cs) return; // ignore our own replies
    const { _cc, _cc_to_cs, _reqId, ...msg } = e.data;
    const reqId = _reqId || e.data._reqId;

    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId: reqId, response: null, err: chrome.runtime.lastError.message }, '*');
        return;
      }
      window.postMessage({ _cc_from_cs: true, _cc_reply: true, _reqId: reqId, response }, '*');
    });
  });
})();
