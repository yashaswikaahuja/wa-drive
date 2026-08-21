/**
 * fill-one-date — Date Field Fill Handler
 *
 * Fills date inputs across 4 widget types:
 *   1. flatpickr  — uses fp.setDate() API
 *   2. jQuery UI datepicker — uses $(el).datepicker('setDate')
 *   3. Angular Material mat-datepicker — native setter + dateChange/dateInput events
 *   4. Native date/time inputs — ISO format conversion via CcParseDateValue
 *
 * Delegates date parsing to CcParseDateValue (already extracted).
 *
 * Public API (on globalThis.CcFillOneDate):
 *   fillDate(el, selector, value) => 1 | 0 | null
 *
 * Returns null if element is not a date widget (pass-through).
 *
 * See fill-one-date.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillDate(el, selector, value) {
    var _pdv = root.CcParseDateValue || {};
    var parseDateValue = _pdv.parseDateValue || function (v) { return { dateObj: new Date(v) }; };

    // ── flatpickr ─────────────────────────────────────────────────────────────
    if (el._flatpickr || el.classList.contains('flatpickr-input')) {
      var fp = el._flatpickr;
      var parsed = parseDateValue(value);
      var dateObj = parsed.dateObj;
      if (fp && !isNaN(dateObj)) {
        fp.setDate(dateObj, true);
      } else {
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv) niv.set.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }
      return el.value ? 1 : 0;
    }

    // ── jQuery UI datepicker ──────────────────────────────────────────────────
    if (el.classList.contains('hasDatepicker') ||
        (typeof $ !== 'undefined' && typeof $.fn !== 'undefined' &&
         typeof $.fn.datepicker !== 'undefined' && $(el).data('datepicker'))) {
      var parsed2 = parseDateValue(value);
      var dateObj2 = parsed2.dateObj;
      if (!isNaN(dateObj2)) {
        $(el).datepicker('setDate', dateObj2);
      } else {
        var niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv2) niv2.set.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return el.value ? 1 : 0;
    }

    // ── Angular Material mat-datepicker ───────────────────────────────────────
    if (el.getAttribute('matdatepicker') !== null ||
        (el.getAttribute('matInput') !== null &&
         el.closest('mat-datepicker-toggle,mat-form-field') &&
         (el.type === 'text' || el.type === 'date'))) {
      var niv3 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      el.focus();
      if (niv3) niv3.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new CustomEvent('dateChange', { bubbles: true, detail: { value: value } }));
      el.dispatchEvent(new CustomEvent('dateInput', { bubbles: true, detail: { value: value } }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'Enter' }));
      el.blur();
      return 1;
    }

    // ── Native date/time inputs ───────────────────────────────────────────────
    if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'month' || el.type === 'week') {
      var parsed3 = parseDateValue(value);
      var isoValue;
      if (el.type === 'datetime-local' && String(value || '').includes('T')) {
        isoValue = String(value);
      } else if (parsed3 && parsed3.isoDate) {
        isoValue = (el.type === 'month') ? parsed3.isoMonth : parsed3.isoDate;
      } else {
        isoValue = value;
      }
      if (el.type === 'datetime-local' && !isoValue.includes('T')) {
        isoValue += 'T00:00';
      }
      var niv4 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      el.focus();
      if (niv4) niv4.set.call(el, isoValue); else el.value = isoValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return el.value ? 1 : 0;
    }

    return null;
  }

  root.CcFillOneDate = {
    fillDate: fillDate,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
