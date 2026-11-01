/**
 * click-control — press the button named by one JSON field.
 *
 * The field is the same object read_form returns:
 *   { selector, label, visualLabel, type: 'button' }
 * list() builds that JSON from the buttons a person can see, and from
 * train class cells (SL, 3A, and the same kind of td.link) that have to
 * be chosen before Book Now does anything.
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

  var CONTROL_QUERY = 'button, input[type="submit"], input[type="button"], [role="button"], [role="checkbox"], [role="radio"], [role="option"], td, div, span, a, li, strong, p, label, small, .rct-checkbox, .rct-title, .custom-control-label, [class*="auto-complete__option"]';
  var CLASS_WORD = /\b(1A|2A|3A|3E|SL|CC|EC|2S|FC|EA|EV)\b/i;
  var CLASS_ONLY = /^(1A|2A|3A|3E|SL|CC|EC|2S|FC|EA|EV)$/i;
  var AVAIL_WORD = /\b(AVAILABLE|GNWL|RAC|REGRET|CURR)\b/i;

  function inChrome(el: any) {
    return !!(el && el.closest && el.closest('nav,header,footer,[role="navigation"],[role="banner"]'));
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

  function isChoice(el: any) {
    if (!el || !el.tagName || inChrome(el)) return false;
    var role = el.getAttribute && el.getAttribute('role');
    if (role === 'checkbox' || role === 'radio' || role === 'option') return true;
    if (/\b\S*auto-complete__option\b/.test(String(el.className || ''))) return true;
    var tag = String(el.tagName).toLowerCase();
    var cls = String(el.className || '');
    if (tag === 'a') {
      var href = el.getAttribute && el.getAttribute('href');
      var text = textOf(el);
      return !!(href && text && text.length >= 2 && text.length <= 60);
    }
    if (tag === 'label') {
      if (/custom-control-label|form-check-label|rct-text/.test(cls)) return true;
      if (el.getAttribute && el.getAttribute('for')) return true;
      if (el.querySelector && el.querySelector('input[type="radio"], input[type="checkbox"], .rct-checkbox')) return true;
    }
    if (/\brct-checkbox\b|\brct-title\b|\bcustom-control-label\b/.test(cls)) return true;
    return false;
  }

  function isLinkCell(el: any) {
    return String(el.tagName || '').toLowerCase() === 'td' && /(?:^|\s)link(?:\s|$)/.test(String(el.className || ''));
  }

  function inTrainCard(el: any, text: any) {
    if (!el || typeof el.closest !== 'function') return true;
    if (el.closest('.bull-back, app-train-avl-enq')) return true;
    return CLASS_ONLY.test(text);
  }

  function isClassCell(el: any) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toLowerCase();
    if (!/^(td|div|span|a|li|strong|button|p|label|small)$/.test(tag)) return false;
    var text = textOf(el);
    if (!text || text.length > 80) return false;
    var coded = CLASS_WORD.test(text);
    var avail = AVAIL_WORD.test(text);
    if (!isLinkCell(el) && !coded && !avail) return false;
    if (!isLinkCell(el) && !inTrainCard(el, text)) return false;
    if (typeof el.querySelectorAll === 'function') {
      var kids = el.querySelectorAll('td, div, span, a, li, strong, button, p, label, small');
      for (var i = 0; i < kids.length; i++) {
        var kt = textOf(kids[i]);
        if (!kt || kt.length >= text.length || kt.length > 80) continue;
        if (CLASS_WORD.test(kt) || AVAIL_WORD.test(kt) || isLinkCell(kids[i])) return false;
      }
    }
    return true;
  }

  function labelOf(el: any) {
    var label = textOf(el);
    if (isClassCell(el)) return label.slice(0, 80);
    return label;
  }

  function candidates(doc: any) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    var nodes = doc.querySelectorAll(CONTROL_QUERY);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var button = isButton(el);
      var klass = !button && isClassCell(el);
      var choice = !button && !klass && isChoice(el);
      if (!button && !klass && !choice) continue;
      if (!visible(el)) continue;
      var label = labelOf(el);
      if (!label || (button && label.length > 80)) continue;
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
      var label = labelOf(nodes[i]);
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

  function centerOf(el: any) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    var box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return null;
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  function fire(el: any) {
    if (typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* not a layout element */ }
    }
    var target = el;
    var point = centerOf(el);
    var doc = el.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (point && doc && typeof doc.elementFromPoint === 'function') {
      var hit = doc.elementFromPoint(point.x, point.y);
      if (hit && (hit === el || (typeof el.contains === 'function' && el.contains(hit)))) target = hit;
    }
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
    var names = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (var i = 0; i < names.length; i++) {
      var ev = null;
      var init = {
        bubbles: true,
        cancelable: true,
        view: view,
        clientX: point ? point.x : 0,
        clientY: point ? point.y : 0,
        button: 0,
        buttons: 1,
      };
      try {
        if (names[i].indexOf('pointer') === 0 && view && typeof view.PointerEvent === 'function') {
          ev = new view.PointerEvent(names[i], Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, init));
        } else if (view && typeof view.MouseEvent === 'function') {
          ev = new view.MouseEvent(names[i], init);
        }
      } catch (e) { /* test doubles dispatch a plain object */ }
      if (ev && typeof target.dispatchEvent === 'function') target.dispatchEvent(ev);
      else if (typeof target.dispatchEvent === 'function') target.dispatchEvent({ type: names[i], bubbles: true, cancelable: true });
    }
    if (typeof target.click === 'function') target.click();
    else if (typeof el.click === 'function') el.click();
    var type = String((el.getAttribute && el.getAttribute('type')) || el.type || '').toLowerCase();
    var form = el.form || (typeof el.closest === 'function' ? el.closest('form') : null);
    if (form && type === 'submit' && typeof form.requestSubmit === 'function') {
      try { form.requestSubmit(el); } catch (e) { /* the click already submitted */ }
    }
  }

  function chooseOption(doc: any, text: any) {
    var want = norm(text);
    if (!want || !doc || typeof doc.querySelectorAll !== 'function') {
      return { pressed: false, reason: 'not_found', clicked: '' };
    }
    var nodes = doc.querySelectorAll('[role="option"]');
    for (var i = 0; i < nodes.length; i++) {
      var label = textOf(nodes[i]);
      if (!label || norm(label).indexOf(want) === -1) continue;
      if (!visible(nodes[i])) continue;
      fire(nodes[i]);
      return { pressed: true, reason: '', clicked: label };
    }
    return { pressed: false, reason: 'not_found', clicked: '' };
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

  function elementFor(selector: any, doc: any) {
    var found = findNode({ selector: selector }, doc);
    return found && found.node ? found.node : null;
  }

  root.CcClickControl = { list: list, press: press, chooseOption: chooseOption, norm: norm, elementFor: elementFor };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcClickControl;
