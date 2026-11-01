/**
 * scan-custom-choice — custom checkbox / radio widgets (#349)
 *
 * DemoQA tree checkboxes (.rct-checkbox / .rct-title) and Bootstrap-style
 * custom radios (.custom-control-label) are not native inputs the standard
 * scan can see. This pass emits one field per visible choice so read_form
 * and click can name them.
 *
 * Public API (on globalThis.CcScanCustomChoice):
 *   scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }
 */
(function (root: any) {
  'use strict';

  var QUERY = [
    '[role="checkbox"]',
    '[role="radio"]',
    '.rct-checkbox',
    '.rct-title',
    'label.custom-control-label',
    'label.form-check-label',
  ].join(',');

  function already(el: any, existing: any) {
    if (!el || !existing) return false;
    for (var i = 0; i < existing.length; i++) {
      var f = existing[i];
      if (f && f._el === el) return true;
      try {
        if (f && f.selector && el.matches && el.matches(f.selector)) return true;
      } catch (e) { /* bad selector */ }
    }
    return false;
  }

  function selectorFor(el: any, idx: any, doc: any) {
    if (el.id && /^[A-Za-z][\w:-]*$/.test(el.id)) {
      var byId = '#' + el.id;
      if (doc.querySelectorAll && doc.querySelectorAll(byId).length === 1) return byId;
    }
    var htmlFor = el.getAttribute && el.getAttribute('for');
    if (htmlFor) return 'label[for="' + htmlFor + '"]';
    var cls = String(el.className || '').trim().split(/\s+/).filter(function (c: any) {
      return c && /^[A-Za-z][\w-]*$/.test(c);
    });
    if (cls.length && el.tagName) {
      var sel = String(el.tagName).toLowerCase() + '.' + cls[0];
      if (doc.querySelectorAll && doc.querySelectorAll(sel).length === 1) return sel;
    }
    return 'cc-choice-' + idx;
  }

  function kindOf(el: any) {
    var role = el.getAttribute && el.getAttribute('role');
    if (role === 'radio') return 'radio';
    if (role === 'checkbox') return 'checkbox';
    var cls = String(el.className || '');
    if (/custom-control-label/.test(cls)) {
      var box = el.parentElement && el.parentElement.querySelector && el.parentElement.querySelector('input');
      var t = box && String(box.type || '').toLowerCase();
      if (t === 'radio') return 'radio';
      return 'checkbox';
    }
    if (/rct-checkbox|rct-title/.test(cls) || (el.getAttribute && el.getAttribute('for'))) return 'checkbox';
    return 'checkbox';
  }

  function scan(doc: any, existingFields: any, helpers: any, startIdx: any) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 20000;
    var formFields = [];
    var labelList = [];
    var seen = {};
    if (!doc || typeof doc.querySelectorAll !== 'function') return { formFields: formFields, labelList: labelList };
    var nodes = doc.querySelectorAll(QUERY);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isInSkipContext && isInSkipContext(el)) continue;
      if (typeof helpers.isVisuallyPresent === 'function' && !helpers.isVisuallyPresent(el)) continue;
      var host = el;
      if (el.classList && el.classList.contains('rct-checkbox') && el.closest) {
        host = el.closest('label') || el;
      }
      if (el.classList && el.classList.contains('rct-title') && el.closest) {
        host = el.closest('label') || el;
      }
      if (already(host, existingFields) || already(host, formFields)) continue;
      var label = '';
      if (host.classList && host.classList.contains('rct-title')) label = String(host.textContent || '').replace(/\s+/g, ' ').trim();
      else if (el.classList && el.classList.contains('rct-title')) label = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      else label = (getLabel && getLabel(host)) || (host.getAttribute && host.getAttribute('aria-label')) || String(host.textContent || '').replace(/\s+/g, ' ').trim();
      label = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!label || label.length < 2) continue;
      var key = label.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      var type = kindOf(host);
      var selector = selectorFor(host, idx, doc);
      if (label) labelList.push(key.replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: selector,
        id: host.id || '',
        name: (host.getAttribute && host.getAttribute('for')) || '',
        value: '',
        placeholder: '',
        label: label,
        type: type,
        index: idx,
        options: null,
        _el: host,
      });
      idx += 1;
    }
    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanCustomChoice = { scan: scan };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).CcScanCustomChoice;
