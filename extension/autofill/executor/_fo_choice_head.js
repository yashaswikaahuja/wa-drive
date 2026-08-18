      console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
      // radio-click: directly click this specific radio option (matched by label in fuzzyMatch)
      if (type === 'radio-click') {
        const target = (el.type === 'radio') ? el : (el.querySelector && el.querySelector('input[type="radio"]')) || el;
        target.focus();
        target.checked = true;
        ['click', 'change'].forEach((ev) => target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
        return 1;
      }
      // radio-group planned without option resolve — match option by value within the name group
      if (type === 'radio-group' && elType === 'radio' && el.name) {
        const normR0 = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const vR0 = normR0(value);
        const radios0 = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
        const match0 = Array.from(radios0).find((r) => {
          if (normR0(r.value) === vR0) return true;
          const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
          const lblText = lbl ? normR0(lbl.textContent) : '';
          if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
          // Gender synonyms
          const wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
          const wantMale = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
          if (wantFemale && /female|महिला|स्त्री/.test((lbl && lbl.textContent) || r.value)) return true;
          if (wantMale && /male|पुरुष/.test((lbl && lbl.textContent) || r.value) && !/female/.test((lbl && lbl.textContent) || '')) return true;
          return false;
        });
        if (match0) {
          match0.focus();
          match0.checked = true;
          ['click', 'change'].forEach((ev) => match0.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
          return 1;
        }
        console.debug('[CC] radio-group no option match:', selector, value);
        return 0;