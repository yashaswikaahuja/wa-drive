/**
 * date pickers
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneDate = function (k) {
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

    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fod = root.CcFillOneDate || {};
    k.fillOneHandlers.push({
      id: 'date',
      try(el, selector, value, type, elType) {
        if (_fod.fillDate) return _fod.fillDate(el, selector, value);
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
