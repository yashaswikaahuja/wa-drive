/**
 * correction observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillCorrections = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, allFields, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

// CcPostFillCorrections is the single source for correction observer logic.
  var _pfc = root.CcPostFillCorrections || {};
  if (_pfc.installCorrectionsObserver) {
    _pfc.installCorrectionsObserver({
      entries: Array.from(entries),
      filledBySource: filledBySource,
      allFields: allFields,
      getEl: getEl,
      records: k.records || [],
      RUNTIME_VERSION: RUNTIME_VERSION,
    });

    return;
  }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
