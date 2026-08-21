/**
 * settleAfterAct + WaitEngine
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function (k) {

    // CcSettleAfterAct and CcWaitForOptions are guaranteed to be loaded
    // before this installer runs (see build-executor-bundle.mjs ORDER).
    var _saa = root.CcSettleAfterAct;
    var _wfo = root.CcWaitForOptions;

    function waitForNetworkIdle(quietMs, maxMs) {
      if (typeof window !== 'undefined' && typeof window.ccWaitForNetworkIdle === 'function') {
        return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8000);
      }
      return new Promise(function (r) {
        setTimeout(r, quietMs || 200, { idle: true, waitedMs: quietMs || 200 });
      });
    }

    function waitForOptions(selector, minCount, timeout) {
      return _wfo.waitForOptions(selector, minCount, timeout,
        document.querySelector.bind(document), document.body);
    }

    var _settleEngine = _saa.createSettleEngine({
      waitForNetworkIdle: waitForNetworkIdle,
      waitForOptions: waitForOptions,
      getBudget: function () { return k.ajaxWaitBudgetMs; },
      setBudget: function (n) { k.ajaxWaitBudgetMs = n; },
    });

    function waitForDOMQuiet(ms) {
      ms = ms || 300;
      return new Promise(function (resolve) {
        var last = Date.now();
        var mo = new MutationObserver(function () { last = Date.now(); });
        mo.observe(document.body, { childList: true, subtree: true });
        var check = setInterval(function () {
          if (Date.now() - last >= ms) { clearInterval(check); mo.disconnect(); resolve(); }
        }, 50);
        setTimeout(function () { clearInterval(check); mo.disconnect(); resolve(); }, 5000);
      });
    }

    k.settleAfterAct = function (kind, opts) { return _settleEngine.settleAfterAct(kind, opts); };
    k.waitForSelectOptionsSequential = function (sel, maxMs) { return _settleEngine.waitForSelectOptionsSequential(sel, maxMs); };
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
