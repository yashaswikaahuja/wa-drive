/**
 * form-context — Form guard + element skip + label helpers
 *
 * Three helpers used by every extractor scan pass:
 *
 *   isInSkipContext(el)           — true if el is inside nav/header/footer/banner
 *                                   (role=search allowed when journey-like — #311)
 *   isGoodLabel(s, ccDomUtils)    — true if label is non-empty, meaningful, min 2 chars
 *   hasFormContext(doc, ccDomUtils) — true if page has a <form> OR 2+ labeled inputs
 *                                   (includes journey search widgets — #311)
 *
 * ccDomUtils is injected (not read from window) so the functions are testable in Node.
 *
 * Public API (on globalThis.CcFormContext):
 *   isInSkipContext(el)
 *   isGoodLabel(s, ccDomUtils)
 *   hasFormContext(doc, ccDomUtils)
 *   isJourneyLike(el, labelHint)
 *
 * See docs/form-context.md for full documentation.
 */
(function (root) {
  'use strict';

  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;

  /**
   * True if element looks like a travel From/To/date widget (OTA search strips).
   */
  function isJourneyLike(el, labelHint) {
    if (!el) return false;
    var blob = [
      labelHint || '',
      el.getAttribute && el.getAttribute('aria-label'),
      el.getAttribute && el.getAttribute('placeholder'),
      el.placeholder,
      el.id,
      el.name,
      typeof el.className === 'string' ? el.className : '',
      el.getAttribute && el.getAttribute('data-testid'),
    ].filter(Boolean).join(' ');
    return JOURNEY_RE.test(blob);
  }

  /**
   * Returns true if el is inside a navigation/header/footer/banner context.
   * Site chrome is never part of a form worth filling.
   * Exception (#311): [role=search] is allowed when the widget looks like
   * a journey From/To/date control (redBus / Cleartrip / IRCTC search strips).
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isInSkipContext(el) {
    if (!el || !el.closest) return false;
    if (el.closest('nav,header,footer,[role="navigation"],[role="banner"]')) return true;
    var searchHost = el.closest('[role="search"]');
    if (!searchHost) return false;
    // Allow journey search widgets inside role=search
    if (isJourneyLike(el) || isJourneyLike(searchHost)) return false;
    return true;
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
   * Requires either a <form> element OR at least 2 labeled visible inputs
   * (including type=search / combobox journey widgets — #311).
   *
   * @param {Document} doc
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function hasFormContext(doc, ccDomUtils) {
    const forms = doc.querySelectorAll('form');
    if (forms.length > 0) return true;
    // No <form> tag — check for 2+ labeled inputs (some govt sites don't use <form>)
    // Include type=search for OTA journey strips (#311).
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],input[type="search"],input[type="date"],input:not([type]),textarea,[role="combobox"]'
    );
    let labeled = 0;
    inputs.forEach(function (el) {
      if (isInSkipContext(el)) return;
      const lbl = ccDomUtils && typeof ccDomUtils.getLabel === 'function'
        ? ccDomUtils.getLabel(el)
        : (el.getAttribute && el.getAttribute('aria-label')) || el.placeholder || '';
      if (lbl || isJourneyLike(el, lbl)) labeled++;
    });
    return labeled >= 2;
  }

  root.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext, isJourneyLike };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : root).CcFormContext;
}
