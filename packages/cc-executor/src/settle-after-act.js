/**
 * settle-after-act — Post-Action Settle Engine
 *
 * After a fill action (text input, select change, button click), waits for
 * the page to reach a quiet network state before proceeding. Manages an
 * ajax wait budget so long-running pages don't wait forever.
 *
 * Also provides waitForSelectOptionsSequential: waits for a dependent
 * cascade select to load options after a preceding field is filled.
 *
 * Both network-idle and option-polling are injected for testability.
 *
 * Public API (on globalThis.CcSettleAfterAct):
 *   createSettleEngine(opts) => { settleAfterAct, waitForSelectOptionsSequential }
 *
 * opts:
 *   waitForNetworkIdle(quietMs, maxMs) => Promise<{idle, waitedMs}>
 *   waitForOptions(selector, minCount, timeout) => Promise<Element|null>
 *   getBudget() => number        — read current ajaxWaitBudgetMs
 *   setBudget(n)                 — write current ajaxWaitBudgetMs
 *
 * See settle-after-act.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * @param {object} opts
   * @param {function} opts.waitForNetworkIdle
   * @param {function} opts.waitForOptions
   * @param {function} opts.getBudget
   * @param {function} opts.setBudget
   */
  function createSettleEngine(opts) {
    opts = opts || {};
    var waitForNetworkIdle = opts.waitForNetworkIdle || function (q, m) {
      return Promise.resolve({ idle: true, waitedMs: 0 });
    };
    var waitForOptions = opts.waitForOptions || function () {
      return Promise.resolve(null);
    };
    var getBudget = opts.getBudget || function () { return 0; };
    var setBudget = opts.setBudget || function () {};

    async function settleAfterAct(kind, actOpts) {
      actOpts = actOpts || {};
      var budget = typeof actOpts.budgetMs === 'number' ? actOpts.budgetMs : getBudget();

      // Text inputs: flat 100ms wait, no network polling needed
      if (kind === 'text') {
        await new Promise(function (r) { setTimeout(r, 100); });
        return { idle: true, waitedMs: 100, kind: 'text' };
      }

      // Let DWR/XHR kick off after change/click before network polling starts
      var kick = kind === 'button' ? 300 : 200;
      await new Promise(function (r) { setTimeout(r, kick); });

      var maxNet = kind === 'button' ? 5000 : kind === 'select' ? 4500 : 3500;
      maxNet = Math.min(maxNet, Math.max(300, budget > 0 ? budget : 400));

      var quiet = kind === 'select' ? 150 : 120;
      var t0 = Date.now();
      var net = await waitForNetworkIdle(quiet, maxNet);
      var used = Date.now() - t0;
      setBudget(Math.max(0, getBudget() - used));

      return Object.assign({ kind: kind }, net);
    }

    async function waitForSelectOptionsSequential(selector, maxMs) {
      maxMs = Math.min(maxMs || 6000, Math.max(400, getBudget() || 400));
      var t0 = Date.now();
      // First a general settle (covers radio→ajax-select pattern)
      await settleAfterAct('choice', { budgetMs: Math.min(2000, maxMs) });
      var left = Math.max(300, maxMs - (Date.now() - t0));
      var el = await waitForOptions(selector, 1, left);
      setBudget(Math.max(0, getBudget() - (Date.now() - t0)));
      return el;
    }

    return {
      settleAfterAct: settleAfterAct,
      waitForSelectOptionsSequential: waitForSelectOptionsSequential,
    };
  }

  root.CcSettleAfterAct = {
    createSettleEngine: createSettleEngine,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcSettleAfterAct;
