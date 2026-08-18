      } else if (el._flatpickr || el.classList.contains('flatpickr-input')) {
        // ── flatpickr datepicker ─────────────────────────────────────────────
        // flatpickr attaches _flatpickr instance to the input. Use its API.
        const fp = el._flatpickr;
        // Parse the date value: convert DD/MM/YYYY or DD-MM-YYYY to Date object
        let dateObj = null;
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
        if (!dateObj) dateObj = new Date(value);

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
        let dateObj = null;
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
        if (!dateObj) dateObj = new Date(value);

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
        let isoValue = value;
        // Detect DD/MM/YYYY or DD-MM-YYYY and convert to YYYY-MM-DD
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) {
          const [, day, month, year] = ddmmyyyy;
          if (el.type === 'month') {
            isoValue = `${year}-${month.padStart(2, '0')}`;
          } else {
            isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
        // Detect YYYY/MM/DD or YYYY-MM-DD (already ISO-ish)
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (yyyymmdd && !ddmmyyyy) {
          const [, year, month, day] = yyyymmdd;
          isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
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