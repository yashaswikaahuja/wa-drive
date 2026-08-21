/**
 * wait-for-options — Select Options DOM Poller
 *
 * Waits for a <select> element to have at least minCount real (non-placeholder)
 * options by combining a MutationObserver on document.body with a 200ms poll
 * interval. Resolves with the element on success, null on timeout.
 *
 * "Real" options: value is non-empty, not '0', not '-1'.
 *
 * The querySelector function is injected so this capability is testable
 * without a real browser document.
 *
 * Public API (on globalThis.CcWaitForOptions):
 *   waitForOptions(selector, minCount, timeout, querySelector?, observeTarget?) => Promise<Element|null>
 *
 * querySelector  — defaults to document.querySelector
 * observeTarget  — defaults to document.body (the node to observe for mutations)
 *
 * See wait-for-options.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Wait for a <select> to have real options.
   *
   * @param {string}   selector       — CSS selector for the <select>
   * @param {number}   [minCount=1]   — minimum number of real options required
   * @param {number}   [timeout=8000] — max wait in ms
   * @param {function} [qs]           — querySelector function (injected for tests)
   * @param {Element}  [observeTarget] — MutationObserver target (injected for tests)
   * @returns {Promise<Element|null>}
   */
  function waitForOptions(selector, minCount, timeout, qs, observeTarget) {
    minCount = minCount || 1;
    timeout  = timeout  || 8000;
    qs = qs || (typeof document !== 'undefined' ? document.querySelector.bind(document) : function () { return null; });
    observeTarget = observeTarget || (typeof document !== 'undefined' ? document.body : null);

    return new Promise(function (resolve) {
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

      function isRealOption(o) {
        return o.value && o.value !== '0' && o.value !== '' && o.value !== '-1';
      }

      function check() {
        if (resolved) return;
        var el = qs(selector);
        var real = Array.from(el ? el.options || [] : []).filter(isRealOption);
        if (real.length >= minCount) { cleanup(el); return; }
        if (Date.now() > deadline) { cleanup(null); return; }
      }

      if (observeTarget) {
        mo = new MutationObserver(check);
        mo.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'class'],
        });
      }

      check();

      poll = setInterval(function () {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
  }

  root.CcWaitForOptions = {
    waitForOptions: waitForOptions,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcWaitForOptions;
