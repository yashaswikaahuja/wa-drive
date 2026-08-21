/**
 * STRATEGY_REGISTRY + detectStrategy + verifyValue
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installStrategy = function (k) {
    const getEl = function () { return k.getEl.apply(k, arguments); };
  // ── detect-fill-strategy.js is the single source for strategy registry ────
  // Must be loaded before strategy.js (see build-executor-bundle.mjs ORDER).
  var _dfs = root.CcDetectFillStrategy || {};
  var STRATEGY_REGISTRY = _dfs.STRATEGY_REGISTRY || {};

  // Detect which strategy applies to a field (for ReplayRecord tagging)
  function detectStrategy(el, type) {
    if (_dfs.detectFillStrategy) return _dfs.detectFillStrategy(el, type);
    return type || 'unknown'; // safe fallback
  }

  // verify-fill-value.js is the single source for fill value verification.
  // Must be loaded before strategy.js (see build-executor-bundle.mjs ORDER).
  var _vfv = root.CcVerifyFillValue || {};
  var _resolveEl = root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector : function(sel) { return document.querySelector(sel); };
  async function verifyValue(selector, expected, settleMs) {
    if (_vfv.verifyFillValue) return _vfv.verifyFillValue(selector, expected, _resolveEl, settleMs);
    // Safe fallback: unknown result
    return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'verifier-not-loaded' };
  }

    k.STRATEGY_REGISTRY = STRATEGY_REGISTRY;
    k.detectStrategy = detectStrategy;
    k.verifyValue = verifyValue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
