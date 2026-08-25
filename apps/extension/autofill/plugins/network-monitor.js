/**
 * network-monitor.js — runs in PAGE world (chrome.scripting world: 'MAIN')
 *
 * Wraps fetch + XMLHttpRequest to track in-flight requests. Publishes counts
 * to document.body.dataset so the autofill executor (in ISOLATED world) can
 * poll them and proceed exactly when the network is actually idle.
 *
 * Avoids hardcoded setTimeout(500/3500/12000ms) magic numbers — the fill
 * advances the moment Angular/jQuery/DWR finishes its AJAX, no sooner.
 */
;(function () {
  if (window._ccNetMonInstalled) return;
  window._ccNetMonInstalled = true;

  let active = 0;
  let lastActivity = Date.now();
  let totalRequests = 0;

  function publish() {
    try {
      document.body.dataset.ccAjaxActive = String(active);
      document.body.dataset.ccAjaxLastActivity = String(lastActivity);
      document.body.dataset.ccAjaxTotal = String(totalRequests);
    } catch {}
  }

  function inc() {
    active++; totalRequests++; lastActivity = Date.now(); publish();
  }
  function dec() {
    active = Math.max(0, active - 1); lastActivity = Date.now(); publish();
  }

  // ── fetch wrap ───────────────────────────────────────────────────────────
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      inc();
      const p = origFetch.apply(this, args);
      // Don't await here — settle on resolve/reject to keep counter accurate
      Promise.resolve(p).finally(dec);
      return p;
    };
  }

  // ── XMLHttpRequest wrap ──────────────────────────────────────────────────
  if (typeof window.XMLHttpRequest === 'function') {
    const origOpen = window.XMLHttpRequest.prototype.open;
    const origSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      // Don't count cross-origin to extension's own backend (api.cybercontrol.fun)
      // — those aren't part of the form's AJAX
      this._ccTrack = !(url && /api\.cybercontrol\.fun/.test(String(url)));
      return origOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function () {
      if (this._ccTrack) {
        inc();
        const cleanup = () => dec();
        this.addEventListener('loadend', cleanup, { once: true });
        // safety: error/abort also fire loadend, but in case browser misses it
        this.addEventListener('error',  cleanup, { once: true });
        this.addEventListener('abort',  cleanup, { once: true });
      }
      return origSend.apply(this, arguments);
    };
  }

  // ── jQuery .ajax (ServicePlus / RTPS / many gov.in sites) ────────────────
  // jQuery's $.ajax internally uses XHR which is already wrapped, but it also
  // emits ajaxStart/ajaxStop on the document — useful as a fallback signal.
  if (typeof window.jQuery !== 'undefined') {
    try {
      window.jQuery(document)
        .ajaxSend(() => { lastActivity = Date.now(); publish(); })
        .ajaxComplete(() => { lastActivity = Date.now(); publish(); });
    } catch {}
  }

  publish();
  // Heartbeat: even if no requests fire, keep lastActivity timestamp current
  // for waitForNetworkIdle's "no recent activity" condition to be meaningful.
})();
