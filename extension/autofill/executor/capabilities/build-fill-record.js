/**
 * build-fill-record — Fill Record Assembler
 *
 * Pure function that stamps a base field-result object with the three
 * common envelope fields that every CcRecord must carry:
 *   ts        — Date.now() at record creation time
 *   rv        — RUNTIME_VERSION string
 *   fillMode  — always 'sequential' for the sequential fill loop
 *
 * This pattern was previously repeated inline at every _ccRecords.push(...)
 * call site. This is the single canonical implementation.
 *
 * Pure JS — no DOM, no Chrome, no kernel. Deterministic (ts injected via opts.now).
 *
 * Public API (on globalThis.CcBuildFillRecord):
 *   buildFillRecord(base, opts?) => CcRecord
 *
 * opts: { rv?, fillMode?, now? }  — all optional, primarily used for testing
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

  root.CcBuildFillRecord = {
    buildFillRecord: buildFillRecord,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
