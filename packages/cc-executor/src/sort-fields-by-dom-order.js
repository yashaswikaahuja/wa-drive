/**
 * sort-fields-by-dom-order — Fill Entry DOM Order Sorter
 *
 * Sorts an array of [selector, fieldData] fill entries into the visual
 * top-to-bottom order they appear in the page.
 *
 * This ensures fields are filled in the order the form's own validation
 * expects — typically top to bottom as laid out in the DOM.
 *
 * No kernel, no CcExecParts, no Chrome APIs, no cascade knowledge.
 * The resolver function is injected so this capability is testable without a
 * real browser document.
 *
 * Public API (on globalThis.CcSortFieldsByDomOrder):
 *   sortFieldsByDomOrder(entries, resolveEl) => entries (sorted in place)
 *
 * See sort-fields-by-dom-order.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Sort fill entries in DOM top-to-bottom order.
   *
   * Uses compareDocumentPosition to determine which of two elements appears
   * earlier in the document. Entries whose selectors resolve to null (element
   * not present) are sorted to the end with their relative order preserved.
   *
   * Sorts the array in place and also returns it.
   *
   * @param {Array<[string, object]>} entries
   *   Array of [selector, fieldData] pairs from the fill mapping.
   *
   * @param {function(string): Element|null} resolveEl
   *   Function that turns a selector string into a DOM element.
   *   Should be CcResolveCcSelector.resolveCcSelector or equivalent.
   *
   * @returns {Array<[string, object]>} The same array, sorted in place.
   */
  function sortFieldsByDomOrder(entries, resolveEl) {
    if (!Array.isArray(entries) || entries.length < 2) return entries;
    var FOLLOWING = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) || 4;
    entries.sort(function (pairA, pairB) {
      var a = resolveEl(pairA[0]);
      var b = resolveEl(pairB[0]);
      if (!a || !b) return 0;        // one or both not in DOM — preserve order
      if (a === b) return 0;          // same element
      if (typeof a.compareDocumentPosition !== 'function') return 0;
      return a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1;
    });
    return entries;
  }

  root.CcSortFieldsByDomOrder = {
    sortFieldsByDomOrder: sortFieldsByDomOrder,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcSortFieldsByDomOrder;
