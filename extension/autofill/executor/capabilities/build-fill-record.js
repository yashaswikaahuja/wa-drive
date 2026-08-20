/**
 * build-fill-record — Fill Record Assembler
 *
 * Pure function that stamps a base field-result object with the three
 * common envelope fields that every CcRecord must carry:
 *   ts        — Date.now() at record creation time
 *   rv        — RUNTIME_VERSION string
 *   fillMode  — always 'sequential' for the sequential fill loop
 *
 * Also provides typed builder helpers for each record variant
 * (filled, skipped, error, waiting_human) so callers produce
 * consistent shapes without repeating the same literal fields.
 *
 * Pure JS — no DOM, no Chrome, no kernel. Deterministic (ts is injected
 * in tests via opts.now).
 *
 * Public API (on globalThis.CcBuildFillRecord):
 *   buildFillRecord(base, opts?) => CcRecord
 *   buildFilledRecord(fields, opts?)        => CcRecord  result='filled'
 *   buildSkippedRecord(fields, opts?)       => CcRecord  result='skipped'
 *   buildErrorRecord(fields, opts?)         => CcRecord  result='error'
 *   buildWaitingHumanRecord(fields, opts?)  => CcRecord  result='waiting_human'
 *
 * opts: { rv?, fillMode?, now? }  — all optional, used for testing
 *
 * See build-fill-record.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Stamp a base object with envelope fields.
   *
   * @param {object} base     — caller-provided fields (selector, value, type, result, …)
   * @param {object} [opts]
   * @param {string} [opts.rv]       — RUNTIME_VERSION (default: '')
   * @param {string} [opts.fillMode] — fill mode label (default: 'sequential')
   * @param {function(): number} [opts.now] — timestamp fn (default: Date.now)
   * @returns {object} stamped record
   */
  function buildFillRecord(base, opts) {
    opts = opts || {};
    var rv       = (opts.rv !== undefined)       ? opts.rv       : '';
    var fillMode = (opts.fillMode !== undefined) ? opts.fillMode : 'sequential';
    var now      = (typeof opts.now === 'function') ? opts.now : Date.now;
    return Object.assign(
      { ts: now(), rv: rv, fillMode: fillMode },
      base
    );
  }

  /** result='filled' helper — shortcut with required field validation */
  function buildFilledRecord(fields, opts) {
    return buildFillRecord(Object.assign({ result: 'filled' }, fields), opts);
  }

  /** result='skipped' helper */
  function buildSkippedRecord(fields, opts) {
    return buildFillRecord(Object.assign({ result: 'skipped' }, fields), opts);
  }

  /** result='error' helper */
  function buildErrorRecord(fields, opts) {
    return buildFillRecord(Object.assign({ result: 'error' }, fields), opts);
  }

  /** result='waiting_human' helper */
  function buildWaitingHumanRecord(fields, opts) {
    return buildFillRecord(Object.assign({ result: 'waiting_human' }, fields), opts);
  }

  root.CcBuildFillRecord = {
    buildFillRecord: buildFillRecord,
    buildFilledRecord: buildFilledRecord,
    buildSkippedRecord: buildSkippedRecord,
    buildErrorRecord: buildErrorRecord,
    buildWaitingHumanRecord: buildWaitingHumanRecord,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
