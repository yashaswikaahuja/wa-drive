/**
 * settleAfterAct + WaitEngine
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function (k) {
  // settle-after-act.js is the single source for post-action settle logic.
  var _saa = root.CcSettleAfterAct;
  var _settleEngine = _saa ? _saa.createSettleEngine({
    waitForNetworkIdle: waitForNetworkIdle,
    waitForOptions: waitForOptions,
    getBudget: function() { return k.ajaxWaitBudgetMs; },
    setBudget: function(n) { k.ajaxWaitBudgetMs = n; },
  }) : null;

  async function settleAfterAct(kind, opts) {
    if (_settleEngine) return _settleEngine.settleAfterAct(kind, opts);
    return Promise.resolve({ idle: true, waitedMs: 0, kind: kind });
  }

  async function waitForSelectOptionsSequential(selector, maxMs) {
    if (_settleEngine) return _settleEngine.waitForSelectOptionsSequential(selector, maxMs);
    return Promise.resolve(null);
  }

  // wait-for-options.js is the single source for select option polling.
  var _wfo = root.CcWaitForOptions || {};
  function waitForOptions(selector, minCount, timeout) {
    if (_wfo.waitForOptions) {
      return _wfo.waitForOptions(selector, minCount, timeout,
        document.querySelector.bind(document), document.body);
    }
    return Promise.resolve(null);
  }

  function waitForDOMQuiet(ms) {
    ms = ms || 300;
    return new Promise(function(resolve) {
      var last = Date.now();
      var mo = new MutationObserver(function() { last = Date.now(); });
      mo.observe(document.body, { childList: true, subtree: true });
      var check = setInterval(function() {
        if (Date.now() - last >= ms) { clearInterval(check); mo.disconnect(); resolve(); }
      }, 50);
      setTimeout(function() { clearInterval(check); mo.disconnect(); resolve(); }, 5000);
    });
  }

  /**
   * Resolve when the page network has been idle for `quietMs` consecutive
   * milliseconds. Delegates to shared/network-idle.js.
   */
  function waitForNetworkIdle(quietMs, maxMs) {
    return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8000);
  }
    k.settleAfterAct = settleAfterAct;
    k.waitForSelectOptionsSequential = waitForSelectOptionsSequential;
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
