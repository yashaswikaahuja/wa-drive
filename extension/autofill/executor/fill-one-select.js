/**
 * native select
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneSelect = function (k) {
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
    k.fillOneHandlers.push({
      id: 'select',
      try(el, selector, value, type, elType) {
        if (elType !== 'select') return null;
        if (elType === 'select') {
                const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const v = norm(value);
                const vWords = v.split(' ').filter(w => w.length > 1);
                const extraValues = [];
                if (mapping[selector]?.monthNum) { extraValues.push(mapping[selector].monthNum.toString()); if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase()); }

                function findOpt(options) {
                  // shared/option-match.js is injected before executor.js runs
                  return window.ccMatchOption(value, options, { extraValues: extraValues });
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
                  // jQuery change trigger — needed for ServicePlus/DWR cascading selects
                  if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch(e) {} }
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

                  // Step 6: Re-apply after DWR cascade may reset the value (ServicePlus pattern)
                  const _reapplyVal = opt.value; const _reapplyIdx = opt.index;
                  setTimeout(() => {
                    if (el.value !== _reapplyVal) {
                      el.selectedIndex = _reapplyIdx; el.value = _reapplyVal;
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      console.debug('[CC] re-applied after DWR reset:', selector, _reapplyVal);
                    }
                  }, 3500);

                  console.debug('[CC] select applied:', selector, '->', opt.text.trim(), '(value:', opt.value, 'index:', opt.index, ')');
                  return 1;
                }

                const allOptions = Array.from(el.options);
                const opt = findOpt(allOptions);
                console.debug('[CC] select attempt:', selector, 'value:', value, 'total opts:', allOptions.length, 'matched:', opt ? opt.text.trim() : 'NONE', 'sample:', allOptions.slice(0,3).map(o=>o.value+'='+o.text.trim()));
                if (opt) return applySelect(el, opt);

                // Options not ready yet (dependent dropdown) — schedule retry
                // The sequential loop already handles cascade timing via waitForNetworkIdle + waitForOptions.
                // This retry is a fallback for when fillOne is called directly (not through the cascade path).
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
                    // AI fallback — ask LLM to pick the best option
                    const groqKey = window._cc_groq_key || (document.body.getAttribute('data-cc-llm-key') || '');
                    if (groqKey && realOpts.length > 0) {
                      const optTexts = realOpts.map(o => o.text.trim()).join('\n');
                      window.ccLLM.call({
                        apiKey: groqKey,
                        baseUrl: document.body.getAttribute('data-cc-llm-url') || undefined,
                        model: document.body.getAttribute('data-cc-llm-model') || undefined,
                        userPrompt: 'From these dropdown options, which best matches "' + value + '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
                        maxTokens: 50,
                      }).then(result => {
                        const aiText = (result.text || '').trim();
                        if (aiText) {
                          const aiOpt = realOpts.find(o => o.text.trim() === aiText) || realOpts.find(o => o.text.trim().toLowerCase().includes(aiText.toLowerCase()));
                          if (aiOpt) { console.debug('[CC] AI matched:', aiText, '->', aiOpt.text); applySelect(el, aiOpt); }
                        }
                      }).catch(() => {});
                    }
                    console.debug('[CC] select no match after wait:', selector, 'value:', value, 'opts:', realOpts.slice(0,5).map(o=>o.text.trim()));
                  }
                }, 200);
                return 1; // counted as filled; actual value applied async

              }
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
