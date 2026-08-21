/**
 * ng-dropdown shared helpers (score/pick/visible)
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNgHelpers = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    // CcNgOptionScorer and CcNgSessionManager are guaranteed loaded before
    // this installer runs (see build-executor-bundle.mjs ORDER).
    var _nos = root.CcNgOptionScorer;
    var _nsm = root.CcNgSessionManager;

    k._ngIsVisible = function (node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    };

    k._ngScoreOption = function (optText, planned) {
      return _nos.scoreOption(optText, planned);
    };

    k._ngCancelSession = function (_label) {
      _nsm.cancelSession(_label, window._ccReplaySessions || null);
    };

    k._ngPickOption = function (opts, planned) {
      var wrapped = Array.from(opts).map(function (n) {
        return { text: (n.textContent || n.innerText || '').trim(), node: n };
      });
      var result = _nos.scoreAndPick(wrapped, planned, 30);
      return result ? result.node : null;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
