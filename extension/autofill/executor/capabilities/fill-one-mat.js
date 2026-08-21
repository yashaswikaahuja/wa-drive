/**
 * fill-one-mat — Angular Material Fill Handler
 *
 * Fills mat-select, mat-checkbox, and mat-radio elements.
 *
 * mat-select: opens overlay via trigger click, waits 400ms, finds matching
 * mat-option by text (exact → startsWith → reverseStartsWith → includes),
 * clicks it. Fire-and-forget — returns 1 immediately.
 *
 * mat-checkbox: toggles if current checked state doesn't match desired.
 *
 * mat-radio: clicks if label text matches value.
 *
 * Public API (on globalThis.CcFillOneMat):
 *   fillMat(el, value, elType) => 1 | 0 | null
 *
 * Returns null if elType is not a mat type (pass-through for handler chain).
 *
 * See fill-one-mat.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * @param {Element} el
   * @param {string}  value
   * @param {string}  elType  — 'mat-select' | 'mat-checkbox' | 'mat-radio'
   * @returns {1|0|null}
   */
  function fillMat(el, value, elType) {
    if (elType !== 'mat-select' && elType !== 'mat-checkbox' && elType !== 'mat-radio') {
      return null;
    }

    if (elType === 'mat-select') {
      var trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
      trigger.click();
      setTimeout(function () {
        var v = value.toLowerCase().trim();
        var opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
        var opt = opts.find(function (o) { return o.textContent.trim().toLowerCase() === v; }) ||
                  opts.find(function (o) { return o.textContent.trim().toLowerCase().startsWith(v); }) ||
                  opts.find(function (o) { return v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2; }) ||
                  opts.find(function (o) { return o.textContent.trim().toLowerCase().includes(v); });
        if (opt) opt.click(); else document.body.click();
      }, 400);
      return 1; // fire-and-forget
    }

    if (elType === 'mat-checkbox') {
      var shouldCheck = /yes|true|1|on|checked/i.test(value);
      var input = el.querySelector('input[type="checkbox"]');
      var isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
      if (shouldCheck !== isChecked) { (input || el).click(); }
      return 1;
    }

    if (elType === 'mat-radio') {
      var v2 = value.toLowerCase().trim();
      var label = el.textContent.trim().toLowerCase();
      if (label === v2 || label.includes(v2) || v2.includes(label)) {
        var radioInput = el.querySelector('input[type="radio"]') || el;
        radioInput.click();
        return 1;
      }
      return 0;
    }

    return 0;
  }

  root.CcFillOneMat = {
    fillMat: fillMat,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
