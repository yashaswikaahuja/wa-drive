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
    if (!el) return false;
    if (typeof el.getBoundingClientRect === 'function') {
      var box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return false;
    }
    try {
      var view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
      if (view && view.getComputedStyle) {
        var cs = view.getComputedStyle(el);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
      }
    } catch (e) { /* keep */ }
    if (el.closest) {
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
      var pane = el.closest('.tab-pane, [role="tabpanel"]');
      if (pane && pane !== el) {
        var paneCls = String(pane.className || '');
        var inactive = /\btab-pane\b/.test(paneCls) && !/\bactive\b/.test(paneCls) && !/\bshow\b/.test(paneCls);
        var ariaHidden = pane.getAttribute && pane.getAttribute('aria-hidden') === 'true';
        if (inactive || ariaHidden) return false;
      }
    }
    return true;
  }

  var CONTROL_QUERY = 'button, input[type="submit"], input[type="button"], [role="button"], [role="checkbox"], [role="radio"], [role="option"], [role="combobox"], mat-select, mat-checkbox, mat-radio-button, td, div, span, a, li, strong, p, label, small, .rct-checkbox, .rct-title, .custom-control-label, [class*="auto-complete__option"], figure, .figure, [draggable="true"], .ui-draggable, .ui-droppable, .droppable, [ondrop]';
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
    var tagName = String(el.tagName || '').toLowerCase();
    if (role === 'checkbox' || role === 'radio' || role === 'option' || role === 'combobox') return true;
    if (tagName === 'mat-select' || tagName === 'mat-checkbox' || tagName === 'mat-radio-button') return true;
    var componentClass = String(el.className || '');
    if (/\bv-select\b|\bv-autocomplete\b|\bv-combobox\b/.test(componentClass)) return true;
    if (/\b\S*auto-complete__option\b/.test(String(el.className || ''))) return true;
    var tag = tagName;
    var cls = String(el.className || '');
    if (tag === 'a') {
      var href = el.getAttribute && el.getAttribute('href');
      var text = textOf(el);
      return !!(href && text && text.length >= 2 && text.length <= 60);
    }
    if (tag === 'label') {
      // Material's internal label is part of the component; expose the host once.
      if (el.closest && el.closest('mat-checkbox, mat-radio-button')) return false;
      if (/custom-control-label|form-check-label|rct-text/.test(cls)) return true;
      if (el.getAttribute && el.getAttribute('for')) return true;
      if (el.querySelector && el.querySelector('input[type="radio"], input[type="checkbox"], .rct-checkbox')) return true;
    }
    if (/\brct-checkbox\b|\brct-title\b|\bcustom-control-label\b/.test(cls)) return true;
    return false;
  }

  function isHoverable(el: any) {
    if (!el || !el.tagName || inChrome(el)) return false;
    var tag = String(el.tagName).toLowerCase();
    if (tag === 'figure') return true;
    var cls = String(el.className || '');
    if (/\bfigure\b/.test(cls)) return true;
    var popup = el.getAttribute && el.getAttribute('aria-haspopup');
    if (popup && popup !== 'false' && !isButton(el)) return true;
    return false;
  }

  function isDraggable(el: any) {
    if (!el || !el.tagName || inChrome(el)) return false;
    if (el.draggable === true) return true;
    var attr = el.getAttribute && el.getAttribute('draggable');
    if (attr === 'true') return true;
    return /\bui-draggable\b/.test(String(el.className || ''));
  }

  function isDroppable(el: any) {
    if (!el || !el.tagName || inChrome(el)) return false;
    if (isDraggable(el)) return false;
    var ondrop = el.getAttribute && el.getAttribute('ondrop') != null;
    var cls = String(el.className || '');
    if (!ondrop && !/\bui-droppable\b|\bdroppable\b/.test(cls)) return false;
    if (el.querySelector && el.querySelector('.ui-droppable, .droppable, [ondrop]')) return false;
    return true;
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
    if (isHoverable(el)) {
      var blob = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (blob) return blob.slice(0, 80);
      var img = el.querySelector && el.querySelector('img');
      var alt = img && img.getAttribute && img.getAttribute('alt');
      if (alt) return String(alt).slice(0, 80);
      return 'hover';
    }
    if (isDraggable(el)) {
      var dragText = textOf(el);
      if (dragText) return dragText.slice(0, 80);
      if (el.id) return String(el.id);
      return 'drag';
    }
    if (isDroppable(el)) {
      var dropText = textOf(el);
      if (dropText) return dropText.slice(0, 80);
      if (el.id) return String(el.id);
      return 'drop';
    }
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
      var hover = !button && !klass && !choice && isHoverable(el);
      var drag = !button && !klass && !choice && !hover && isDraggable(el);
      var drop = !button && !klass && !choice && !hover && !drag && isDroppable(el);
      if (!button && !klass && !choice && !hover && !drag && !drop) continue;
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
      var parent = el.parentElement;
      while (parent && parent !== (doc.documentElement || null)) {
        if (parent.id && /^[A-Za-z][\w:-]*$/.test(parent.id)) {
          var scoped = '#' + parent.id + ' #' + el.id;
          if (doc.querySelectorAll && doc.querySelectorAll(scoped).length === 1) return scoped;
        }
        parent = parent.parentElement;
      }
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
      var tag = String(nodes[i].tagName || '').toLowerCase();
      var asLink = tag === 'a';
      var asHover = !asLink && isHoverable(nodes[i]);
      var asDrag = !asLink && !asHover && isDraggable(nodes[i]);
      var asDrop = !asLink && !asHover && !asDrag && isDroppable(nodes[i]);
      var kind = asLink ? 'link' : asHover ? 'hover' : asDrag ? 'drag' : asDrop ? 'drop' : 'button';
      fields.push({
        selector: selectorFor(nodes[i], fields.length, doc),
        label: label,
        visualLabel: label,
        type: kind,
        role: kind,
      });
    }
    return fields;
  }

  function findByText(text: any, doc: any) {
    var want = norm(text);
    if (!want) return { node: null, field: null, reason: 'not_found' };
    var nodes = candidates(doc);
    var fields = list(doc);
    for (var i = 0; i < fields.length; i++) {
      if (norm(fields[i].visualLabel) === want) return { node: nodes[i], field: fields[i] };
    }
    if (!doc || typeof doc.querySelectorAll !== 'function') return { node: null, field: null, reason: 'not_found' };
    var links = doc.querySelectorAll('a[href]');
    for (var j = 0; j < links.length; j++) {
      if (inChrome(links[j]) || !visible(links[j])) continue;
      var live = textOf(links[j]);
      if (norm(live) !== want) continue;
      var field = {
        selector: selectorFor(links[j], fields.length, doc),
        label: live.slice(0, 80),
        visualLabel: live.slice(0, 80),
        type: 'link',
        role: 'link',
      };
      return { node: links[j], field: field };
    }
    return { node: null, field: null, reason: 'not_found' };
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
    // Send the pointer lifecycle, then perform exactly one native activation.
    // Dispatching a synthetic click and calling el.click() both activates many
    // framework controls twice (Angular Material checkboxes are one example).
    var names = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
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
    if (typeof target.click === 'function') {
      target.click();
    } else if (typeof el.click === 'function') {
      el.click();
    } else if (typeof target.dispatchEvent === 'function') {
      var clickView = (target.ownerDocument && target.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
      var clickEvent = clickView && typeof clickView.MouseEvent === 'function'
        ? new clickView.MouseEvent('click', { bubbles: true, cancelable: true, view: clickView })
        : { type: 'click', bubbles: true, cancelable: true };
      target.dispatchEvent(clickEvent);
    }
  }

  function forceHoverCss(el: any) {
    var rootDoc = (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
    if (!rootDoc) return;
    try {
      var marked = rootDoc.documentElement;
      if (marked && marked.getAttribute && marked.getAttribute('data-cc-hover-css') !== '1') {
        if (marked.setAttribute) marked.setAttribute('data-cc-hover-css', '1');
        var sheets = rootDoc.styleSheets || [];
        for (var s = 0; s < sheets.length; s++) {
          var rules: any = null;
          try { rules = sheets[s].cssRules; } catch (e0) { continue; }
          if (!rules || !sheets[s].insertRule) continue;
          var add = [];
          for (var r = 0; r < rules.length; r++) {
            var rule = rules[r];
            if (!rule || !rule.selectorText || String(rule.selectorText).indexOf(':hover') === -1) continue;
            add.push(String(rule.selectorText).replace(/:hover/g, '.cc-force-hover') + '{' + ((rule.style && rule.style.cssText) || '') + '}');
          }
          for (var a = 0; a < add.length; a++) {
            try { sheets[s].insertRule(add[a], sheets[s].cssRules.length); } catch (e1) { /* skip bad rule */ }
          }
        }
      }
    } catch (e2) { /* mouse events still fire */ }
    try {
      var prev = rootDoc.querySelectorAll && rootDoc.querySelectorAll('.cc-force-hover');
      if (prev) {
        for (var c = 0; c < prev.length; c++) {
          if (prev[c] && prev[c].classList) prev[c].classList.remove('cc-force-hover');
        }
      }
    } catch (e3) { /* stay */ }
    var node = el;
    while (node && node.classList) {
      try { node.classList.add('cc-force-hover'); } catch (e4) { break; }
      node = node.parentElement || node.parentNode;
    }
  }

  function fireHover(el: any) {
    if (typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { /* stay */ }
    }
    var point = centerOf(el);
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
    var names = ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'];
    for (var i = 0; i < names.length; i++) {
      var ev = null;
      var init = {
        bubbles: true,
        cancelable: true,
        view: view,
        clientX: point ? point.x : 0,
        clientY: point ? point.y : 0,
        button: 0,
        buttons: 0,
      };
      try {
        if (names[i].indexOf('pointer') === 0 && view && typeof view.PointerEvent === 'function') {
          ev = new view.PointerEvent(names[i], Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, init));
        } else if (view && typeof view.MouseEvent === 'function') {
          ev = new view.MouseEvent(names[i], init);
        }
      } catch (e2) { /* test doubles dispatch a plain object */ }
      if (ev && typeof el.dispatchEvent === 'function') el.dispatchEvent(ev);
      else if (typeof el.dispatchEvent === 'function') el.dispatchEvent({ type: names[i], bubbles: true, cancelable: true });
    }
    forceHoverCss(el);
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
    if (found.field && found.field.type === 'hover') {
      fireHover(found.node);
      return { pressed: true, reason: '', clicked: labelOf(found.node), selector: found.field.selector, hovered: true };
    }
    fire(found.node);
    return { pressed: true, reason: '', clicked: textOf(found.node), selector: found.field.selector };
  }

  function elementFor(selector: any, doc: any) {
    var found = findNode({ selector: selector }, doc);
    return found && found.node ? found.node : null;
  }

  root.CcClickControl = { list: list, press: press, chooseOption: chooseOption, norm: norm, elementFor: elementFor, findByText: findByText };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcClickControl;
