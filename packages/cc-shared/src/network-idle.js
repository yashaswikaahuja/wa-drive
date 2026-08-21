// ── shared/network-idle.js ─────────────────────────────────────────────────
// Single source of truth for waiting on network idle state.
// Reads counters published by network-monitor.js (which runs in MAIN world).
// Exposes: window.ccWaitForNetworkIdle(quietMs, maxMs)
//
// Used by: executor.js, drivers/interaction.js (wait.networkIdle),
//          drivers/select.js (select.cascade), cascade-select.js plugin
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Wait until the page network has been idle for `quietMs` consecutive ms.
   * Falls back to a fixed delay if the network monitor is not installed.
   *
   * @param {number} [quietMs=200]  - Required quiet duration after last activity
   * @param {number} [maxMs=8000]   - Maximum total wait before giving up
   * @returns {Promise<{idle: boolean, waitedMs: number, monitorMissing?: boolean}>}
   */
  function ccWaitForNetworkIdle(quietMs, maxMs) {
    quietMs = (typeof quietMs === 'number' && quietMs > 0) ? quietMs : 200;
    maxMs = (typeof maxMs === 'number' && maxMs > 0) ? maxMs : 8000;

    return new Promise(function (resolve) {
      var start = Date.now();
      var deadline = start + maxMs;

      function tick() {
        var ds = document.body.dataset || {};
        var active = parseInt(ds.ccAjaxActive || 'NaN', 10);
        var lastActivity = parseInt(ds.ccAjaxLastActivity || '0', 10);

        // Monitor not installed — fall back to fixed quiet wait
        if (Number.isNaN(active)) {
          setTimeout(function () {
            resolve({ idle: true, waitedMs: Date.now() - start, monitorMissing: true });
          }, quietMs);
          return;
        }

        // Timeout reached
        if (Date.now() >= deadline) {
          resolve({ idle: false, waitedMs: Date.now() - start, reason: 'max-elapsed' });
          return;
        }

        // Network is idle and has been quiet long enough
        if (active === 0 && lastActivity && (Date.now() - lastActivity) >= quietMs) {
          resolve({ idle: true, waitedMs: Date.now() - start });
          return;
        }

        // Keep polling
        setTimeout(tick, 50);
      }

      tick();
    });
  }

  // Expose globally
  window.ccWaitForNetworkIdle = ccWaitForNetworkIdle;
})();
