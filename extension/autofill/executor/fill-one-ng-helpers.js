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

    k._ngIsVisible = function (node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    };

    /** Score option text against planned value (higher = better). */
  // ng-option-scorer.js is the single source for option text scoring.
  // Must be loaded before fill-one-ng-helpers.js (see build-executor-bundle.mjs ORDER).
  var _nos = root.CcNgOptionScorer || {};
    k._ngScoreOption = _nos.scoreOption || function (optText, planned) {
      // fallback: basic contains check
      var ot = String(optText || '').toLowerCase().trim();
      var v  = String(planned  || '').toLowerCase().trim();
      if (!ot || !v) return 0;
      if (ot === v) return 100;
      if (ot.includes(v) || v.includes(ot)) return 60;
      return 0;
    };

    k._ngCancelSession = function (_label) {
      if (!window._ccReplaySessions || !window._ccReplaySessions.has(_label)) return;
      const old = window._ccReplaySessions.get(_label);
      old.cancelled = true;
      clearInterval(old.pollTimer);
      old.timeoutIds.forEach((id) => clearTimeout(id));
      if (old.observer) old.observer.disconnect();
      window._ccReplaySessions.delete(_label);
    };

    k._ngPickOption = function (opts, planned) {
      // Wrap DOM nodes in {text, node} shape for scoreAndPick.
      // minScore:30 preserves the original threshold.
      if (_nos.scoreAndPick) {
        var wrapped = Array.from(opts).map(function (n) {
          return { text: (n.textContent || n.innerText || '').trim(), node: n };
        });
        var result = _nos.scoreAndPick(wrapped, planned, 30);
        return result ? result.node : null;
      }
      // Fallback
      var best = null, bestScore = 0;
      for (var i = 0; i < opts.length; i++) {
        var text = (opts[i].textContent || opts[i].innerText || '').trim();
        var sc = k._ngScoreOption(text, planned);
        if (sc > bestScore) { bestScore = sc; best = opts[i]; }
      }
      return bestScore >= 30 ? best : null;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
