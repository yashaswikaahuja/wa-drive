/**
 * scan-mat-widgets — Angular Material widget scanner
 *
 * Scans mat-select, mat-checkbox, mat-radio-button elements not captured
 * by the standard input scan. Assigns data-cc-id when no id is present.
 *
 * Public API (on globalThis.CcScanMatWidgets):
 *   scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }
 *
 * helpers: { isInSkipContext, getLabel, isGoodLabel }
 * startIdx: index counter to continue from (avoids collisions with standard scan)
 *
 * See docs/scan-mat-widgets.md for full documentation.
 */
(function (root) {
  'use strict';

  function makeSelector(el, fallbackId) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[data-cc-id="' + fallbackId + '"]';
  }

  function isAlreadyCaptured(el, existingFields) {
    var sel = el.id
      ? (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id)
      : (el.name ? '[name="' + el.name + '"]' : null);
    if (!sel) return false;
    return existingFields.some(function (f) { return f.selector === sel; });
  }

  /**
   * @param {Document} doc
   * @param {Array} existingFields — already-captured fields (to avoid double-capture)
   * @param {{ isInSkipContext, getLabel, isGoodLabel }} helpers
   * @param {number} startIdx — starting index (default 10000)
   * @returns {{ formFields: Array, labelList: Array }}
   */
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 10000;
    var formFields = [];
    var labelList = [];

    // ── mat-select and mat-form-field select ──
    doc.querySelectorAll('mat-select,mat-form-field select').forEach(function (el) {
      if (isInSkipContext(el)) return;
      if (el.tagName === 'SELECT' && isAlreadyCaptured(el, existingFields)) return;
      var label = getLabel(el) || el.getAttribute('aria-label') || '';
      if (!isGoodLabel(label)) return;
      var id = el.id || ('mat-select-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      var type = el.tagName === 'SELECT' ? 'select' : 'mat-select';
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: makeSelector(el, id),
        id: id,
        name: el.getAttribute('formcontrolname') || el.name || '',
        value: '', placeholder: '', label: label, type: type, index: idx++, _el: el,
      });
    });

    // ── mat-checkbox ──
    doc.querySelectorAll('mat-checkbox').forEach(function (el) {
      if (isInSkipContext(el)) return;
      var label = getLabel(el) || el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var id = el.id || ('mat-cb-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      formFields.push({
        selector: makeSelector(el, id),
        id: id, name: '', value: '', placeholder: '',
        label: label, type: 'mat-checkbox', index: idx++, _el: el,
      });
    });

    // ── mat-radio-button ──
    doc.querySelectorAll('mat-radio-button').forEach(function (el) {
      if (isInSkipContext(el)) return;
      var label = el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var group = el.closest('mat-radio-group');
      var name = el.getAttribute('name') || (group && group.getAttribute('formcontrolname')) || '';
      var id = el.id || ('mat-rb-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      formFields.push({
        selector: makeSelector(el, id),
        id: id, name: name, value: label, placeholder: '',
        label: label, type: 'mat-radio', index: idx++, _el: el,
      });
    });

    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanMatWidgets = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScanMatWidgets;
