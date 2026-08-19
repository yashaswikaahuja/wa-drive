/**
 * resolve-cc-selector — CC-Style Selector Resolver
 *
 * Resolves a CyberControl selector string to a DOM element.
 * Handles three formats:
 *   form-field-N    → Nth visible form control (input/select/textarea)
 *   ng-dropdown-N   → Nth div.ng-dropdown
 *   <css selector>  → document.querySelector(selector)
 *
 * The document is injectable for testing (jsdom) and cross-frame use.
 * No Chrome API, no CcExecParts, no kernel, no fill state.
 *
 * Public API (on globalThis.CcResolveCcSelector):
 *   resolveCcSelector(selector, doc?) => Element | null
 *
 * See resolve-cc-selector.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Query string for form-field-N resolution.
   * Covers all visible form control types used on government forms.
   * Excludes input[type=hidden] intentionally.
   */
  var FORM_FIELD_QUERY = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="date"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'input:not([type])',
    'textarea',
    'select',
  ].join(',');

  /**
   * Resolve a cc-style selector to a DOM element.
   *
   * @param {string} selector
   * @param {Document} [doc] - document to query against (defaults to global document)
   * @returns {Element|null}
   */
  function resolveCcSelector(selector, doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;

    if (selector.startsWith('form-field-')) {
      var idx = parseInt(selector.slice('form-field-'.length), 10);
      var all = d.querySelectorAll(FORM_FIELD_QUERY);
      return all[idx] || null;
    }

    if (selector.startsWith('ng-dropdown-')) {
      var ngIdx = parseInt(selector.slice('ng-dropdown-'.length), 10);
      var dropdowns = d.querySelectorAll('div.ng-dropdown');
      return dropdowns[ngIdx] || null;
    }

    return d.querySelector(selector);
  }

  root.CcResolveCcSelector = {
    resolveCcSelector: resolveCcSelector,
    /** Exposed for consumers that need to build compatible form-field selectors. */
    FORM_FIELD_QUERY: FORM_FIELD_QUERY,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
