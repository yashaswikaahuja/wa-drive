;(function () {
  if (window._ccCSBridgeInit) return;
  window._ccCSBridgeInit = true;

  function runtimeAlive() {
    try {
      // After extension reload/update, old content scripts stay on the page but
      // chrome.runtime is a dead "invalidated" context — any API throws.
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch {
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
        } catch {
          err = 'Extension context invalidated.';
        }
        if (typeof cb === 'function') cb(response, err);
      });
    } catch (e) {
      var m = (e && e.message) || String(e);
      if (typeof cb === 'function') cb(null, m);
    }
  }

  // Listen for messages from page (frontend sends {_cc: true, type, ...})
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data._cc) return;
    if (e.data._cc_from_cs) return; // ignore our own replies
    const { _cc, _cc_to_cs, _reqId, ...msg } = e.data;
    const reqId = _reqId || e.data._reqId;

    safeSend(msg, (response, err) => {
      if (err) {
        window.postMessage(
          {
            _cc_from_cs: true,
            _cc_reply: true,
            _reqId: reqId,
            response: null,
            err: err,
          },
          '*'
        );
        return;
      }
      window.postMessage(
        { _cc_from_cs: true, _cc_reply: true, _reqId: reqId, response: response },
        '*'
      );
    });
  });
})();
