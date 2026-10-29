/**
 * label-still-matches — refuse a write when the visible label changed.
 *
 * The plan is bound to the label the operator could see. name/id stay the
 * DOM handle. If that label is now different, the page moved and the value
 * must not be written.
 *
 * Public API (on globalThis.CcLabelStillMatches):
 *   matches(el, expectedLabel, readLabel?) => boolean
 */
(function (root: any) {
  'use strict';

  function norm(s: any) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function readVisualLabel(el: any, readLabel: any) {
    if (typeof readLabel === 'function') return readLabel(el) || '';
    var utils = typeof window !== 'undefined' && (window as any).ccDomUtils;
    if (utils && typeof utils.getLabel === 'function') return utils.getLabel(el) || '';
    if (!el) return '';
    var aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return String(aria).trim();
    return String(el.placeholder || '').trim();
  }

  function matches(el: any, expectedLabel: any, readLabel?: any) {
    var expected = norm(expectedLabel);
    if (!expected) return true;
    var live = norm(readVisualLabel(el, readLabel));
    if (!live) return true;
    return live === expected;
  }

  root.CcLabelStillMatches = { matches: matches, norm: norm, read: readVisualLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcLabelStillMatches;
