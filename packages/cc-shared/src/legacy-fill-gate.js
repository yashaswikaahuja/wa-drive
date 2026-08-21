/**
 * Phase 4.1 — legacy client-fill gate (permanently closed).
 *
 * All legacy client-side brain/planning paths are disabled. The server-driven
 * CcFillOrchestrator is the only fill execution path. This gate always returns
 * false regardless of storage state.
 *
 * This module is pure (no chrome.*). Unit tests import these helpers.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CcLegacyFillGate = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Storage key (chrome.storage.local). */
  const STORAGE_KEY = 'allowLegacyClientFill';

  /**
   * Phase 4.1: Legacy client-side brain paths are permanently disabled.
   * The server-driven product Fill (CcFillOrchestrator) is the only execution path.
   * This gate always returns false regardless of storage state.
   *
   * @param {object|null|undefined} _storageSlice - ignored (kept for API compat)
   * @returns {boolean} always false
   */
  function isLegacyClientFillAllowed(_storageSlice) {
    return false;
  }

  /**
   * @param {string} pathName - e.g. DISPATCH_JOB, agent, OPEN_AND_DISPATCH
   * @returns {{ ok: false, error: string, code: string }}
   */
  function legacyClientFillDenied(pathName) {
    const name = pathName || 'legacy client fill';
    return {
      ok: false,
      code: 'legacy_client_fill_disabled',
      error:
        name +
        ' is permanently disabled (Phase 4.1). Use side-panel Fill (server plan).',
    };
  }

  return {
    STORAGE_KEY,
    isLegacyClientFillAllowed,
    legacyClientFillDenied,
  };
});
