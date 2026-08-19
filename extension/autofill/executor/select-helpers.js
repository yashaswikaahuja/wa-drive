/**
 * Select/cascade helpers + pushSelectRecord
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSelectHelpers = function (k) {
  function isPlaceholderOption(o) {
    if (!o) return true;
    const v = String(o.value == null ? '' : o.value).trim();
    const t = String(o.text || '').trim().toLowerCase();
    if (!v || v === '0' || v === '-1' || v === '') return true;
    if (!t || t === '--' || t.includes('select') || t.includes('choose') || t.includes('loading')) return true;
    return false;
  }
  function realOptions(el) {
    if (!el || !el.options) return [];
    return Array.from(el.options).filter((o) => !isPlaceholderOption(o));
  }
  function sampleOptions(el, n) {
    n = n || 8;
    return realOptions(el).slice(0, n).map((o) => ({
      value: String(o.value || '').slice(0, 40),
      text: String(o.text || '').trim().slice(0, 60),
    }));
  }
  function readSelectActual(el) {
    if (!el || el.tagName !== 'SELECT') return { actualValue: null, actualOptionValue: null };
    const opt = el.options && el.options[el.selectedIndex];
    if (!opt || isPlaceholderOption(opt)) {
      return { actualValue: '', actualOptionValue: opt ? String(opt.value || '') : '' };
    }
    return {
      actualValue: String(opt.text || '').trim(),
      actualOptionValue: String(opt.value || ''),
    };
  }
  /** Static = already has real options; AJAX child = only placeholders / empty. */
  function selectLoadMode(el) {
    if (!el || el.tagName !== 'SELECT') return 'unknown';
    return realOptions(el).length > 0 ? 'static' : 'ajax';
  }
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
  // Last successful cascade parent values (semanticKey → { selector, actualValue, value })
  // Budget: dead secondary AJAX selects used to burn ~10s each → multi-minute hangs after real cascade done
    function isPlaceholderPlanned(v) {
    const t = String(v == null ? '' : v).toLowerCase().trim();
    return !t || t === '--' || t === '0' || t.includes('please select') || t === 'select' || t.startsWith('select ');
  }
  function selectIsActive(el) {
    if (!el) return false;
    if (el.disabled) return false;
    try {
      if (el.offsetParent === null && el.getClientRects && el.getClientRects().length === 0) return false;
    } catch { /* ignore */ }
    return true;
  }

  function pushSelectRecord(base) {
    const rec = Object.assign(
      {
        ts: Date.now(),
        rv: k.RUNTIME_VERSION,
        fillMode: 'sequential',
      },
      base
    );
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
