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

  function isSectionHeading(s: any) {
    return /country of nationality|^nationality$|^country$/.test(norm(s));
  }

  function widgetAgrees(el: any, expected: any) {
    if (!el || !expected) return false;
    var hint = [
      el.placeholder,
      el.id,
      el.name,
      el.getAttribute && el.getAttribute('placeholder'),
      el.getAttribute && el.getAttribute('aria-label'),
    ].filter(Boolean).join(' ').toLowerCase();
    if (/date of birth|\bdob\b|birth date/.test(expected)) {
      return /date|birth|dob|dd\s*[\/\-.]\s*mm|datebirth|effectivedate/.test(hint);
    }
    if (/father/.test(expected)) return /father|pita/.test(hint);
    if (/mother/.test(expected)) return /mother|mata/.test(hint);
    return false;
  }

  function compact(s: any) {
    return norm(s).replace(/\s+/g, '');
  }

  function isDobish(s: any) {
    return /date of birth|birth date|\bdob\b|date birth/.test(String(s || ''));
  }

  function matches(el: any, expectedLabel: any, readLabel?: any) {
    var expected = norm(expectedLabel);
    if (!expected) return true;
    var liveRaw = readVisualLabel(el, readLabel);
    var live = norm(liveRaw);
    if (!live) return true;
    if (live === expected) return true;
    if (compact(live) === compact(expected)) return true;
    // Fieldset heading steal: planned "Re-type Date Of Birth" vs live "Country Of Nationality".
    if (isSectionHeading(liveRaw) && widgetAgrees(el, expected)) return true;
    if (isDobish(expected) && isDobish(live)) return true;
    return false;
  }

  root.CcLabelStillMatches = { matches: matches, norm: norm, read: readVisualLabel };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcLabelStillMatches;
