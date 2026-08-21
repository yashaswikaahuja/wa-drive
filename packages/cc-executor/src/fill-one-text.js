/**
 * fill-one-text — Text / Keystroke Fill Handler
 *
 * Fills text inputs and textareas. Primary path uses window.keystrokeFillSync
 * (mimics real typing). Legacy fallback uses native value-set + event dispatch.
 *
 * Also handles the ServicePlus/RTPS Bihar pattern: after filling a fullName
 * field, fills the paired Hindi sibling via Google Transliteration API if the
 * site's own transliteration doesn't fire within 500ms.
 *
 * All browser globals are read at call time (not injected) since this
 * capability runs exclusively in the browser extension context.
 *
 * Public API (on globalThis.CcFillOneText):
 *   fillText(el, value) => 1 | 0
 *
 * See fill-one-text.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Fill a text input or textarea element.
   *
   * @param {Element} el     — target input or textarea
   * @param {string}  value  — value to fill
   * @returns {1|0}  1 = filled, 0 = failed
   */
  function fillText(el, value) {
    var isTextarea = el.tagName === 'TEXTAREA';
    var niv = isTextarea
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

    // PRIMARY PATH: keystroke-style fill
    if (typeof window.keystrokeFillSync === 'function') {
      var ok = window.keystrokeFillSync(el, value);

      // ServicePlus / RTPS Bihar: fill paired Hindi sibling if site doesn't
      if (el.getAttribute && el.getAttribute('data-type') === 'fullName') {
        var allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
        var idx = allInputs.indexOf(el);
        var next = allInputs[idx + 1];
        if (next && next.getAttribute('data-type') === 'text') {
          setTimeout(function () {
            if (next.value && next.value.length > 0) return; // site filled it
            var fillHindi = function (hindiVal) {
              if (typeof window.keystrokeFillSync === 'function') window.keystrokeFillSync(next, hindiVal);
            };
            fetch('https://inputtools.google.com/request?text=' + encodeURIComponent(value) +
              '&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var hindi = d && d[1] && d[1][0] && d[1][0][1] && d[1][0][1][0];
                fillHindi(hindi || value);
              })
              .catch(function () { fillHindi(value); });
          }, 500);
        }
      }

      return ok ? 1 : 0;
    }

    // LEGACY FALLBACK: value-set + event dispatch
    el.focus();
    if (niv) niv.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
    return 1;
  }

  root.CcFillOneText = {
    fillText: fillText,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFillOneText;
