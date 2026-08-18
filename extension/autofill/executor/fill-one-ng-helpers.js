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
    k._ngScoreOption = function (optText, planned) {
      const ot = String(optText || '').trim().toLowerCase();
      const v = String(planned || '').trim().toLowerCase();
      if (!ot || !v) return 0;
      if (ot === v) return 100;
      if (ot.startsWith(v) || v.startsWith(ot)) return 80;
      if (ot.includes(v) || v.includes(ot)) return 60;
      const otTok = ot.split(/[^a-z0-9]+/).filter(Boolean);
      const vTok = v.split(/[^a-z0-9]+/).filter(Boolean);
      let hit = 0;
      for (let i = 0; i < vTok.length; i++) if (otTok.includes(vTok[i])) hit++;
      if (hit && hit === vTok.length) return 50;
      if (hit) return 30 + hit;
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
      let best = null;
      let bestScore = 0;
      for (let i = 0; i < opts.length; i++) {
        const text = (opts[i].textContent || opts[i].innerText || '').trim();
        const sc = k._ngScoreOption(text, planned);
        if (sc > bestScore) {
          bestScore = sc;
          best = opts[i];
        }
      }
      return bestScore >= 30 ? best : null;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
