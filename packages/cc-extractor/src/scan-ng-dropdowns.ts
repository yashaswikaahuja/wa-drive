/**
 * scan-ng-dropdowns — custom framework dropdown scanner.
 * Captures Angular/ng-select, Vuetify and jQuery UI Selectmenu widgets.
 */
(function (root: any) {
  'use strict';

  var NG_TRIGGER_SEL = '.value-area, .select-type, .ng-value-container, .ng-select-container, .v-field__input, .v-select__selection, .v-field, .ui-selectmenu-button';
  var NG_CONTAINER_SEL = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, .v-select, .v-autocomplete, .v-combobox, .ui-selectmenu-button, [class*="custom-dropdown"], [class*="select-control"], [class*="-container"][class*="css-"]';

  function isAlreadyCaptured(el: any, existingFields: any, allowCapturedDescendant?: boolean) {
    return existingFields.some(function (f: any) {
      try {
        if (f._el === el) return true;
        if (el.matches && el.matches(f.selector)) return true;
        if (el.closest && el.closest(f.selector)) return true;
        // A framework wrapper can legitimately contain an input already seen by
        // the standard scanner. Do not suppress that wrapper for Vuetify roots.
        if (allowCapturedDescendant !== false && el.querySelector && el.querySelector(f.selector)) return true;
        return false;
      } catch (e) { return false; }
    });
  }

  function resolveLabel(el: any, getLabel: any) {
    var label = (getLabel(el) || el.getAttribute('aria-label') || '').trim();
    if (!label) {
      var childLabel = el.querySelector && el.querySelector(':scope > .label, :scope > label, :scope > .field-label, :scope > [class*="label"]');
      if (childLabel) label = (childLabel as any).textContent.trim();
    }
    if (!label) {
      var all = el.querySelectorAll && el.querySelectorAll('.label, .field-label, [class*="label"]');
      if (all) {
        var dl = Array.from(all).find(function (n: any) {
          return !(n.closest && n.closest('.value-area, .options-list, .ng-dropdown-panel, .dropdown-options, .v-overlay__content, .ui-selectmenu-menu'));
        });
        if (dl) label = (dl as any).textContent.trim();
      }
    }
    return (label || '').replace(/\\s+/g, ' ').trim();
  }

  function scan(doc: any, existingFields: any, helpers: any, startIdx: any) {
    var isInSkipContext = helpers.isInSkipContext;
    function blocked(el: any) {
      if (isInSkipContext(el)) return true;
      if (typeof helpers.isVisuallyPresent === 'function' && !helpers.isVisuallyPresent(el)) return true;
      return false;
    }
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 10000;
    var formFields = [];
    var labelList = [];
    var JOURNEY_RE = /\\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|city|date)\\b/i;

    // Non-input ARIA controls. Classify by the actual framework instead of
    // assuming every custom combobox is Angular Material.
    doc.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(function (el: any) {
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || blocked(el)) return;
      if (isAlreadyCaptured(el, existingFields.concat(formFields))) return;
      var meta = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
      var label = getLabel(el) || el.getAttribute('aria-label') || '';
      if (/search|query|filter/i.test(meta) && !JOURNEY_RE.test(meta + ' ' + label)) return;
      if (!isGoodLabel(label) && !JOURNEY_RE.test(meta + ' ' + label)) return;
      if (!isGoodLabel(label) && JOURNEY_RE.test(meta)) label = label || meta.replace(/[_-]+/g, ' ').trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var tagLower = String(el.tagName || '').toLowerCase();
      var isNg = tagLower === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')));
      var isVue = !!(el.closest && el.closest('.v-select, .v-autocomplete, .v-combobox')) || /v-select|v-autocomplete|v-combobox/.test(meta);
      var isJqueryUi = !!(el.closest && el.closest('.ui-selectmenu-button, .ui-selectmenu-menu')) || /ui-selectmenu/.test(meta);
      var type = isNg || isVue || isJqueryUi ? 'ng-dropdown' : 'mat-select';
      var id = el.id || ((isVue ? 'vuetify-combobox-' : isJqueryUi ? 'jqueryui-selectmenu-' : 'combobox-') + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: el.id ? (el.id.match(/^\\d/) ? '[id="' + el.id + '"]' : '#' + el.id) : '[data-cc-id="' + id + '"]',
        id: id, name: el.getAttribute('formcontrolname') || el.getAttribute('name') || '',
        value: '', placeholder: '', label: label, type: type, index: idx++, _el: el,
        options: [], optionsDynamic: true,
      });
    });

    var candidates = new Set();
    doc.querySelectorAll(NG_CONTAINER_SEL).forEach(function (el: any) { candidates.add(el); });
    doc.querySelectorAll(NG_TRIGGER_SEL).forEach(function (trigger: any) {
      var container = trigger.closest && trigger.closest('mat-form-field, .form-field, .form-group, [class*="dropdown"], [class*="select"]');
      if (!container) container = trigger.parentElement;
      if (container && container !== doc.body) candidates.add(container);
    });

    candidates.forEach(function (el: any) {
      if (blocked(el)) return;
      var isVuetify = !!(el.matches && el.matches('.v-select, .v-autocomplete, .v-combobox'));
      if (isAlreadyCaptured(el, existingFields.concat(formFields), isVuetify ? false : true)) return;
      var label = resolveLabel(el, getLabel);
      if (!isGoodLabel(label)) return;
      var ddId = 'ng-dd-' + idx;
      el.setAttribute('data-cc-id', ddId);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: '[data-cc-id="' + ddId + '"]', id: ddId,
        name: el.getAttribute('formcontrolname') || el.getAttribute('name') || '',
        value: '', placeholder: '', label: label, type: 'ng-dropdown', index: idx++, _el: el,
        options: [], optionsDynamic: true,
      });
    });
    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanNgDropdowns = { scan: scan };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScanNgDropdowns;
