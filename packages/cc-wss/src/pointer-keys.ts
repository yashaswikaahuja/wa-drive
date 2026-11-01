/**
 * Page mouse click and keyboard. Injected into the tab via executeScript.
 * Each exported function is self-contained so Chrome can serialize it.
 */
function pointerClickAt(spec: any) {
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: 'no_document' };
  function queryDeep(rootDoc: any, sel: any) {
    if (!rootDoc || !sel) return null;
    var hit = null;
    try { hit = rootDoc.querySelector(sel); } catch (e0) { hit = null; }
    if (hit) return hit;
    var frames: any = [];
    try { frames = rootDoc.querySelectorAll('iframe,frame'); } catch (e1) { return null; }
    for (var i = 0; i < frames.length; i++) {
      var child = null;
      try { child = frames[i].contentDocument; } catch (e2) { child = null; }
      if (!child) continue;
      hit = queryDeep(child, sel);
      if (hit) return hit;
    }
    return null;
  }
  function resolve(sel: any) {
    if (!sel) return null;
    try {
      var resolver = g.CcResolveCcSelector;
      if (resolver && typeof resolver.resolveCcSelector === 'function') {
        var byCc = resolver.resolveCcSelector(sel, doc);
        if (byCc) return byCc;
      }
    } catch (e) { /* fall through */ }
    try {
      var clickApi = g.CcClickControl;
      if (clickApi && typeof clickApi.elementFor === 'function') {
        var byClick = clickApi.elementFor(sel, doc);
        if (byClick) return byClick;
      }
    } catch (e2) { /* fall through */ }
    return queryDeep(doc, sel);
  }
  function labelOf(el: any) {
    if (!el) return '';
    var aria = el.getAttribute && el.getAttribute('aria-label');
    var raw = aria || el.innerText || el.textContent || el.value || el.placeholder || '';
    return String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  function makeEvent(name: any, point: any, button: any, buttons: any, detail: any) {
    var view = doc.defaultView || g.window || g;
    var scrollX = (view && view.scrollX) || 0;
    var scrollY = (view && view.scrollY) || 0;
    var init = {
      bubbles: true,
      cancelable: true,
      view: view,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x + scrollX,
      pageY: point.y + scrollY,
      screenX: point.x,
      screenY: point.y,
      button: button,
      buttons: buttons,
      which: button === 0 ? 1 : button === 2 ? 3 : 2,
      detail: detail,
    };
    try {
      if (name.indexOf('pointer') === 0 && view && typeof view.PointerEvent === 'function') {
        return new view.PointerEvent(name, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, init));
      }
      if (view && typeof view.MouseEvent === 'function') return new view.MouseEvent(name, init);
    } catch (e) { /* test doubles dispatch a plain object */ }
    return { type: name, bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: button };
  }
  function fire(el: any, point: any, button: any, buttons: any, names: any, detail: any) {
    for (var i = 0; i < names.length; i++) {
      var ev = makeEvent(names[i], point, button, buttons, detail);
      if (el && typeof el.dispatchEvent === 'function') el.dispatchEvent(ev);
    }
  }
  function forceHover(el: any) {
    var rootDoc = (el && el.ownerDocument) || doc;
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
            try { sheets[s].insertRule(add[a], sheets[s].cssRules.length); } catch (e1) { /* skip */ }
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

  var selector = spec && spec.selector ? String(spec.selector) : '';
  var buttonName = spec && spec.button === 'right' ? 'right' : spec && spec.button === 'middle' ? 'middle' : 'left';
  var count = Number(spec && spec.count) === 2 ? 2 : 1;
  var button = buttonName === 'right' ? 2 : buttonName === 'middle' ? 1 : 0;
  var buttons = button === 0 ? 1 : button === 2 ? 2 : 4;
  var target = null;
  var point = null;
  if (selector) {
    target = resolve(selector);
    if (!target) return { ok: false, error: 'not_found' };
    if (typeof target.scrollIntoView === 'function') {
      try { target.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e4) { /* stay */ }
    }
    var box = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    if (!box || box.width < 1 || box.height < 1) return { ok: false, error: 'not_visible' };
    point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  } else {
    var x = Number(spec && spec.x);
    var y = Number(spec && spec.y);
    if (!isFinite(x) || !isFinite(y)) return { ok: false, error: 'x and y required' };
    point = { x: x, y: y };
    if (typeof doc.elementFromPoint === 'function') target = doc.elementFromPoint(x, y);
    if (!target) return { ok: false, error: 'nothing_there', x: Math.round(x), y: Math.round(y) };
  }
  var action = spec && spec.action === 'hover' ? 'hover' : spec && spec.action === 'drag' ? 'drag' : 'click';
  if (action === 'hover') {
    fire(target, point, 0, 0, ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'], 0);
    forceHover(target);
    return {
      ok: true,
      action: 'hover',
      url: String((g.location && g.location.href) || '').split('?')[0].slice(0, 300),
      title: doc.title || '',
      x: Math.round(point.x),
      y: Math.round(point.y),
      tag: String(target.tagName || '').toLowerCase(),
      hovered: labelOf(target),
    };
  }
  if (action === 'drag') {
    var end = null;
    var toSel = spec && spec.toSelector ? String(spec.toSelector) : '';
    if (toSel) {
      var toEl = resolve(toSel);
      if (!toEl) return { ok: false, error: 'not_found' };
      var toBox = typeof toEl.getBoundingClientRect === 'function' ? toEl.getBoundingClientRect() : null;
      if (!toBox || toBox.width < 1 || toBox.height < 1) return { ok: false, error: 'not_visible' };
      end = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
    } else {
      var x2 = Number(spec && spec.x2);
      var y2 = Number(spec && spec.y2);
      if (!isFinite(x2) || !isFinite(y2)) return { ok: false, error: 'x2 and y2, or toSelector, required' };
      end = { x: x2, y: y2 };
    }
    var endTarget = target;
    if (typeof doc.elementFromPoint === 'function') {
      var hitEnd = doc.elementFromPoint(end.x, end.y);
      if (hitEnd) endTarget = hitEnd;
    }
    fire(target, point, 0, 1, ['pointerdown', 'mousedown'], 1);
    for (var step = 1; step <= 8; step++) {
      var mid = {
        x: point.x + (end.x - point.x) * step / 8,
        y: point.y + (end.y - point.y) * step / 8,
      };
      fire(step === 8 ? endTarget : target, mid, 0, 1, ['pointermove', 'mousemove'], 0);
    }
    fire(endTarget, end, 0, 0, ['pointerup', 'mouseup'], 1);
    return {
      ok: true,
      action: 'drag',
      url: String((g.location && g.location.href) || '').split('?')[0].slice(0, 300),
      title: doc.title || '',
      x: Math.round(point.x),
      y: Math.round(point.y),
      x2: Math.round(end.x),
      y2: Math.round(end.y),
      tag: String(endTarget.tagName || '').toLowerCase(),
      dragged: true,
    };
  }
  var names = buttonName === 'right'
    ? ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'contextmenu']
    : ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  fire(target, point, button, buttons, names, 1);
  if (count === 2 && buttonName === 'left') {
    fire(target, point, button, buttons, names, 2);
    var dbl = makeEvent('dblclick', point, 0, 1, 2);
    if (typeof target.dispatchEvent === 'function') target.dispatchEvent(dbl);
  }
  if (buttonName === 'left' && count === 1 && typeof target.click === 'function') {
    try { target.click(); } catch (e5) { /* the dispatched click already ran */ }
  }
  if (typeof target.focus === 'function') {
    try { target.focus(); } catch (e6) { /* not focusable */ }
  }
  return {
    ok: true,
    action: 'click',
    url: String((g.location && g.location.href) || '').split('?')[0].slice(0, 300),
    title: doc.title || '',
    x: Math.round(point.x),
    y: Math.round(point.y),
    tag: String(target.tagName || '').toLowerCase(),
    clicked: labelOf(target),
    button: buttonName,
    count: count,
  };
}

function keyboardPress(spec: any) {
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: 'no_document' };
  var NAMED: any = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
    tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
    escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
    backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
    space: { key: ' ', code: 'Space', keyCode: 32 },
    arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    home: { key: 'Home', code: 'Home', keyCode: 36 },
    end: { key: 'End', code: 'End', keyCode: 35 },
    pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
    pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  };
  function queryDeep(rootDoc: any, sel: any) {
    if (!rootDoc || !sel) return null;
    var hit = null;
    try { hit = rootDoc.querySelector(sel); } catch (e0) { hit = null; }
    if (hit) return hit;
    var frames: any = [];
    try { frames = rootDoc.querySelectorAll('iframe,frame'); } catch (e1) { return null; }
    for (var i = 0; i < frames.length; i++) {
      var child = null;
      try { child = frames[i].contentDocument; } catch (e2) { child = null; }
      if (!child) continue;
      hit = queryDeep(child, sel);
      if (hit) return hit;
    }
    return null;
  }
  function resolve(sel: any) {
    if (!sel) return null;
    try {
      var resolver = g.CcResolveCcSelector;
      if (resolver && typeof resolver.resolveCcSelector === 'function') {
        var byCc = resolver.resolveCcSelector(sel, doc);
        if (byCc) return byCc;
      }
    } catch (e) { /* fall through */ }
    try {
      var clickApi = g.CcClickControl;
      if (clickApi && typeof clickApi.elementFor === 'function') {
        var byClick = clickApi.elementFor(sel, doc);
        if (byClick) return byClick;
      }
    } catch (e2) { /* fall through */ }
    return queryDeep(doc, sel);
  }
  function tagOf(el: any) {
    return String(el && el.tagName || '').toLowerCase();
  }
  function isEditable(el: any) {
    if (!el) return false;
    var tag = tagOf(el);
    if (tag === 'input' || tag === 'textarea') return !el.disabled && !el.readOnly;
    return !!el.isContentEditable;
  }
  function blockedText(el: any) {
    if (!el) return false;
    var t = String(el.type || '').toLowerCase();
    if (t === 'password' || t === 'hidden') return true;
    var blob = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute && el.getAttribute('aria-label') || '')).toLowerCase();
    return /captcha|otp|\bpin\b|cvv|card number/.test(blob);
  }
  function emitInput(el: any, data: any, inputType: any) {
    var view = doc.defaultView || g.window || g;
    try {
      if (view && typeof view.InputEvent === 'function') {
        el.dispatchEvent(new view.InputEvent('input', { bubbles: true, cancelable: true, inputType: inputType || 'insertText', data: data || null }));
        return;
      }
    } catch (e) { /* fall through */ }
    try {
      if (view && typeof view.Event === 'function') el.dispatchEvent(new view.Event('input', { bubbles: true }));
    } catch (e2) { /* no Event ctor */ }
  }
  function insertText(el: any, text: any) {
    if (!el || !text) return;
    var tag = tagOf(el);
    if (tag === 'input' || tag === 'textarea') {
      var value = String(el.value || '');
      var start = el.selectionStart != null ? el.selectionStart : value.length;
      var end = el.selectionEnd != null ? el.selectionEnd : start;
      el.value = value.slice(0, start) + text + value.slice(end);
      var pos = start + String(text).length;
      try { el.setSelectionRange(pos, pos); } catch (e) { /* not a text control */ }
      emitInput(el, text, 'insertText');
      return;
    }
    if (el.isContentEditable && doc.execCommand) {
      try { doc.execCommand('insertText', false, text); } catch (e2) { /* stay */ }
      emitInput(el, text, 'insertText');
    }
  }
  function deleteOne(el: any, forward: any) {
    var tag = tagOf(el);
    if (tag !== 'input' && tag !== 'textarea') return;
    var value = String(el.value || '');
    var start = el.selectionStart != null ? el.selectionStart : value.length;
    var end = el.selectionEnd != null ? el.selectionEnd : start;
    if (start !== end) {
      el.value = value.slice(0, start) + value.slice(end);
      try { el.setSelectionRange(start, start); } catch (e) { /* stay */ }
    } else if (forward) {
      el.value = value.slice(0, start) + value.slice(start + 1);
      try { el.setSelectionRange(start, start); } catch (e2) { /* stay */ }
    } else if (start > 0) {
      el.value = value.slice(0, start - 1) + value.slice(start);
      try { el.setSelectionRange(start - 1, start - 1); } catch (e3) { /* stay */ }
    }
    emitInput(el, null, forward ? 'deleteContentForward' : 'deleteContentBackward');
  }
  function tabbables() {
    var nodes = doc.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.disabled) continue;
      out.push(n);
    }
    return out;
  }
  function moveTab(el: any, back: any) {
    var list = tabbables();
    if (!list.length) return el;
    var idx = list.indexOf(el);
    var next = back ? (idx <= 0 ? list[list.length - 1] : list[idx - 1]) : (idx < 0 || idx >= list.length - 1 ? list[0] : list[idx + 1]);
    if (next && typeof next.focus === 'function') {
      try { next.focus(); } catch (e) { /* stay */ }
    }
    return next || el;
  }
  function named(raw: any) {
    var token = String(raw || '').trim();
    if (!token) return null;
    var lower = token.toLowerCase();
    if (NAMED[lower]) return NAMED[lower];
    if (token.length === 1) {
      var upper = token.toUpperCase();
      var code = /[a-z]/i.test(token) ? 'Key' + upper : /[0-9]/.test(token) ? 'Digit' + token : token;
      return { key: token, code: code, keyCode: token.charCodeAt(0) };
    }
    return null;
  }
  function fireKey(el: any, def: any, mods: any) {
    var view = doc.defaultView || g.window || g;
    var opts = {
      key: def.key,
      code: def.code,
      keyCode: def.keyCode,
      which: def.keyCode,
      bubbles: true,
      cancelable: true,
      ctrlKey: !!mods.ctrl,
      altKey: !!mods.alt,
      shiftKey: !!mods.shift,
      metaKey: !!mods.meta,
    };
    function send(name: any) {
      var ev = null;
      try {
        if (view && typeof view.KeyboardEvent === 'function') ev = new view.KeyboardEvent(name, opts);
      } catch (e) { ev = null; }
      if (ev && typeof el.dispatchEvent === 'function') el.dispatchEvent(ev);
      else if (typeof el.dispatchEvent === 'function') el.dispatchEvent({ type: name, key: def.key, bubbles: true, cancelable: true });
    }
    send('keydown');
    if (nudgeRange(el, def)) { /* native range ignores untrusted arrows */ }
    else if (def.key === 'Backspace' && isEditable(el) && !mods.ctrl && !mods.alt && !mods.meta) deleteOne(el, false);
    else if (def.key === 'Delete' && isEditable(el) && !mods.ctrl && !mods.alt && !mods.meta) deleteOne(el, true);
    else if (def.key === 'Tab') moveTab(el, !!mods.shift);
    else if (def.key.length === 1 && !mods.ctrl && !mods.alt && !mods.meta && isEditable(el) && !blockedText(el)) insertText(el, def.key);
    send('keypress');
    send('keyup');
  }
  function nudgeRange(el: any, def: any) {
    if (!el || tagOf(el) !== 'input') return false;
    if (String(el.type || '').toLowerCase() !== 'range') return false;
    var min = Number(el.min);
    var max = Number(el.max);
    var step = Number(el.step);
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 100;
    if (!isFinite(step) || step <= 0) step = 1;
    var cur = Number(el.value);
    if (!isFinite(cur)) cur = min;
    var next = cur;
    if (def.key === 'ArrowRight' || def.key === 'ArrowUp') next = cur + step;
    else if (def.key === 'ArrowLeft' || def.key === 'ArrowDown') next = cur - step;
    else if (def.key === 'Home') next = min;
    else if (def.key === 'End') next = max;
    else return false;
    if (next > max) next = max;
    if (next < min) next = min;
    el.value = String(next);
    emitInput(el, null, 'insertReplacementText');
    var view = doc.defaultView || g.window || g;
    try {
      if (view && typeof view.Event === 'function') el.dispatchEvent(new view.Event('change', { bubbles: true }));
    } catch (e) { /* stay */ }
    return true;
  }

  var selector = spec && spec.selector ? String(spec.selector) : '';
  var mods = {
    ctrl: !!(spec && spec.ctrl),
    alt: !!(spec && spec.alt),
    shift: !!(spec && spec.shift),
    meta: !!(spec && spec.meta),
  };
  var el = doc.activeElement || doc.body;
  if (selector) {
    var target = resolve(selector);
    if (!target) return { ok: false, error: 'not_found' };
    if (typeof target.scrollIntoView === 'function') {
      try { target.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e4) { /* stay */ }
    }
    if (typeof target.focus === 'function') {
      try { target.focus(); } catch (e5) { /* stay */ }
    }
    if (typeof target.click === 'function' && tagOf(target) === 'input') {
      try { target.click(); } catch (e6) { /* already focused */ }
    }
    el = target;
  }
  if (!el) el = doc.body;
  var typed = '';
  var keys = [];
  if (spec && spec.text) {
    var text = String(spec.text).slice(0, 300);
    if (blockedText(el)) return { ok: false, error: 'blocked_field', tag: tagOf(el) };
    if (isEditable(el)) insertText(el, text);
    else if (el.isContentEditable) insertText(el, text);
    typed = text;
  }
  if (spec && spec.key) keys.push(spec.key);
  if (spec && Array.isArray(spec.keys)) {
    for (var k = 0; k < spec.keys.length && keys.length < 20; k++) keys.push(spec.keys[k]);
  }
  for (var i = 0; i < keys.length; i++) {
    var def = named(keys[i]);
    if (!def) return { ok: false, error: 'unknown_key', key: String(keys[i] || '').slice(0, 40) };
    fireKey(el, def, mods);
    el = doc.activeElement || el;
  }
  var focused = doc.activeElement || el;
  return {
    ok: true,
    url: String((g.location && g.location.href) || '').split('?')[0].slice(0, 300),
    title: doc.title || '',
    tag: tagOf(focused),
    focused: String((focused && (focused.id || focused.name || focused.getAttribute && focused.getAttribute('aria-label'))) || tagOf(focused)).slice(0, 80),
    typed: typed ? typed.slice(0, 80) : '',
    key: keys.length ? String(keys[keys.length - 1]).slice(0, 40) : '',
    value: isEditable(focused) && !blockedText(focused) ? String(focused.value || '').slice(0, 80) : '',
  };
}

const pointerRoot = typeof globalThis !== 'undefined' ? globalThis : this;
(pointerRoot as any).CcPagePointer = { clickAt: pointerClickAt, pressKeys: keyboardPress };
