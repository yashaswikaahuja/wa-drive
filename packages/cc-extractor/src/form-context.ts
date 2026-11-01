/**
 * form-context — Form guard + element skip + label helpers
 *
 * Three helpers used by every extractor scan pass:
 *
 *   isInSkipContext(el)           — true if el is inside nav/header/footer/banner
 *                                   (role=search allowed when journey-like — #311)
 *   isGoodLabel(s, ccDomUtils)    — true if label is non-empty, meaningful, min 2 chars
 *   hasFormContext(doc, ccDomUtils) — true if page has a <form> OR 1+ labeled
 *                                   fillable control (select, number, checkbox, radio, combobox)
 *
 * ccDomUtils is injected (not read from window) so the functions are testable in Node.
 *
 * Public API (on (globalThis as any).CcFormContext):
 *   isInSkipContext(el)
 *   isGoodLabel(s, ccDomUtils)
 *   hasFormContext(doc, ccDomUtils)
 *   isJourneyLike(el, labelHint)
 *
 * See docs/form-context.md for full documentation.
 */
(function (root: any) {
  'use strict';

  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;

  /**
   * True if element looks like a travel From/To/date widget (OTA search strips).
   */
  function isJourneyLike(el: any, labelHint?: any) {
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
  /**
   * True when the operator can see this control.
   * A node with no box API is a Node test stub and is kept.
   * A real element must have a paintable box, not be hidden, and not sit under another layer.
   * A box below the viewport stays, because the operator can scroll to it.
   */
  function hitsControl(el: any, top: any) {
    if (!top) return false;
    if (top === el) return true;
    if (el.contains && el.contains(top)) return true;
    if (top.contains && top.contains(el)) return true;
    var id = el.id;
    if (id && top.getAttribute && top.getAttribute('for') === id) return true;
    if (id && top.closest && top.closest('label[for="' + id + '"]')) return true;
    return false;
  }

  function isVisuallyPresent(el: any, view?: any) {
    if (!el) return false;
    if (typeof el.getBoundingClientRect !== 'function') return true;
    var box = el.getBoundingClientRect();
    if (!box || box.width < 2 || box.height < 2) return false;
    if (typeof el.getClientRects === 'function') {
      var rects = el.getClientRects();
      if (!rects || rects.length === 0) return false;
    }
    if (el.closest) {
      if (el.closest('[hidden]')) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      var details = el.closest('details');
      if (details && !details.open) return false;
    }
    var getStyle = (view && view.getComputedStyle) || (typeof window !== 'undefined' && window.getComputedStyle);
    if (typeof getStyle === 'function') {
      var style = getStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden' || String(style.opacity) === '0')) return false;
    }
    var hit = view && view.elementFromPoint;
    var iw = view && view.innerWidth;
    var ih = view && view.innerHeight;
    if (typeof hit !== 'function' && typeof document !== 'undefined' && document.elementFromPoint) {
      hit = function (x: any, y: any) { return document.elementFromPoint(x, y); };
      iw = window.innerWidth;
      ih = window.innerHeight;
    }
    if (typeof hit === 'function' && iw && ih) {
      var cx = box.left + box.width / 2;
      var cy = box.top + box.height / 2;
      var inView = cx >= 0 && cy >= 0 && cx <= iw && cy <= ih;
      var top = inView ? hit(cx, cy) : null;
      if (inView && !hitsControl(el, top) && !isAdCover(top, el)) return false;
    }
    return true;
  }

  function isAdCover(top: any, el: any) {
    if (!top || top === el) return false;
    var node = top;
    var hops = 0;
    while (node && hops < 6) {
      var tag = String(node.tagName || '').toLowerCase();
      if (tag === 'iframe' || tag === 'ins') return true;
      var blob = ((node.id || '') + ' ' + (typeof node.className === 'string' ? node.className : '')).toLowerCase();
      if (/adplus|adsbygoogle|google_ads|google_vignette|ad-overlay|ad_overlay/.test(blob)) return true;
      node = node.parentElement;
      hops += 1;
    }
    return false;
  }

  function isInSkipContext(el: any) {
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
  function isGoodLabel(s: any, ccDomUtils: any) {
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
   * Requires either a <form> element OR at least one labeled visible control
   * (text, select, number, checkbox, radio, combobox — #349).
   *
   * @param {Document} doc
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function hasFormContext(doc: any, ccDomUtils: any) {
    const forms = doc.querySelectorAll('form');
    if (forms.length > 0) return true;
    // No <form> tag — one labeled control is enough (DemoQA / The Internet, #349)
    // Include type=search for OTA journey strips (#311).
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],input[type="search"],input[type="date"],input[type="number"],input:not([type]),textarea,select,input[type="checkbox"],input[type="radio"],[role="combobox"],[role="checkbox"],[role="radio"]'
    );
    let labeled = 0;
    inputs.forEach(function (el: any) {
      if (isInSkipContext(el)) return;
      const lbl = ccDomUtils && typeof ccDomUtils.getLabel === 'function'
        ? ccDomUtils.getLabel(el)
        : (el.getAttribute && el.getAttribute('aria-label')) || el.placeholder || '';
      if (lbl || isJourneyLike(el, lbl) || (el.tagName && String(el.tagName).toLowerCase() === 'select') || el.type === 'number') labeled++;
    });
    return labeled >= 1;
  }

  root.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext, isJourneyLike, isVisuallyPresent };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : root).CcFormContext;
}
