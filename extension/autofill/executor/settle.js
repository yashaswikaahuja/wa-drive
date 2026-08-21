/**
 * settleAfterAct + WaitEngine
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function (k) {
  async function settleAfterAct(kind, opts) {
    opts = opts || {};
    const budget = typeof opts.budgetMs === 'number' ? opts.budgetMs : k.ajaxWaitBudgetMs;
    if (kind === 'text') {
      await new Promise((r) => setTimeout(r, 100));
      return { idle: true, waitedMs: 100, kind: 'text' };
    }
    // Let DWR/XHR kick off after change/click
    const kick = kind === 'button' ? 300 : 200;
    await new Promise((r) => setTimeout(r, kick));
    let maxNet = kind === 'button' ? 5000 : kind === 'select' ? 4500 : 3500;
    maxNet = Math.min(maxNet, Math.max(300, budget > 0 ? budget : 400));
    const quiet = kind === 'select' ? 150 : 120;
    const t0 = Date.now();
    const net = await waitForNetworkIdle(quiet, maxNet);
    const used = Date.now() - t0;
    k.ajaxWaitBudgetMs = Math.max(0, k.ajaxWaitBudgetMs - used);
    return Object.assign({ kind: kind }, net);
  }

  /** Before acting on a select with no options yet: wait (previous field may have been radio). */
  async function waitForSelectOptionsSequential(selector, maxMs) {
    maxMs = Math.min(maxMs || 6000, Math.max(400, k.ajaxWaitBudgetMs || 400));
    const t0 = Date.now();
    // First a general settle (covers radio→ajax-select)
    await settleAfterAct('choice', { budgetMs: Math.min(2000, maxMs) });
    const left = Math.max(300, maxMs - (Date.now() - t0));
    const el = await waitForOptions(selector, 1, left);
    k.ajaxWaitBudgetMs = Math.max(0, k.ajaxWaitBudgetMs - (Date.now() - t0));
    return el;
  }

  // wait-for-options.js is the single source for select option polling.
  var _wfo = root.CcWaitForOptions || {};
  function waitForOptions(selector, minCount, timeout) {
    if (_wfo.waitForOptions) {
      return _wfo.waitForOptions(selector, minCount, timeout,
        document.querySelector.bind(document), document.body);
    }
    // Fallback
    minCount = minCount || 1; timeout = timeout || 8000;
    return new Promise(function(resolve) {
      var deadline = Date.now() + timeout;
      var resolved = false;
      var poll, mo;
      function cleanup(val) {
        if (resolved) return;
        resolved = true;
        if (poll) clearInterval(poll);
        if (mo) mo.disconnect();
        resolve(val);
      }
      function check() {
        if (resolved) return;
        var el = document.querySelector(selector);
        var real = Array.from(el ? el.options || [] : []).filter(function(o) {
          return o.value && o.value !== '0' && o.value !== '' && o.value !== '-1';
        });
        if (real.length >= minCount) { cleanup(el); return; }
        if (Date.now() > deadline) { cleanup(null); return; }
      }
      mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
      check();
      poll = setInterval(function() {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
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
