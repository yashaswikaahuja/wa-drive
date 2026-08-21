/**
 * verify-fill-value — Fill Value Verifier
 *
 * After a fill attempt, reads the actual current DOM value and compares it
 * to the planned value to determine whether the fill succeeded.
 *
 * Handles: checkbox checked state, radio group selected label, <select>
 * option text, text input value, masked inputs (e.g. Aadhaar last-4),
 * and normalised alphanumeric comparison.
 *
 * The element resolver is injected so this capability is testable without
 * a real browser document.
 *
 * Public API (on globalThis.CcVerifyFillValue):
 *   verifyFillValue(selector, expected, resolveEl, settleMs?) => Promise<VerifyResult>
 *
 * VerifyResult: { ok, actualValue, normExpected, normActual, reason?, partial?, masked? }
 *
 * See verify-fill-value.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Verify that a fill attempt produced the expected value in the DOM.
   *
   * Waits `settleMs` milliseconds first (default 150ms) to allow framework
   * validators, formatters, and ControlValueAccessors to react.
   *
   * @param {string} selector       The cc-style selector for the field
   * @param {string|null} expected  The value that was planned/filled
   * @param {function(string): Element|null} resolveEl  Element resolver (injected)
   * @param {number} [settleMs=150]  How long to wait before reading DOM
   *
   * @returns {Promise<{ok, actualValue, normExpected, normActual, reason?, partial?, masked?}>}
   */
  async function verifyFillValue(selector, expected, resolveEl, settleMs) {
    settleMs = (typeof settleMs === 'number') ? settleMs : 150;

    // Wait for framework to react
    if (settleMs > 0) await new Promise(function (r) { setTimeout(r, settleMs); });

    // Resolve element
    var liveEl;
    if (selector && selector.startsWith && selector.startsWith('ng-dropdown-')) {
      liveEl = null; // ng-dropdown verify handled by the handler's own verify
    } else {
      liveEl = resolveEl(selector);
    }

    if (!liveEl) {
      return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'no-element-on-verify' };
    }

    var tag = (liveEl.tagName || '').toLowerCase();

    // ── Checkbox ──────────────────────────────────────────────────────────────
    if (liveEl.type === 'checkbox') {
      return {
        ok: !!liveEl.checked,
        actualValue: liveEl.checked ? 'true' : 'false',
        normExpected: String(expected || ''),
        normActual: liveEl.checked ? 'true' : 'false',
      };
    }

    // ── Radio ─────────────────────────────────────────────────────────────────
    if (liveEl.type === 'radio') {
      var groupName = liveEl.name;
      var selected = liveEl.checked ? liveEl : null;
      if (groupName) {
        var checked = document.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
        if (checked) selected = checked;
      }
      if (!selected) {
        return { ok: false, actualValue: '', normExpected: String(expected || ''), normActual: '', reason: 'radio-none-checked' };
      }
      var lbl = selected.id ? document.querySelector('label[for="' + selected.id + '"]') : null;
      var actualLabel = (lbl && lbl.textContent.trim()) || selected.value || 'true';
      var normFn = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var normExp0 = normFn(expected);
      var normAct0 = normFn(actualLabel);
      var ok0 = !expected ||
        normAct0.includes(normExp0.slice(0, 4)) ||
        normExp0.includes(normAct0.slice(0, 4)) ||
        selected.checked;
      return { ok: !!ok0, actualValue: actualLabel, normExpected: normExp0, normActual: normAct0 };
    }

    // ── Select ────────────────────────────────────────────────────────────────
    if (tag === 'select') {
      var opt = liveEl.options[liveEl.selectedIndex];
      var actualVal = (opt ? (opt.text || opt.value) : '') || '';
      var normExpS = String(expected || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var normActS = actualVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      var okS = normExpS.length > 0 && (normActS === normExpS || normActS.includes(normExpS) || normExpS.includes(normActS));
      return { ok: okS, actualValue: actualVal, normExpected: normExpS, normActual: normActS };
    }

    // ── Text input / textarea ─────────────────────────────────────────────────
    var actual = liveEl.value || '';
    var expStr = String(expected || '');

    if (!expStr) {
      return { ok: false, actualValue: actual, normExpected: '', normActual: actual, reason: 'empty-expected' };
    }

    var normExp = expStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    var normAct = actual.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match (after normalisation)
    if (normExp === normAct) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct };
    }

    // Partial match — framework may reformat (e.g. phone number groups)
    if (normAct.length > 0 &&
        (normAct.startsWith(normExp.slice(0, Math.max(8, normExp.length - 2))) ||
         normExp.startsWith(normAct.slice(0, 8)))) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, partial: true };
    }

    // Masked-input pattern (UIDAI Aadhaar: shows '****6597' but was filled with full number)
    // Same length + last 4 chars match → accept
    if (actual.length >= 8 && actual.length === expStr.length) {
      var tail = expStr.slice(-4).toLowerCase();
      if (actual.toLowerCase().endsWith(tail)) {
        return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, masked: true };
      }
    }

    return {
      ok: false,
      actualValue: actual,
      normExpected: normExp,
      normActual: normAct,
      reason: actual === '' ? 'value-rejected-empty' : 'value-mismatch',
    };
  }

  root.CcVerifyFillValue = {
    verifyFillValue: verifyFillValue,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcVerifyFillValue;
