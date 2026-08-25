// ── shared/select-apply.js ─────────────────────────────────────────────────
// Single source of truth for applying a native <select> option with full event
// dispatch compatibility (ASP.NET, DWR/ServicePlus, jQuery, Angular).
//
// Exposes: window.ccApplySelect(el, opt)
//
// Used by: executor.js, cascade-select.js
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  /**
   * Apply a selected option to a native <select> element with full framework
   * compatibility. Handles:
   * - Native value setter (bypasses React/Angular interception)
   * - Full event sequence (mousedown → mouseup → click → input → change)
   * - ASP.NET onchange handler direct invocation
   * - jQuery .trigger('change') for ServicePlus/DWR
   * - propertychange for legacy IE-compat portals
   * - DWR cascade re-apply after 3.5s (ServicePlus resets dependent selects)
   *
   * @param {HTMLSelectElement} el - The select element
   * @param {HTMLOptionElement} opt - The option to select
   * @returns {boolean} true
   */
  function ccApplySelect(el, opt) {
    el.focus();
    el.dispatchEvent(new Event('focus', { bubbles: true }));

    // Step 1: Mark the option directly
    Array.from(el.options).forEach(function (o) { o.selected = false; });
    opt.selected = true;
    el.selectedIndex = opt.index;

    // Step 2: Sync via native setter (bypasses framework interceptors)
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
    if (nativeSetter) nativeSetter.set.call(el, opt.value);
    else el.value = opt.value;

    // Step 3: Full event sequence
    ['mousedown', 'mouseup', 'click', 'input', 'change'].forEach(function (ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
    });

    // Step 4: ASP.NET onchange handler (some portals bind directly)
    if (typeof el.onchange === 'function') {
      try { el.onchange.call(el, new Event('change')); } catch (e) {}
    }

    // Step 5: jQuery trigger (ServicePlus, DWR cascading selects)
    if (typeof $ !== 'undefined') {
      try { $(el).trigger('change'); } catch (e) {}
    }

    // Step 6: propertychange for old ASP.NET/IE compat
    try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch (e) {}

    el.dispatchEvent(new Event('blur', { bubbles: true }));

    // Step 7: DWR re-apply after 3.5s (ServicePlus resets dependent selects)
    var _rv = opt.value;
    var _ri = opt.index;
    setTimeout(function () {
      if (el.value !== _rv) {
        el.selectedIndex = _ri;
        el.value = _rv;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 3500);

    return true;
  }

  window.ccApplySelect = ccApplySelect;
})();
