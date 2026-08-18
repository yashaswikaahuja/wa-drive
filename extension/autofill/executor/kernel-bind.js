/**
 * Shared kernel locals for executor task modules.
 * Avoids repeating 35-line alias blocks in every file (keeps parts ≤200 lines).
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};

  /**
   * @param {object} k — fill kernel
   * @returns {object} local aliases matching the old closure names
   */
  root.CcExecParts.bindKernelLocals = function bindKernelLocals(k) {
    return {
      portalAdapters: k.portalAdapters,
      filledBySource: k.filledBySource,
      mapping: k.mapping,
      allFields: k.allFields,
      _replayResults: k.replayResults,
      _ccRecords: k.records,
      RUNTIME_VERSION: k.RUNTIME_VERSION,
      STRATEGY_VERSION: k.STRATEGY_VERSION,
      WAIT_ENGINE_VERSION: k.WAIT_ENGINE_VERSION,
      _CC_USE_PLUGINS: k.CC_USE_PLUGINS,
      _CC_LEGACY_COMPARE: k.CC_LEGACY_COMPARE,
      PRIORITY_KEYS: k.PRIORITY_KEYS,
      entries: k.entries,
      getEl: function () { return k.getEl.apply(k, arguments); },
      _emitFillDebug: function () { return k.emitFillDebug.apply(k, arguments); },
      _flushRecords: function () { return k.flushRecords(); },
      _pushSelectRecord: function () { return k.pushSelectRecord.apply(k, arguments); },
      settleAfterAct: function () {
        if (typeof k.settleAfterAct !== 'function') {
          return Promise.resolve({ idle: true, waitedMs: 0, kind: 'text' });
        }
        return k.settleAfterAct.apply(k, arguments);
      },
      waitForSelectOptionsSequential: function () {
        if (typeof k.waitForSelectOptionsSequential !== 'function') {
          return Promise.resolve(null);
        }
        return k.waitForSelectOptionsSequential.apply(k, arguments);
      },
      waitForOptions: function () {
        if (typeof k.waitForOptions !== 'function') return Promise.resolve(null);
        return k.waitForOptions.apply(k, arguments);
      },
      waitForDOMQuiet: function (ms) {
        if (typeof k.waitForDOMQuiet === 'function') {
          return k.waitForDOMQuiet.apply(k, arguments);
        }
        // Fallback — must never throw "waitForDOMQuiet is not defined"
        return new Promise(function (r) { setTimeout(r, ms || 300); });
      },
      waitForNetworkIdle: function (q, m) {
        if (typeof k.waitForNetworkIdle === 'function') {
          return k.waitForNetworkIdle.apply(k, arguments);
        }
        if (typeof window !== 'undefined' && window.ccWaitForNetworkIdle) {
          return window.ccWaitForNetworkIdle(q || 200, m || 8000);
        }
        return Promise.resolve({ idle: true, waitedMs: 0 });
      },
      detectStrategy: function () {
        if (typeof k.detectStrategy !== 'function') return 'unknown';
        return k.detectStrategy.apply(k, arguments);
      },
      verifyValue: function () {
        if (typeof k.verifyValue !== 'function') {
          return Promise.resolve({ ok: false, actualValue: '', reason: 'no-verify' });
        }
        return k.verifyValue.apply(k, arguments);
      },
      _isPlaceholderOption: function () {
        return typeof k.isPlaceholderOption === 'function'
          ? k.isPlaceholderOption.apply(k, arguments)
          : false;
      },
      _realOptions: function () {
        return typeof k.realOptions === 'function' ? k.realOptions.apply(k, arguments) : [];
      },
      _sampleOptions: function () {
        return typeof k.sampleOptions === 'function' ? k.sampleOptions.apply(k, arguments) : [];
      },
      _readSelectActual: function () {
        return typeof k.readSelectActual === 'function'
          ? k.readSelectActual.apply(k, arguments)
          : { actualValue: null, actualOptionValue: null };
      },
      _selectLoadMode: function () {
        return typeof k.selectLoadMode === 'function' ? k.selectLoadMode.apply(k, arguments) : 'unknown';
      },
      _cascadeSemanticKey: function () {
        return typeof k.cascadeSemanticKey === 'function'
          ? k.cascadeSemanticKey.apply(k, arguments)
          : '';
      },
      _CASCADE_PARENTS: k.CASCADE_PARENTS,
      _cascadeSettled: k.cascadeSettled,
      _isPlaceholderPlanned: function () {
        return typeof k.isPlaceholderPlanned === 'function'
          ? k.isPlaceholderPlanned.apply(k, arguments)
          : false;
      },
      _selectIsActive: function () {
        return typeof k.selectIsActive === 'function' ? k.selectIsActive.apply(k, arguments) : true;
      },
      fillOne: function () {
        if (typeof k.fillOne !== 'function') return 0;
        return k.fillOne.apply(k, arguments);
      },
      k: k,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
