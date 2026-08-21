/**
 * date pickers
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneDate = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fod = root.CcFillOneDate || {};
    k.fillOneHandlers.push({
      id: 'date',
      try(el, selector, value, type, elType) {
        if (_fod.fillDate) return _fod.fillDate(el, selector, value);
        if (el._flatpickr || el.classList.contains('flatpickr-input')) {
                // ── flatpickr datepicker ─────────────────────────────────────────────
                // flatpickr attaches _flatpickr instance to the input. Use its API.
                const fp = el._flatpickr;
                // parse-date-value.js is the single source for date string parsing.
                var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
                var dateObj = _parsed.dateObj;

                if (fp && !isNaN(dateObj)) {
                  fp.setDate(dateObj, true); // true = trigger onChange
                } else {
                  // Fallback: set value directly + dispatch
                  const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                  el.focus();
                  if (niv) niv.set.call(el, value); else el.value = value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.blur();
                }
                console.debug('[CC] flatpickr fill:', selector, 'value:', value, 'result:', el.value);
                return el.value ? 1 : 0;
              } else if (el.classList.contains('hasDatepicker') || (typeof $ !== 'undefined' && typeof $.fn !== 'undefined' && typeof $.fn.datepicker !== 'undefined' && $(el).data('datepicker'))) {
                // ── jQuery UI Datepicker ─────────────────────────────────────────────
                // parse-date-value.js is the single source for date string parsing.
                var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
                var dateObj = _parsed.dateObj;

                if (!isNaN(dateObj)) {
                  $(el).datepicker('setDate', dateObj);
                } else {
                  // Fallback: set value + trigger
                  const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                  el.focus();
                  if (niv) niv.set.call(el, value); else el.value = value;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                console.debug('[CC] jQuery datepicker fill:', selector, 'value:', value, 'result:', el.value);
                return el.value ? 1 : 0;
              } else if (el.getAttribute('matdatepicker') !== null || el.getAttribute('matInput') !== null && el.closest('mat-datepicker-toggle,mat-form-field') && (el.type === 'text' || el.type === 'date')) {
                // ── Angular Material mat-datepicker ──────────────────────────────────
                // mat-datepicker binds to a plain <input matInput [matDatepicker]="...">
                // Setting .value alone doesn't update the Angular FormControl.
                // We must: 1) set via native setter, 2) fire input+change, 3) fire a
                // synthetic MatDatepickerInputEvent so Angular's ControlValueAccessor picks it up.
                const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                el.focus();
                if (niv) niv.set.call(el, value); else el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                // Angular Material listens for 'dateChange' and 'dateInput' on the host element
                el.dispatchEvent(new CustomEvent('dateChange', { bubbles: true, detail: { value } }));
                el.dispatchEvent(new CustomEvent('dateInput', { bubbles: true, detail: { value } }));
                // Also try keyboard simulation — some Angular versions only update on keyup
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'Enter' }));
                el.blur();
                return 1;
              } else if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'month' || el.type === 'week') {
                // ── Native date/time inputs ──────────────────────────────────────────
                // These require ISO format: YYYY-MM-DD for date, YYYY-MM-DDTHH:MM for
                // datetime-local, YYYY-MM for month. Profile data is usually in Indian
                // format (DD/MM/YYYY or DD-MM-YYYY). Convert before setting.
                // parse-date-value.js provides ISO conversion for all date formats.
                var _parsed2 = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : null;
                // For datetime-local: preserve original if it already has a time component
                var isoValue;
                if (el.type === 'datetime-local' && String(value || '').includes('T')) {
                  isoValue = String(value); // already has datetime — pass through
                } else if (_parsed2 && _parsed2.isoDate) {
                  isoValue = (el.type === 'month') ? _parsed2.isoMonth : _parsed2.isoDate;
                } else {
                  isoValue = value; // fallback: pass through original
                }
                // For datetime-local: if only date provided, append T00:00
                if (el.type === 'datetime-local' && !isoValue.includes('T')) {
                  isoValue += 'T00:00';
                }
                // Set via native setter (keystroke doesn't work on date inputs)
                const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                el.focus();
                if (niv) niv.set.call(el, isoValue); else el.value = isoValue;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.blur();
                console.debug('[CC] date fill:', selector, 'original:', value, 'iso:', isoValue, 'result:', el.value);
                return el.value ? 1 : 0;
              } 
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
