/**
 * click-control — press the button named by one JSON field.
 *
 * The field is the same object read_form returns:
 *   { selector, label, visualLabel, type: 'button' }
 * list() builds that JSON from the buttons a person can see.
 * press() uses the selector and the label together, fires the pointer
 * sequence a page handler listens for, and does not report a press when
 * the label moved or the control is disabled.
 *
 * Public API (on globalThis.CcClickControl):
 *   list(doc) => field[]
 *   press(field, doc) => { pressed, reason, clicked, selector }
 */
(function (root: any) {
  'use strict';

  function norm(s: any) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function textOf(el: any) {
    if (!el) return '';
    var aria = el.getAttribute && el.getAttribute('aria-label');
    var raw = el.innerText || el.textContent || el.value || aria || '';
    return String(raw).replace(/\s+/g, ' ').trim();
  }

  function isDisabled(el: any) {
    if (!el) return true;
    if (el.disabled) return true;
    var aria = el.getAttribute && el.getAttribute('aria-disabled');
    return aria === 'true';
  }

  function visible(el: any) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return true;
    var box = el.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2;
  }

  function isButton(el: any) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toLowerCase();
    if (tag === 'button') return true;
    if (tag === 'input') {
      var t = String(el.type || (el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
      return t === 'submit' || t === 'button';
    }
    var role = el.getAttribute && el.getAttribute('role');
    return role === 'button';
  }

  function candidates(doc: any) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    var nodes = doc.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isButton(el) || !visible(el)) continue;
      var label = textOf(el);
      if (!label || label.length > 80) continue;
      if (/captcha|otp/i.test(label)) continue;
      out.push(el);
    }
    return out;
  }

  function selectorFor(el: any, index: any, doc: any) {
    if (el.id && /^[A-Za-z][\w:-]*$/.test(el.id)) {
      var byId = '#' + el.id;
      if (doc.querySelectorAll && doc.querySelectorAll(byId).length === 1) return byId;
    }
    var cls = String(el.className || '').trim().split(/\s+/).filter(function (c: any) {
      return c && c.length < 40 && /^[A-Za-z][\w-]*$/.test(c);
    });
    if (cls.length && el.tagName) {
      var sel = String(el.tagName).toLowerCase() + '.' + cls[0];
      if (doc.querySelectorAll && doc.querySelectorAll(sel).length === 1) return sel;
    }
    return 'cc-button-' + index;
  }

  function list(doc: any) {
    var nodes = candidates(doc);
    var fields = [];
    for (var i = 0; i < nodes.length; i++) {
      var label = textOf(nodes[i]);
      fields.push({
        selector: selectorFor(nodes[i], fields.length, doc),
        label: label,
        visualLabel: label,
        type: 'button',
        role: 'button',
      });
    }
    return fields;
  }

  function findNode(spec: any, doc: any) {
    var nodes = candidates(doc);
    var fields = list(doc);
    var sel = spec && spec.selector ? String(spec.selector) : '';
    var expected = norm(spec && (spec.visualLabel || spec.label));
    if (sel) {
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].selector !== sel) continue;
        if (expected && norm(fields[i].visualLabel) !== expected) {
          return { node: null, reason: 'label_drift', live: fields[i].visualLabel };
        }
        return { node: nodes[i], field: fields[i] };
      }
    }
    if (expected) {
      for (var j = 0; j < fields.length; j++) {
        if (norm(fields[j].visualLabel) !== expected) continue;
        return { node: nodes[j], field: fields[j] };
      }
    }
    return { node: null, reason: 'not_found' };
  }

  function fire(el: any) {
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
    var names = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (var i = 0; i < names.length; i++) {
      var ev = null;
      try {
        if (view && typeof view.MouseEvent === 'function') {
          ev = new view.MouseEvent(names[i], { bubbles: true, cancelable: true, view: view });
        }
      } catch (e) { /* test doubles dispatch a plain object */ }
      if (ev) el.dispatchEvent(ev);
      else if (typeof el.dispatchEvent === 'function') el.dispatchEvent({ type: names[i], bubbles: true, cancelable: true });
    }
    var type = String((el.getAttribute && el.getAttribute('type')) || el.type || '').toLowerCase();
    var form = el.form || (typeof el.closest === 'function' ? el.closest('form') : null);
    if (form && type === 'submit' && typeof form.requestSubmit === 'function') {
      try { form.requestSubmit(el); } catch (e) { /* the click already submitted */ }
    }
  }

  function press(spec: any, doc: any) {
    var found = findNode(spec || {}, doc);
    if (!found.node) {
      return { pressed: false, reason: found.reason || 'not_found', clicked: '', selector: (spec && spec.selector) || '' };
    }
    if (isDisabled(found.node)) {
      return { pressed: false, reason: 'disabled', clicked: textOf(found.node), selector: found.field.selector };
    }
    fire(found.node);
    return { pressed: true, reason: '', clicked: textOf(found.node), selector: found.field.selector };
  }

  root.CcClickControl = { list: list, press: press, norm: norm };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcClickControl;
