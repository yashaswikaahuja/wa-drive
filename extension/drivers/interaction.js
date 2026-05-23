/**
 * Click + wait drivers — interaction primitives.
 *
 * Drivers:
 *   - click             → click an element (button, link, anything)
 *   - wait.element      → wait for an element to appear / become visible
 *   - wait.networkIdle  → wait for in-flight fetch + XHR to drain
 *   - wait.ms           → fixed delay (use sparingly — prefer state-based waits)
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  // ── click ────────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'click',
    description: 'Click an element. Scrolls into view, fires a real click. Returns { clicked, navigated } where navigated indicates whether the page URL changed within 2s.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default left)' },
        scrollIntoView: { type: 'boolean' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = document.querySelector(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (args.scrollIntoView !== false) {
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      const urlBefore = location.href;
      try { el.click(); } catch (e) { throw new Error('click-failed: ' + e.message); }
      await new Promise(r => setTimeout(r, 200));
      const urlAfter = location.href;
      // Brief poll for navigation
      let navigated = urlAfter !== urlBefore;
      if (!navigated) {
        const settle = Date.now() + 2000;
        while (Date.now() < settle && location.href === urlBefore) {
          await new Promise(r => setTimeout(r, 100));
        }
        navigated = location.href !== urlBefore;
      }
      return { clicked: true, navigated, urlBefore, urlAfter: location.href };
    },
  });

  // ── wait.element ─────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.element',
    description: 'Wait for an element matching selector to appear and (optionally) become visible. Resolves with element summary or times out.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        visible: { type: 'boolean', description: 'Require visibility (default true)' },
        timeoutMs: { type: 'integer', description: 'Default 8000' },
      },
      required: ['selector'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const requireVisible = args.visible !== false;
      const timeout = args.timeoutMs || 8000;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const el = document.querySelector(args.selector);
        if (el && (!requireVisible || isVisible(el))) {
          const r = el.getBoundingClientRect();
          return { found: true, waitedMs: Date.now() - (deadline - timeout), bounds: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
        }
        await new Promise(r => setTimeout(r, 100));
      }
      return { found: false, waitedMs: timeout };
    },
  });

  // ── wait.networkIdle ─────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.networkIdle',
    description: 'Wait until in-flight fetch + XHR count reaches 0 and stays quiet for `quietMs`. Reads counters published by network-monitor.js (which must run in MAIN world). Falls back to fixed delay if monitor not installed.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        quietMs: { type: 'integer', description: 'Required quiet duration (default 200)' },
        maxMs: { type: 'integer', description: 'Max total wait (default 5000)' },
      },
    },
    output: { type: 'object' },
    handler: async function (args) {
      const quietMs = args.quietMs || 200;
      const maxMs = args.maxMs || 5000;
      const t0 = Date.now();
      const deadline = t0 + maxMs;

      // Detect monitor presence
      const lastActivityRaw = document.body.dataset.ccAjaxLastActivity;
      if (!lastActivityRaw) {
        // Monitor not installed — fall back to plain delay
        await new Promise(r => setTimeout(r, quietMs));
        return { idle: true, waitedMs: Date.now() - t0, monitorMissing: true };
      }

      while (Date.now() < deadline) {
        const active = parseInt(document.body.dataset.ccAjaxActive || '0', 10);
        const lastActivity = parseInt(document.body.dataset.ccAjaxLastActivity || '0', 10);
        if (active === 0 && (Date.now() - lastActivity) >= quietMs) {
          return { idle: true, waitedMs: Date.now() - t0, active };
        }
        await new Promise(r => setTimeout(r, 50));
      }
      return { idle: false, waitedMs: maxMs, reason: 'max-elapsed' };
    },
  });

  // ── wait.ms ──────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'wait.ms',
    description: 'Fixed delay. Use SPARINGLY — prefer wait.element or wait.networkIdle.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        ms: { type: 'integer' },
      },
      required: ['ms'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const ms = Math.min(Math.max(0, args.ms || 0), 30000);
      await new Promise(r => setTimeout(r, ms));
      return { waitedMs: ms };
    },
  });
})();
