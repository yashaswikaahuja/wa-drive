function fillFormFieldsSequential(mapping, filledBySource, portalAdapters) {
  portalAdapters = portalAdapters || {};
  console.log('[CC] v3.62 fillFormFieldsSequential started, fields:', Object.keys(mapping).length);
  const _replayResults = {}; // label -> 'ok'|'no-option'|'no-adapter'|'verify-fail'
  // Sort: fill state before district before block (dependent dropdowns)
  const PRIORITY_KEYS = ['state', 'district', 'block', 'panchayat'];
  const entries = Object.entries(mapping);
  entries.sort(([sa], [sb]) => {
    // Use label from filledBySource for priority matching (handles numeric IDs like #17391)
    const labelA = (filledBySource[sa]?.label || sa).toLowerCase();
    const labelB = (filledBySource[sb]?.label || sb).toLowerCase();
    const pa = PRIORITY_KEYS.findIndex(k => labelA.includes(k) || sa.toLowerCase().includes(k));
    const pb = PRIORITY_KEYS.findIndex(k => labelB.includes(k) || sb.toLowerCase().includes(k));
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });

  let filled = 0;
  let delay = 0;

  function fillOne(selector, value, type) {
    try {
      let el;
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        el = all[parseInt(selector.split('-')[2])];
      } else if (selector.startsWith('ng-dropdown-')) {
        el = document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }
      if (!el) return 0;
      // Detect type from DOM directly (more reliable than passed type)
      const tagName = el.tagName.toLowerCase();
      const elType = tagName === 'select' ? 'select'
        : tagName === 'mat-select' ? 'mat-select'
        : tagName === 'mat-checkbox' ? 'mat-checkbox'
        : tagName === 'mat-radio-button' ? 'mat-radio'
        : el.type || 'text';

      // Portal adapter replay for ng-dropdown and similar custom components
      if (elType === 'ng-dropdown' || type === 'ng-dropdown') {
        // Find adapter by componentClass matching root's first class
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
        const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];
        if (adapter) {
          const _label = filledBySource[selector]?.label || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;
          trigger.click();
          let attempts = 0;
          // Wait 400ms for Angular to render options panel before polling
          setTimeout(() => {
          const poll = setInterval(() => {
            attempts++;
            const container = adapter.optionsContainer ? document.querySelector(adapter.optionsContainer) : null;
            const searchRoot = container ||
              document.querySelector('app-dropdown .options, app-dropdown ul, .dropdown-options, .options-list, .dropdown-menu') ||
              document;
            const opts = Array.from(searchRoot.querySelectorAll(adapter.optionSelector))
              .filter(o => o.offsetParent !== null);
            const v = value.toLowerCase().trim();
            const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                        opts.find(o => o.textContent.trim().toLowerCase().includes(v));
            if (opt) {
              clearInterval(poll);
              opt.click();
              setTimeout(() => {
                // Re-query verifyEl fresh — Angular replaces DOM nodes on value change
                const verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
                const displayed = verifyEl ? verifyEl.textContent.trim().toLowerCase() : '';
                const ok = displayed && displayed !== 'select' && displayed.length > 0;
                _replayResults[_label] = ok ? 'ok' : 'verify-fail';
                sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
              }, 1000);
            } else if (attempts >= 10) {
              clearInterval(poll);
              document.body.click();
              _replayResults[_label] = 'no-option';
              sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
            }
          }, 300);
          }, 400);
          return 1;
        }
        // No adapter yet
        const _noAdapterLabel = filledBySource[selector]?.label || selector;
        _replayResults[_noAdapterLabel] = 'no-adapter';
        sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
        return 0;
      }

      // Angular Material mat-select: click trigger, wait for panel, click matching option
      if (elType === 'mat-select') {
        const trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
        trigger.click();
        setTimeout(() => {
          const v = value.toLowerCase().trim();
          const opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
          const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                      opts.find(o => o.textContent.trim().toLowerCase().startsWith(v)) ||
                      opts.find(o => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) ||
                      opts.find(o => o.textContent.trim().toLowerCase().includes(v));
          if (opt) opt.click(); else document.body.click();
        }, 400);
        return 1; // fire-and-forget, count as filled
      }

      // Angular Material mat-checkbox
      if (elType === 'mat-checkbox') {
        const shouldCheck = /yes|true|1|on|checked/i.test(value);
        const input = el.querySelector('input[type="checkbox"]');
        const isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
        if (shouldCheck !== isChecked) { (input || el).click(); }
        return 1;
      }

      // Angular Material mat-radio-button
      if (elType === 'mat-radio') {
        const v = value.toLowerCase().trim();
        const label = el.textContent.trim().toLowerCase();
        if (label === v || label.includes(v) || v.includes(label)) {
          const input = el.querySelector('input[type="radio"]') || el;
          input.click();
          return 1;
        }
        return 0;
      }

      console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
      // radio-click: directly click this specific radio option (matched by label in fuzzyMatch)
      if (type === 'radio-click') {
        el.focus();
        el.checked = true;
        ['click','change'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
        return 1;
      }
      if (elType === 'select') {
        const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const v = norm(value);
        const vWords = v.split(' ').filter(w => w.length > 1);
        const extraValues = [];
        if (mapping[selector]?.monthNum) { extraValues.push(mapping[selector].monthNum.toString()); if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase()); }
        const overlapScore = o => { const ot = norm(o.text); return vWords.filter(w => ot.includes(w)).length; };

        function findOpt(options) {
          const opts = options.filter(o => {
            if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
            const txt = o.text.toLowerCase();
            // Exclude placeholder/loading options
            if (txt.includes('select') || txt.includes('choose') || txt.includes('loading') || txt === '--') return false;
            return true;
          });
          return opts.find(o => o.value.toLowerCase() === value.toLowerCase().trim()) ||
                 opts.find(o => norm(o.text) === v) ||
                 opts.find(o => norm(o.value) === v) ||
                 (extraValues.length && opts.find(o => extraValues.includes(o.value.toLowerCase()) || extraValues.includes(norm(o.text)))) ||
                 opts.find(o => norm(o.text).startsWith(v) && v.length > 2) ||
                 opts.find(o => v.startsWith(norm(o.text)) && norm(o.text).length > 2) ||
                 opts.find(o => norm(o.text).includes(v) && v.length > 3) ||
                 opts.find(o => v.includes(norm(o.text)) && norm(o.text).length > 3) ||
                 (() => { const best = opts.filter(o => overlapScore(o) === vWords.length && vWords.length > 0); return best.length === 1 ? best[0] : null; })();
        }

        function applySelect(el, opt) {
          el.focus();
          el.dispatchEvent(new Event('focus', { bubbles: true }));

          // Step 1: Mark the option directly (most reliable for ASP.NET/NIC)
          Array.from(el.options).forEach(o => { o.selected = false; });
          opt.selected = true;
          el.selectedIndex = opt.index;

          // Step 2: Sync el.value via native setter
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
          if (nativeSetter) nativeSetter.set.call(el, opt.value);
          else el.value = opt.value;

          // Step 3: Fire full event sequence
          ['mousedown','mouseup','click','input','change'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
          );
          // Trigger ASP.NET onchange handler directly if present
          if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch(e) { console.debug('[CC] onchange handler error:', e.message); } }
          // propertychange for old ASP.NET/IE compat (optional)
          try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch {}
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          // Step 4: Verify persistence after events (framework may reset)
          setTimeout(() => {
            if (el.value !== opt.value || el.selectedIndex !== opt.index) {
              console.debug('[CC] select reset by framework, re-applying:', selector, opt.value);
              opt.selected = true;
              el.selectedIndex = opt.index;
              if (nativeSetter) nativeSetter.set.call(el, opt.value);
              else el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            console.debug('[CC] select verify:', selector, 'value:', el.value, 'selectedIndex:', el.selectedIndex, 'expected:', opt.value, opt.index);
          }, 300);

          // Step 5: One more delayed change (no duplicate guard needed — only fires once)
          setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 700);

          console.debug('[CC] select applied:', selector, '->', opt.text.trim(), '(value:', opt.value, 'index:', opt.index, ')');
          return 1;
        }

        const allOptions = Array.from(el.options);
        const opt = findOpt(allOptions);
        console.debug('[CC] select attempt:', selector, 'value:', value, 'total opts:', allOptions.length, 'matched:', opt ? opt.text.trim() : 'NONE', 'sample:', allOptions.slice(0,3).map(o=>o.value+'='+o.text.trim()));
        if (opt) return applySelect(el, opt);

        // Options not ready yet (dependent dropdown) — schedule retry, count as pending
        // Return 1 optimistically so the filled count isn't 0; retry will apply the value
        let attempts = 0;
        const interval = setInterval(() => {
          const allOpts = Array.from(el.options);
          const realOpts = allOpts.filter(o => {
            if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
            const txt = o.text.toLowerCase();
            return !txt.includes('select') && !txt.includes('choose') && !txt.includes('loading') && txt !== '--';
          });
          if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
          const opt2 = findOpt(allOpts);
          if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
          if (++attempts >= 15) {
            clearInterval(interval);
            console.debug('[CC] select no match after wait:', selector, 'value:', value, 'opts:', realOpts.slice(0,5).map(o=>o.text.trim()));
          }
        }, 200);
        return 1; // counted as filled; actual value applied async

      } else if (elType === 'radio') {
        const normR = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const vR = normR(value);
        const radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
        const match = Array.from(radios).find(r => {
          if (normR(r.value) === vR) return true;
          const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
          const lblText = lbl ? normR(lbl.textContent) : '';
          return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
        });
        if (match) {
          match.focus();
          match.checked = true;
          ['click','change'].forEach(ev => match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
          match.dispatchEvent(new Event('blur', { bubbles: true }));
          return 1;
        }
      } else if (elType === 'checkbox') {
        // Only fill checkboxes with boolean-like values — never with names/numbers/IDs
        const booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
        if (!booleanLike.includes(value.toLowerCase())) { console.debug('[CC] skipped checkbox with non-boolean value:', value); return 0; }
        const truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
        if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; }
      } else {
        // Angular/React compatible input filling
        const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (niv) niv.set.call(el, value);
        else el.value = value;
        ['input','change','keyup','keydown'].forEach(ev => {
          el.dispatchEvent(new Event(ev, { bubbles: true }));
        });
        // Also simulate keyboard events for Angular
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
        return 1;
      }
    } catch { /* skip */ }
    return 0;
  }

  for (const [selector, fieldData] of entries) {
    const { value, type } = fieldData;
    const isMatSelect = type === 'mat-select' || type === 'mat-radio';
    const isNgDropdown = type === 'ng-dropdown' || selector.startsWith('ng-dropdown-');
    const fieldLabel = (filledBySource[selector]?.label || selector).toLowerCase();
    const isDependent = PRIORITY_KEYS.some(k => fieldLabel.includes(k) || selector.toLowerCase().includes(k));
    if (isMatSelect) {
      // mat-select needs real click simulation with delay between each
      setTimeout(() => fillOne(selector, value, type), delay);
      delay += 800;
    } else if (isNgDropdown) {
      // ng-dropdown: async click sequence — must be sequential, not concurrent
      setTimeout(() => fillOne(selector, value, type), delay);
      delay += 2000; // 400ms open + 300ms*10 poll + 1000ms verify = ~2s per dropdown
    } else if (isDependent && filled > 0) {
      setTimeout(() => fillOne(selector, value, type), delay);
      delay += 600;
    } else {
      try { filled += fillOne(selector, value, type) || 0; }
      catch(e) { console.debug('[CC] fillOne error on', selector, ':', e.message); }
      // Fix #2: fill verify/confirm fields by label similarity (re-enter, confirm, verify)
      if (!selector.startsWith('form-field-') && !['select','radio','checkbox','mat-select','mat-radio','mat-checkbox'].includes(type)) {
        const SENSITIVE = ['aadhaar_number','mobile','email','pan_number'];
        const info2 = filledBySource[selector];
        const isSensitive = info2 && SENSITIVE.includes(info2.profileKey);
        // Same-selector duplicates
        const extras = Array.from(document.querySelectorAll(selector)).slice(1);
        // Label-similarity: find inputs whose label contains re/confirm/verify + base label word
        const baseLabel = (info2 && info2.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (baseLabel.length > 2) {
          document.querySelectorAll('input[type=text],input[type=tel],input[type=email],input[type=number]').forEach(inp => {
            if (extras.includes(inp)) return;
            const lbl = (() => {
              if (inp.id) { const l = document.querySelector('label[for="' + inp.id + '"]'); if (l) return l.textContent.toLowerCase(); }
              const td = inp.closest('td'); if (td && td.previousElementSibling) return td.previousElementSibling.textContent.toLowerCase();
              return inp.placeholder.toLowerCase();
            })();
            const isVerify = /re.?enter|re.?type|confirm|verify/.test(lbl);
            const hasBase = lbl.replace(/[^a-z0-9]/g, '').includes(baseLabel.slice(0, 6));
            if (isVerify && hasBase) extras.push(inp);
          });
        }
        for (const ex of extras) {
          // Strict validation for sensitive fields before filling verify
          if (isSensitive) {
            const pk = info2.profileKey;
            const valid = (pk === 'aadhaar_number' && /^\d{12}$/.test(value)) ||
                          (pk === 'mobile' && /^\d{10}$/.test(value)) ||
                          (pk === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
                          (pk === 'pan_number' && /^[A-Z]{5}\d{4}[A-Z]$/.test(value));
            if (!valid) { console.debug('[CC] skipped verify fill: sensitive field failed validation', pk, value); continue; }
          }
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          if (niv) niv.set.call(ex, value); else ex.value = value;
          ['input','change'].forEach(ev => ex.dispatchEvent(new Event(ev, { bubbles: true })));
          console.debug('[CC] filled verify field:', selector, '->', ex.id || ex.name, value.slice(0,4) + '***');
          filled++;
        }
      }
    }
  }
  return filled;
}
function fillFormFields(mapping) {
  let filled = 0;
  for (const [selector, { value, type }] of Object.entries(mapping)) {
    try {
      let el;
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll(
          'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
          'input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
        );
        el = all[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }
      if (!el) continue;

      if (type === 'select') {
        const opts = Array.from(el.options).filter(o => o.value && o.value !== '0' && o.value !== '-1');
        const v = value.toLowerCase().trim();
        // For month fields, also try numeric and short name
        const extraValues = [];
        if (mapping[selector]?.monthNum) {
          extraValues.push(mapping[selector].monthNum.toString());
          extraValues.push(mapping[selector].monthShort?.toLowerCase());
        }
        // 1. Exact value match
        let opt = opts.find(o => o.value.toLowerCase() === v);
        // 2. Exact text match
        if (!opt) opt = opts.find(o => o.text.toLowerCase().trim() === v);
        // 3. Extra values (month number/short)
        if (!opt && extraValues.length) opt = opts.find(o => extraValues.includes(o.value.toLowerCase()) || extraValues.includes(o.text.toLowerCase().trim()));
        // 4. Text starts with value
        if (!opt) opt = opts.find(o => o.text.toLowerCase().trim().startsWith(v));
        // 5. Value starts with text
        if (!opt) opt = opts.find(o => v.startsWith(o.text.toLowerCase().trim()) && o.text.length > 2);
        // 6. Text contains value
        if (!opt) opt = opts.find(o => o.text.toLowerCase().includes(v));
        // 7. Value contains text
        if (!opt) opt = opts.find(o => v.includes(o.text.toLowerCase().trim()) && o.text.length > 2);
        // 8. First word match
        if (!opt) {
          const firstWord = v.split(/\s+/)[0];
          opt = opts.find(o => o.text.toLowerCase().startsWith(firstWord) && firstWord.length > 2);
        }
        if (opt) {
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 300);
          filled++;
        }

      } else if (elType === 'radio') {
        // Find radio with matching value or label
        const radios = document.querySelectorAll(`input[type="radio"][name="${el.name}"]`);
        const match = Array.from(radios).find(r =>
          r.value.toLowerCase() === value.toLowerCase() ||
          r.value.toLowerCase().startsWith(value.toLowerCase()[0])
        );
        if (match) { match.checked = true; match.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

      } else if (elType === 'checkbox') {
        const truthy = ['yes', 'true', '1', 'checked'].includes(value.toLowerCase());
        if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); filled++; }

      } else {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // React/Vue compatibility
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (nativeInputValueSetter) { nativeInputValueSetter.set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }
        filled++;
      }
    } catch { /* skip */ }
  }
  return filled;
}
