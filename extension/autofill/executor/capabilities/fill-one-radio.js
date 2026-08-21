/**
 * fill-one-radio — Radio, Checkbox, and File Fill Handlers
 *
 * Handles: radio (name-group match), radio-click (direct), radio-group
 * (normalised match with gender synonyms), checkbox (boolean-like values),
 * file input (base64 path only; URL fetch handled in sequential loop).
 *
 * Public API (on globalThis.CcFillOneRadio):
 *   fillRadio(el, selector, value, type, elType, filledBySource) => 1 | 0 | null
 *
 * Returns null for unrecognised types (pass-through for handler chain).
 *
 * See fill-one-radio.md for full documentation.
 */
(function (root) {
  'use strict';

  var NORM = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim(); };

  function fillRadio(el, selector, value, type, elType, filledBySource) {
    // ── radio-click: direct click on a radio input ────────────────────────────
    if (type === 'radio-click') {
      var target = (el.type === 'radio') ? el : (el.querySelector && el.querySelector('input[type="radio"]')) || el;
      target.focus();
      target.checked = true;
      ['click', 'change'].forEach(function (ev) {
        target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      return 1;
    }

    // ── radio-group: find matching radio by value/label + gender synonyms ─────
    if (type === 'radio-group' && elType === 'radio' && el.name) {
      var vR0 = NORM(value);
      var radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var match = Array.from(radios).find(function (r) {
        if (NORM(r.value) === vR0) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : '';
        if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
        // Gender synonyms
        var wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
        var wantMale   = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
        if (wantFemale && /female|महिला|स्त्री/.test((lbl && lbl.textContent) || r.value)) return true;
        if (wantMale   && /male|पुरुष/.test((lbl && lbl.textContent) || r.value) &&
            !/female/.test((lbl && lbl.textContent) || '')) return true;
        return false;
      });
      if (match) {
        match.focus();
        match.checked = true;
        ['click', 'change'].forEach(function (ev) {
          match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        return 1;
      }
      return 0;
    }

    // ── DOM radio: name-group match by value/label ────────────────────────────
    if (elType === 'radio') {
      var vR = NORM(value);
      var radiosDOM = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var matchDOM = Array.from(radiosDOM).find(function (r) {
        if (NORM(r.value) === vR) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : '';
        return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
      });
      if (matchDOM) {
        matchDOM.focus();
        matchDOM.checked = true;
        ['click', 'change'].forEach(function (ev) {
          matchDOM.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        matchDOM.dispatchEvent(new Event('blur', { bubbles: true }));
        return 1;
      }
      return null; // pass to next handler
    }

    // ── checkbox ──────────────────────────────────────────────────────────────
    if (elType === 'checkbox') {
      var booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
      if (!booleanLike.includes(value.toLowerCase())) return 0; // non-boolean value skipped
      var truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
      if (truthy !== el.checked) {
        el.checked = truthy;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      }
      return 1;
    }

    // ── file (base64 only; URL fetch handled in sequential loop) ──────────────
    if (el.type === 'file') {
      if (!value) return 0;
      if (value.startsWith('data:')) {
        try {
          var parts  = value.split(',');
          var meta   = parts[0];
          var b64    = parts[1];
          var mime   = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
          var ext    = mime.split('/')[1] || 'bin';
          var fBys   = filledBySource || {};
          var label  = (fBys[selector] && fBys[selector].label) || 'file';
          var fileName = label.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
          var binary = atob(b64);
          var bytes  = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          var file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 1;
        } catch (e) { return 0; }
      }
      if (value.startsWith('http://') || value.startsWith('https://')) return 0; // deferred
      return 0;
    }

    return null;
  }

  root.CcFillOneRadio = {
    fillRadio: fillRadio,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
