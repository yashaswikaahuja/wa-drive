/**
 * Select/cascade helpers + pushSelectRecord
 * Part of sequential kernel — load before autofill/executor.js
 *
 * select-option-state.js is the single source of truth for the 7 pure select
 * state functions. This file re-exposes them on the kernel (k) for existing
 * consumers that access them via bindKernelLocals(k).
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSelectHelpers = function (k) {

  // ── Delegate to capabilities/select-option-state.js ──────────────────────
  // Must be loaded before select-helpers.js (see build-executor-bundle.mjs ORDER).
  var _sos = root.CcSelectOptionState || {};
  var isPlaceholderOption  = _sos.isPlaceholderOption  || function () { return true; };
  var realOptions          = _sos.realOptions          || function () { return []; };
  var sampleOptions        = _sos.sampleOptions        || function () { return []; };
  var readSelectActual     = _sos.readSelectActual     || function () { return { actualValue: null, actualOptionValue: null }; };
  var selectLoadMode       = _sos.selectLoadMode       || function () { return 'unknown'; };
  var selectIsActive       = _sos.selectIsActive       || function () { return false; };
  var isPlaceholderPlanned = _sos.isPlaceholderPlanned || function () { return true; };
  // ── build-fill-record.js is the single source for record stamping ─────────
  var _bfr = root.CcBuildFillRecord || {};
  var _buildFillRecord = _bfr.buildFillRecord || function (base) { return Object.assign({ ts: Date.now(), rv: k.RUNTIME_VERSION, fillMode: 'sequential' }, base); };

  // cascade-field-level.js is the single source of truth for cascade geography.
  // It must be loaded before select-helpers.js (see build-executor-bundle.mjs ORDER).
  var _cascadeGeo = root.CcCascadeFieldLevel;
  function cascadeSemanticKey(label, profileKey, selector) {
    return _cascadeGeo
      ? _cascadeGeo.cascadeFieldLevel(label, profileKey, selector)
      : ''; // safe fallback if loaded out of order
  }
  /** Parent keys that must be settled before this cascade key. */
  k.CASCADE_PARENTS = _cascadeGeo ? _cascadeGeo.CASCADE_PARENTS : {};
  // ── Cascade geography (delegated to capabilities/cascade-field-level.js) ─

  function pushSelectRecord(base) {
    const rec = _buildFillRecord(base, { rv: k.RUNTIME_VERSION });
    k.records.push(rec);
    k.flushRecords();
    const result = String(rec.result || '');
    if (result === 'filled' || result === 'succeeded') {
      k.emitFillDebug('field.done', {
        selector: rec.selector,
        label: rec.label,
        type: rec.type,
        planned: rec.value,
        actual: rec.actualValue,
        strategy: rec.strategy,
      });
    } else if (result === 'skipped' || result === 'failed' || result === 'error' || result === 'waiting_human') {
      k.emitFillDebug(result === 'waiting_human' ? 'field.wait' : 'field.fail', {
        selector: rec.selector,
        label: rec.label,
        type: rec.type,
        planned: rec.value,
        actual: rec.actualValue,
        failReason: rec.failReason || rec.error || result,
        strategy: rec.strategy,
      });
    }
    return rec;
  }
    k.buildFillRecord = _buildFillRecord;
    k.isPlaceholderOption = isPlaceholderOption;
    k.realOptions = realOptions;
    k.sampleOptions = sampleOptions;
    k.readSelectActual = readSelectActual;
    k.selectLoadMode = selectLoadMode;
    k.cascadeSemanticKey = cascadeSemanticKey;
    k.isPlaceholderPlanned = isPlaceholderPlanned;
    k.selectIsActive = selectIsActive;
    k.pushSelectRecord = pushSelectRecord;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
