/**
 * Phase 0 — legacy client-fill gate (CYB-85).
 *
 * Café default: only side-panel Fill. DISPATCH_JOB / Agent / OPEN_AND_DISPATCH
 * remain in tree for Phase 6 removal but must not run unless explicitly opted
 * in via chrome.storage.local:
 *   { allowLegacyClientFill: true }
 *
 * This module is pure (no chrome.*). Service worker and popup duplicate a thin
 * async wrapper that reads storage; unit tests import these helpers.
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
   * @param {object|null|undefined} storageSlice - result of storage.local.get
   * @returns {boolean} true only when flag is strictly true
   */
  function isLegacyClientFillAllowed(storageSlice) {
    if (!storageSlice || typeof storageSlice !== 'object') return false;
    return storageSlice[STORAGE_KEY] === true || storageSlice.allowLegacyClientFill === true;
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
        ' is disabled (Phase 0). Use side-panel Fill (server plan). ' +
        'Owner emergency only: chrome.storage.local.set({ allowLegacyClientFill: true })',
    };
  }

  return {
    STORAGE_KEY,
    isLegacyClientFillAllowed,
    legacyClientFillDenied,
  };
});
