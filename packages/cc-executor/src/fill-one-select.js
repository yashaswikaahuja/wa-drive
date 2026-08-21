/**
 * fill-one-select — Native Select Fill Handler
 *
 * Fills <select> elements. Delegates option matching to window.ccMatchOption.
 * Applies selection via native setter + full event sequence (ASP.NET/NIC compat).
 * Includes DWR cascade re-apply (ServicePlus), AI LLM fallback.
 *
 * Public API (on globalThis.CcFillOneSelect):
 *   fillSelect(el, selector, value, mapping) => 1 | 0 | null
 *
 * Returns null if not a select element.
 *
 * See fill-one-select.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillSelect(el, selector, value, mapping) {
    if ((el.tagName || '').toLowerCase() !== 'select') return null;

    var norm = function (s) {
      return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    var v = norm(value);
    var extraValues = [];
    var mapEntry = mapping && mapping[selector];
    if (mapEntry && mapEntry.monthNum) {
      extraValues.push(mapEntry.monthNum.toString());
      if (mapEntry.monthShort) extraValues.push(mapEntry.monthShort.toLowerCase());
    }

    function findOpt(options) {
      return window.ccMatchOption
        ? window.ccMatchOption(value, options, { extraValues: extraValues })
        : null;
    }

    function applySelect(el, opt) {
      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      Array.from(el.options).forEach(function (o) { o.selected = false; });
      opt.selected = true;
      el.selectedIndex = opt.index;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
      if (nativeSetter) nativeSetter.set.call(el, opt.value);
      else el.value = opt.value;
      ['mousedown','mouseup','click','input','change'].forEach(function (ev) {
        el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch (e) {} }
      if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch (e) {} }
      try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch (e) {}
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      // Re-apply after framework reset (300ms)
      var _rv = opt.value, _ri = opt.index;
      setTimeout(function () {
        if (el.value !== _rv || el.selectedIndex !== _ri) {
          opt.selected = true; el.selectedIndex = _ri;
          if (nativeSetter) nativeSetter.set.call(el, _rv); else el.value = _rv;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 300);
      // One more delayed change
      setTimeout(function () { el.dispatchEvent(new Event('change', { bubbles: true })); }, 700);
      // DWR cascade re-apply (ServicePlus)
      setTimeout(function () {
        if (el.value !== _rv) {
          el.selectedIndex = _ri; el.value = _rv;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 3500);
      return 1;
    }

    var allOptions = Array.from(el.options);
    var opt = findOpt(allOptions);
    if (opt) return applySelect(el, opt);

    // Retry interval + AI fallback
    var attempts = 0;
    var interval = setInterval(function () {
      var allOpts = Array.from(el.options);
      var realOpts = allOpts.filter(function (o) {
        if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
        var txt = o.text.toLowerCase();
        return !txt.includes('select') && !txt.includes('choose') &&
               !txt.includes('loading') && txt !== '--';
      });
      if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
      var opt2 = findOpt(allOpts);
      if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
      if (++attempts >= 15) {
        clearInterval(interval);
        var groqKey = window._cc_groq_key || (document.body.getAttribute('data-cc-llm-key') || '');
        if (groqKey && realOpts.length > 0) {
          var optTexts = realOpts.map(function (o) { return o.text.trim(); }).join('\n');
          window.ccLLM && window.ccLLM.call({
            apiKey: groqKey,
            baseUrl: document.body.getAttribute('data-cc-llm-url') || undefined,
            model: document.body.getAttribute('data-cc-llm-model') || undefined,
            userPrompt: 'From these dropdown options, which best matches "' + value +
              '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
            maxTokens: 50,
          }).then(function (result) {
            var aiText = (result.text || '').trim();
            if (aiText) {
              var aiOpt = realOpts.find(function (o) { return o.text.trim() === aiText; }) ||
                          realOpts.find(function (o) { return o.text.trim().toLowerCase().includes(aiText.toLowerCase()); });
              if (aiOpt) applySelect(el, aiOpt);
            }
          }).catch(function () {});
        }
      }
    }, 200);
    return 1;
  }

  root.CcFillOneSelect = {
    fillSelect: fillSelect,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFillOneSelect;
