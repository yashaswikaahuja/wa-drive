/**
 * sort-fields-visual — Visual position sort for form fields
 *
 * Sorts formFields[] by true rendered position using getBoundingClientRect.
 * Fields within ROW_BAND (8px) vertically are treated as the same row and
 * sorted left-to-right within that row. Unrendered / display:none fields
 * (width=0, height=0, top=0, left=0) are sent to the end.
 *
 * Reassigns .index after sort. Requires _el references to be present.
 * _el refs are stripped by the fingerprint step after this runs.
 *
 * Public API (on globalThis.CcSortFieldsVisual):
 *   sort(formFields) — mutates in-place, reassigns .index, returns formFields
 *
 * See docs/sort-fields-visual.md for full documentation.
 */
(function (root) {
  'use strict';

  var ROW_BAND = 8; // px — fields within this vertical distance are the same row

  function visualPos(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return { row: 1e9, left: 1e9 };
    }
    var r = el.getBoundingClientRect();
    var top = r.top + ((typeof window !== 'undefined' && window.pageYOffset) || 0);
    var left = r.left + ((typeof window !== 'undefined' && window.pageXOffset) || 0);
    // Unrendered / display:none → send to end
    if (r.width === 0 && r.height === 0 && top === 0 && left === 0) {
      return { row: 1e9, left: 1e9 };
    }
    return { row: Math.round(top / ROW_BAND), left: Math.round(left) };
  }

  /**
   * Sort formFields by visual position (top-to-bottom, left-to-right).
   * Mutates the array in-place and reassigns .index.
   *
   * @param {Array} formFields
   * @returns {Array} formFields (same reference)
   */
  function sort(formFields) {
    formFields.forEach(function (f) { f._pos = visualPos(f._el); });
    formFields.sort(function (a, b) {
      return (a._pos.row - b._pos.row) || (a._pos.left - b._pos.left);
    });
    formFields.forEach(function (f, i) { f.index = i; delete f._pos; });
    return formFields;
  }

  root.CcSortFieldsVisual = { sort: sort, ROW_BAND: ROW_BAND };

})(typeof globalThis !== 'undefined' ? globalThis : this);
