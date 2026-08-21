/**
 * correction observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillCorrections = function (k) {


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
