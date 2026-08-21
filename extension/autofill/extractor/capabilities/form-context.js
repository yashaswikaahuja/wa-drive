/**
 * form-context — Form guard + element skip + label helpers
 *
 * Three helpers used by every extractor scan pass:
 *
 *   isInSkipContext(el)           — true if el is inside nav/header/footer/search/banner
 *   isGoodLabel(s, ccDomUtils)    — true if label is non-empty, meaningful, min 2 chars
 *   hasFormContext(doc, ccDomUtils) — true if page has a <form> OR 2+ labeled inputs
 *
 * ccDomUtils is injected (not read from window) so the functions are testable in Node.
 *
 * Public API (on globalThis.CcFormContext):
 *   isInSkipContext(el)
 *   isGoodLabel(s, ccDomUtils)
 *   hasFormContext(doc, ccDomUtils)
 *
 * See docs/form-context.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Returns true if el is inside a navigation/header/footer/search/banner context.
   * These containers are never part of a form worth filling.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isInSkipContext(el) {
    return !!(el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
  }

  /**
   * Returns true if label string is non-empty, not just symbols, and at least 2 chars.
   * Delegates to ccDomUtils.isGoodLabel when available, falls back to inline check.
   *
   * @param {string} s
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function isGoodLabel(s, ccDomUtils) {
    if (ccDomUtils && typeof ccDomUtils.isGoodLabel === 'function') {
      return ccDomUtils.isGoodLabel(s);
    }
    // Inline fallback
    if (!s || typeof s !== 'string') return false;
    const t = s.trim();
    return t.length >= 2 && /[a-zA-Z0-9]/.test(t);
  }

  /**
   * Returns true if the page has a real form worth scanning.
   * Requires either a <form> element OR at least 2 labeled visible inputs.
   *
   * @param {Document} doc
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function hasFormContext(doc, ccDomUtils) {
    const forms = doc.querySelectorAll('form');
    if (forms.length > 0) return true;
    // No <form> tag — check for 2+ labeled inputs (some govt sites don't use <form>)
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],textarea'
    );
    let labeled = 0;
    inputs.forEach(function (el) {
      if (!isInSkipContext(el)) {
        const lbl = ccDomUtils && typeof ccDomUtils.getLabel === 'function'
          ? ccDomUtils.getLabel(el)
          : el.placeholder || '';
        if (lbl) labeled++;
      }
    });
    return labeled >= 2;
  }

  root.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext };

})(typeof globalThis !== 'undefined' ? globalThis : this);
