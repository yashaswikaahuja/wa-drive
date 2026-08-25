/**
 * Phase 4.8 — DOM Stabilization Before Re-Perception
 *
 * After a dynamic action (or safety demotion), waits until the relevant DOM
 * has mechanically quieted before the next perception snapshot.
 *
 * Extension answers only: "Has the relevant DOM mechanically quieted?"
 * Server answers only: "What is the next authorized action?"
 *
 * Policy: MutationObserver on document.body with debounce quiet period.
 * Hard timeout prevents infinite wait. Irrelevant mutations (ads, timers)
 * filtered by relevance heuristic.
 *
 * Architecture: Extension = Eyes + Hands. This is purely mechanical observation.
 */
(function () {
'use strict';

/** Default quiet period: no relevant mutations for this many ms → settled. */
const DEFAULT_QUIET_MS = 300;

/** Hard timeout: never wait longer than this. Reports settle_timeout. */
const DEFAULT_TIMEOUT_MS = 5000;

/** Mutation types that are NOT relevant (ads, analytics, devtools). */
const IRRELEVANT_SELECTORS = [
  '[data-ad]', '[data-google-query-id]', '.adsbygoogle',
  'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
  'script', 'link[rel="prefetch"]', 'link[rel="preload"]',
  '[data-reactroot] > noscript', '.grecaptcha-badge',
];

/**
 * Check if a mutation target is irrelevant (ads, analytics, etc.)
 * @param {Node} node
 * @returns {boolean}
 */
function isIrrelevantNode(node) {
  if (!node || node.nodeType !== 1) return false;
  for (const sel of IRRELEVANT_SELECTORS) {
    try { if (node.matches?.(sel) || node.closest?.(sel)) return true; } catch {}
  }
  return false;
}

/**
 * Check if a mutation is relevant to form DOM (not ads/timers).
 * @param {MutationRecord} mutation
 * @returns {boolean}
 */
function isRelevantMutation(mutation) {
  // Ignore characterData on text nodes inside irrelevant containers
  if (mutation.type === 'characterData') {
    if (isIrrelevantNode(mutation.target?.parentElement)) return false;
    return true;
  }
  // For childList and attributes, check target
  if (isIrrelevantNode(mutation.target)) return false;
  // Check added/removed nodes
  if (mutation.addedNodes) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1 && !isIrrelevantNode(node)) return true;
    }
  }
  if (mutation.removedNodes) {
    for (const node of mutation.removedNodes) {
      if (node.nodeType === 1 && !isIrrelevantNode(node)) return true;
    }
  }
  // Attribute change on relevant element
  if (mutation.type === 'attributes' && !isIrrelevantNode(mutation.target)) return true;
  return false;
}

/**
 * Wait for DOM to stabilize (mechanically quiet).
 *
 * @param {object} [options]
 * @param {number} [options.quietMs=300] - Required quiet period (no relevant mutations)
 * @param {number} [options.timeoutMs=5000] - Hard timeout (never exceeds this)
 * @param {Element} [options.subtree=document.body] - Subtree to observe
 * @returns {Promise<{ settled: boolean, reason: string, elapsed_ms: number, mutation_count: number }>}
 */
function waitForSettle(options = {}) {
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const subtree = options.subtree || document.body;

  return new Promise((resolve) => {
    const startTime = performance.now();
    let mutationCount = 0;
    let quietTimer = null;
    let hardTimer = null;
    let observer = null;

    function cleanup() {
      if (observer) { observer.disconnect(); observer = null; }
      if (quietTimer) { clearTimeout(quietTimer); quietTimer = null; }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
    }

    function done(settled, reason) {
      cleanup();
      const elapsed = Math.round(performance.now() - startTime);
      resolve({ settled, reason, elapsed_ms: elapsed, mutation_count: mutationCount });
    }

    // Start quiet timer immediately — if no mutations happen, settle fast
    quietTimer = setTimeout(() => done(true, 'quiet_period'), quietMs);

    // Hard timeout — never hang forever
    hardTimer = setTimeout(() => done(false, 'settle_timeout'), timeoutMs);

    // Observe mutations
    try {
      observer = new MutationObserver((mutations) => {
        const relevant = mutations.filter(isRelevantMutation);
        if (relevant.length === 0) return; // Ignore irrelevant mutations

        mutationCount += relevant.length;

        // Reset quiet timer on each relevant mutation
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(() => done(true, 'quiet_period'), quietMs);
      });

      observer.observe(subtree, {
        childList: true,
        attributes: true,
        subtree: true,
        characterData: true,
      });
    } catch (e) {
      // If MutationObserver fails, just wait the quiet period
      cleanup();
      setTimeout(() => done(true, 'observer_fallback'), quietMs);
    }
  });
}

// ── Optional: Loading indicator detection ───────────────────────────────

/**
 * Check if common loading indicators are visible.
 * Purely mechanical — does not decide what to do with the information.
 *
 * @returns {boolean} true if a loading indicator is detected
 */
function hasLoadingIndicator() {
  const selectors = [
    '.loading', '.spinner', '[aria-busy="true"]',
    '.sk-spinner', '.loader', '[data-loading="true"]',
    '.mat-progress-spinner', '.mat-progress-bar',
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true; // visible
    } catch {}
  }
  return false;
}

/**
 * Wait for settle + optional loading indicator clear.
 * If a loading indicator is detected after DOM settles, waits additional
 * quiet period for it to disappear (up to hard timeout).
 *
 * @param {object} [options] - Same as waitForSettle options
 * @returns {Promise<{ settled: boolean, reason: string, elapsed_ms: number, mutation_count: number, had_loading_indicator: boolean }>}
 */
async function waitForSettleWithLoading(options = {}) {
  const result = await waitForSettle(options);
  const hadLoading = hasLoadingIndicator();

  if (result.settled && hadLoading) {
    // Wait a bit more for loading to clear
    const extraWait = Math.min(2000, (options.timeoutMs || DEFAULT_TIMEOUT_MS) - result.elapsed_ms);
    if (extraWait > 100) {
      await new Promise(r => setTimeout(r, Math.min(extraWait, 1000)));
    }
  }

  return { ...result, had_loading_indicator: hadLoading };
}

// Export as global singleton
const api = {
  waitForSettle,
  waitForSettleWithLoading,
  hasLoadingIndicator,
  isRelevantMutation,
  DEFAULT_QUIET_MS,
  DEFAULT_TIMEOUT_MS,
};

if (typeof globalThis !== 'undefined') globalThis.CcDomSettle = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
