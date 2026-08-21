/**
 * scan-ng-dropdowns — ng-select / combobox / custom dropdown scanner
 *
 * Captures Angular ng-select and custom dropdown widgets not covered by
 * the standard input scan or mat-widget scan. Two strategies:
 *
 *   1. role=combobox / role=listbox (non-input, non-search)
 *   2. Explicit ng-select containers + trigger-based indirect detection
 *      (.value-area, .ng-value-container, .ng-select-container)
 *      Used by SSC/RRB/NTA forms where id="dropsection" is reused for ALL dropdowns.
 *
 * Assigns unique data-cc-id (ng-dd-N) to force unique selectors.
 * Skips elements already captured in existingFields.
 *
 * Public API (on globalThis.CcScanNgDropdowns):
 *   scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }
 *
 * See docs/scan-ng-dropdowns.md for full documentation.
 */
(function (root) {
  'use strict';

  var NG_TRIGGER_SEL = '.value-area, .select-type, .ng-value-container, .ng-select-container';
  var NG_CONTAINER_SEL = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, [class*="custom-dropdown"], [class*="select-control"]';

  function isAlreadyCaptured(el, existingFields) {
    return existingFields.some(function (f) {
      try {
        if (el.matches && el.matches(f.selector)) return true;
        if (el.querySelector && el.querySelector(f.selector)) return true;
        if (el.closest && el.closest(f.selector)) return true;
        return false;
      } catch (e) { return false; }
    });
  }

  function resolveLabel(el, getLabel) {
    var label = (getLabel(el) || el.getAttribute('aria-label') || '').trim();
    if (!label) {
      var childLabel = el.querySelector && el.querySelector(
        ':scope > .label, :scope > label, :scope > .field-label, :scope > [class*="label"]'
      );
      if (childLabel) label = childLabel.textContent.trim();
    }
    if (!label) {
      var all = el.querySelectorAll && el.querySelectorAll('.label, .field-label, [class*="label"]');
      if (all) {
        var dl = Array.from(all).find(function (n) {
          return !(n.closest && n.closest('.value-area, .options-list, .ng-dropdown-panel, .dropdown-options'));
        });
        if (dl) label = dl.textContent.trim();
      }
    }
    return (label || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {Document} doc
   * @param {Array} existingFields
   * @param {{ isInSkipContext, getLabel, isGoodLabel }} helpers
   * @param {number} startIdx
   * @returns {{ formFields: Array, labelList: Array }}
   */
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 10000;
    var formFields = [];
    var labelList = [];

    // ── role=combobox / role=listbox ──
    doc.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(function (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      if (isInSkipContext(el)) return;
      var meta = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
      if (/search|query|filter/i.test(meta)) return;
      var label = getLabel(el) || el.getAttribute('aria-label') || '';
      if (!isGoodLabel(label)) return;
      var tagLower = el.tagName.toLowerCase();
      var isNg = tagLower === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')));
      var type = isNg ? 'ng-dropdown' : 'mat-select';
      var id = el.id || ('combobox-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: el.id ? (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id) : '[data-cc-id="' + id + '"]',
        id: id, name: el.getAttribute('formcontrolname') || '',
        value: '', placeholder: '', label: label, type: type, index: idx++, _el: el,
      });
    });

    // ── ng-select / custom dropdown containers ──
    var ngCandidates = new Set();
    doc.querySelectorAll(NG_CONTAINER_SEL).forEach(function (el) { ngCandidates.add(el); });
    doc.querySelectorAll(NG_TRIGGER_SEL).forEach(function (trigger) {
      var container = trigger.closest && trigger.closest(
        'mat-form-field, .form-field, .form-group, [class*="dropdown"], [class*="select"]'
      );
      if (!container) container = trigger.parentElement;
      if (container && container !== doc.body) ngCandidates.add(container);
    });

    ngCandidates.forEach(function (el) {
      if (isInSkipContext(el)) return;
      if (isAlreadyCaptured(el, existingFields.concat(formFields))) return;
      var label = resolveLabel(el, getLabel);
      if (!isGoodLabel(label)) return;
      var ddId = 'ng-dd-' + idx;
      el.setAttribute('data-cc-id', ddId);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: '[data-cc-id="' + ddId + '"]',
        id: ddId,
        name: el.getAttribute('formcontrolname') || el.getAttribute('name') || '',
        value: '', placeholder: '', label: label, type: 'ng-dropdown', index: idx++, _el: el,
      });
    });

    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanNgDropdowns = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);
