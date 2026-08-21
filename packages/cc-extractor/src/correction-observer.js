/**
 * correction-observer — Post-fill correction + enrichment listeners
 *
 * Two listeners installed after autofill completes:
 *
 * 1. Correction listener (filled fields):
 *    Watches each autofilled field for 'change' events. When the user
 *    changes a value, finds the matching profile key and POSTs a correction
 *    to the backend (/mappings/:formKey) after a 1500ms debounce.
 *    Saves pending corrections to sessionStorage._cc_corrections.
 *
 * 2. Enrichment listener (unfilled fields):
 *    Watches unfilled inputs for 'blur' events. If the user fills a field
 *    the extension missed, validates it (dob/pincode/mobile/aadhaar/name)
 *    and saves to sessionStorage._cc_enrichments.
 *
 * Public API (on globalThis.CcCorrectionObserver):
 *   inject(mapping, filledBySource, profile, backendUrl, formKey, doc?)
 *
 * See docs/correction-observer.md for full documentation.
 */
(function (root) {
  'use strict';

  var SKIP_LABELS_RE = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  var SKIP_TYPES = ['select', 'checkbox', 'radio', 'hidden', 'submit', 'button'];

  var SEMANTIC_ALIASES = {
    'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
    'date of birth': 'dob', 'fathers name': 'father_name', 'mothers name': 'mother_name',
    'aadhaar no': 'aadhaar_number', 'mobile no': 'mobile', 'email id': 'email',
    'pin code': 'pincode', 'permanent address': 'address',
  };

  function resolveEl(selector, doc) {
    if (selector.startsWith('form-field-')) {
      var i = parseInt(selector.split('-')[2]);
      var all = doc.querySelectorAll('input,select,textarea');
      return all[i] || null;
    }
    return doc.querySelector(selector);
  }

  function makeSelectorFromEl(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[name="' + el.name + '"]';
  }

  function getLabelForEl(el, doc) {
    if (el.id) {
      var l = doc.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent.trim();
    }
    var td = el.closest && el.closest('td');
    if (td && td.previousElementSibling) return td.previousElementSibling.textContent.trim();
    return el.placeholder || '';
  }

  function isValidValue(semanticKey, val) {
    if (semanticKey === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
    if (semanticKey === 'pincode') return /^\d{6}$/.test(val);
    if (semanticKey === 'mobile') return /^\d{10}$/.test(val);
    if (semanticKey === 'aadhaar_number') return /^\d{12}$/.test(val);
    if (['name', 'father_name', 'mother_name'].includes(semanticKey)) return /^[a-zA-Z\s.]{2,60}$/.test(val);
    return val.length >= 2 && val.length <= 200;
  }

  /**
   * Install correction + enrichment listeners on the page.
   *
   * @param {object} mapping        — { selector: { value, ... } }
   * @param {object} filledBySource — { selector: { semanticKey, profileKey, ... } }
   * @param {object} profile        — { profileKey: value }
   * @param {string} backendUrl     — backend base URL (may be null/empty)
   * @param {string} formKey        — form identifier
   * @param {Document} [doc]        — defaults to globalThis.document
   */
  function inject(mapping, filledBySource, profile, backendUrl, formKey, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    var corrections = [];
    var enrichments = [];

    // ── Correction listener (filled fields) ──
    for (var selector in mapping) {
      try {
        var entry = mapping[selector];
        var originalValue = entry.value;
        var info = filledBySource[selector];
        if (!info) continue;
        var el = resolveEl(selector, doc);
        if (!el) continue;

        (function (el, originalValue, info) {
          el.addEventListener('change', function () {
            var newVal = el.value;
            if (newVal === originalValue) return;
            var correctedKey = null;
            for (var k in profile) {
              if (profile[k] === newVal) { correctedKey = k; break; }
            }
            if (!correctedKey) {
              if (typeof console !== 'undefined') console.debug('[CC] correction: no profileKey for value', newVal);
              return;
            }
            var already = corrections.some(function (c) {
              return c.semanticKey === info.semanticKey && c.newKey === correctedKey;
            });
            if (already) return;
            corrections.push({ semanticKey: info.semanticKey, oldKey: info.profileKey, newKey: correctedKey });
            try { sessionStorage.setItem('_cc_corrections', JSON.stringify(corrections)); } catch (e) {}
            if (!backendUrl || !formKey) return;
            clearTimeout(el._ccTimer);
            el._ccTimer = setTimeout(function () {
              var pending = [];
              try { pending = JSON.parse(sessionStorage.getItem('_cc_corrections') || '[]'); } catch (e) {}
              var updates = {};
              pending.forEach(function (c) {
                if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
              });
              if (!Object.keys(updates).length) return;
              fetch(backendUrl + '/mappings/' + formKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: updates, formKey: formKey }),
              }).then(function () {
                try { sessionStorage.removeItem('_cc_corrections'); } catch (e) {}
              }).catch(function (e) {
                if (typeof console !== 'undefined') console.warn('[CC] correction save failed', e);
              });
            }, 1500);
          });
        }(el, originalValue, info));
      } catch (e) { /* skip */ }
    }

    // ── Enrichment listener (unfilled fields) ──
    doc.querySelectorAll('input,textarea').forEach(function (el) {
      if (SKIP_TYPES.indexOf(el.type) !== -1) return;
      var sel = makeSelectorFromEl(el);
      if (mapping[sel]) return;
      var label = getLabelForEl(el, doc);
      if (!label || SKIP_LABELS_RE.test(label)) return;
      var normalized = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      var semanticKey = SEMANTIC_ALIASES[normalized] || normalized;

      el.addEventListener('blur', function () {
        var val = el.value.trim();
        if (!val || val.length < 2) return;
        if (!isValidValue(semanticKey, val)) return;
        if (profile[semanticKey]) return;
        enrichments.push({ semanticKey: semanticKey, value: val, label: label });
        try { sessionStorage.setItem('_cc_enrichments', JSON.stringify(enrichments)); } catch (e) {}
      });
    });
  }

  root.CcCorrectionObserver = {
    inject: inject,
    _isValidValue: isValidValue,
    _SEMANTIC_ALIASES: SEMANTIC_ALIASES,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcCorrectionObserver;
