/**
 * choose-autocomplete — pick the suggestion that matches the typed value.
 *
 * A station box keeps a plain string until an option is chosen. The match
 * is the option whose first token is the typed value, or whose text starts
 * with that value. A longer name that merely begins with the same letters
 * does not qualify.
 *
 * Public API (on globalThis.CcChooseAutocomplete):
 *   best(labels, value) => { index, label, score } | null
 *   options(doc) => visible suggestion elements
 *   open(el) => focus the input so its list can appear
 *   choose(doc, value) => { pressed, reason, clicked, score }
 */
(function (root: any) {
  'use strict';

  var OPTION_QUERY = [
    '[role="option"]',
    '[role="listbox"] li',
    '.p-autocomplete-item',
    '.ui-autocomplete-list-item',
    '.auto-complete__option',
    '[class*="auto-complete__option"]',
    '[class*="-option"]',
    '[id^="react-select-"][id*="-option"]',
    '[id*="-option-"]',
  ].join(',');

  function norm(s: any) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tokens(s: any) {
    var n = norm(s);
    return n ? n.split(' ') : [];
  }

  function score(option: any, value: any) {
    var o = norm(option);
    var v = norm(value);
    if (!o || !v) return 0;
    if (o === v) return 100;
    var oTokens = tokens(option);
    var vTokens = tokens(value);
    if (o.indexOf(v) === 0 && (o.length === v.length || o.charAt(v.length) === ' ')) return 90;
    if (oTokens[0] && oTokens[0] === v) return 88;
    if (vTokens.length > 1 && o.indexOf(v) === 0) return 86;
    var all = vTokens.length > 0 && vTokens.every(function (t: any) { return oTokens.indexOf(t) !== -1; });
    if (all && oTokens[0] === vTokens[0]) return 84;
    return 0;
  }

  function best(labels: any, value: any) {
    var list = Array.isArray(labels) ? labels : [];
    var winner = -1;
    var winnerScore = 0;
    var winnerLen = 0;
    for (var i = 0; i < list.length; i++) {
      var s = score(list[i], value);
      var len = norm(list[i]).length;
      if (s > winnerScore || (s === winnerScore && s > 0 && len < winnerLen)) {
        winner = i;
        winnerScore = s;
        winnerLen = len;
      }
    }
    if (winner < 0 || winnerScore < 84) return null;
    return { index: winner, label: String(list[winner]), score: winnerScore };
  }

  function textOf(el: any) {
    if (!el) return '';
    var raw = el.innerText || el.textContent || el.value || '';
    return String(raw).replace(/\s+/g, ' ').trim();
  }

  function visible(el: any) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return true;
    var box = el.getBoundingClientRect();
    return box.width >= 2 && box.height >= 2;
  }

  function options(doc: any) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    var nodes = doc.querySelectorAll(OPTION_QUERY);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!visible(nodes[i]) || !textOf(nodes[i])) continue;
      out.push(nodes[i]);
    }
    return out;
  }

  function typeKeepFocus(el: any, value: any) {
    if (!el) return false;
    var str = String(value == null ? '' : value);
    var proto = (el.tagName === 'TEXTAREA')
      ? ((typeof window !== 'undefined' && window.HTMLTextAreaElement) ? window.HTMLTextAreaElement.prototype : null)
      : ((typeof window !== 'undefined' && window.HTMLInputElement) ? window.HTMLInputElement.prototype : null);
    var desc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    var setVal = desc && desc.set ? function (v: any) { desc.set.call(el, v); } : function (v: any) { el.value = v; };
    try { el.focus(); } catch (e) { /* already focused */ }
    try { el.click(); } catch (e) { /* not a layout element */ }
    if (el.value) {
      try { el.select(); } catch (e) { /* not selectable */ }
      setVal('');
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); } catch (e) { /* no InputEvent */ }
    }
    var current = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var kc = ch.charCodeAt(0);
      var code = /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : (/[0-9]/.test(ch) ? 'Digit' + ch : '');
      try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch, code: code, keyCode: kc, which: kc })); } catch (e) { /* no KeyboardEvent */ }
      current += ch;
      setVal(current);
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch })); } catch (e) {
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) { /* test double */ }
      }
      try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch, code: code, keyCode: kc, which: kc })); } catch (e) { /* no KeyboardEvent */ }
    }
    return true;
  }

  function open(el: any) {
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* not a layout element */ }
    }
    if (typeof el.focus === 'function') el.focus();
    if (typeof el.click === 'function') el.click();
    if (typeof el.dispatchEvent !== 'function') return;
    var view = (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
    try { el.dispatchEvent(new Event('focus', { bubbles: true })); } catch (e) { /* already focused */ }
    var names = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (var i = 0; i < names.length; i++) {
      try {
        var ev = view && typeof view.MouseEvent === 'function'
          ? new view.MouseEvent(names[i], { bubbles: true, cancelable: true, view: view, button: 0 })
          : { type: names[i], bubbles: true, cancelable: true };
        el.dispatchEvent(ev);
      } catch (e) { /* test doubles dispatch a plain object */ }
    }
    try {
      var keyInit = { bubbles: true, cancelable: true, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40 };
      var key = view && typeof view.KeyboardEvent === 'function'
        ? new view.KeyboardEvent('keydown', keyInit)
        : Object.assign({ type: 'keydown' }, keyInit);
      el.dispatchEvent(key);
    } catch (e) { /* the list may already be open */ }
  }

  function activate(el: any) {
    if (!el) return;
    if (typeof el.dispatchEvent === 'function') {
      try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {
        el.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
      }
    }
    if (typeof el.click === 'function') el.click();
  }

  function choose(doc: any, value: any) {
    var nodes = options(doc);
    var labels = [];
    for (var i = 0; i < nodes.length; i++) labels.push(textOf(nodes[i]));
    var picked = best(labels, value);
    if (!picked) return { pressed: false, reason: 'not_found', clicked: '', score: 0 };
    activate(nodes[picked.index]);
    return { pressed: true, reason: '', clicked: picked.label, score: picked.score };
  }

  root.CcChooseAutocomplete = { best: best, options: options, open: open, choose: choose, score: score, typeKeepFocus: typeKeepFocus };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcChooseAutocomplete;
