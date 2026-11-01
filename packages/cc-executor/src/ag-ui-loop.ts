/**
 * ag-ui-loop — one field, then read the box, then the next field.
 *
 * A station choice counts only when the input keeps the suggestion text.
 * Clicking a row while the box still shows the typed word is not a choice.
 * Later fields, including Search, wait until this field has landed.
 * One retry stays on the same field. A second miss stops the loop.
 *
 * Public API (on globalThis.CcAgUiLoop):
 *   landed(typed, actual, chosen) => boolean
 *   run(fields, doc, deps) => Promise<{ stopped, records }>
 */
(function (root: any) {
  'use strict';

  function norm(s: any) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function landed(typed: any, actual: any, chosen: any) {
    var a = norm(actual);
    var t = norm(typed);
    var c = norm(chosen);
    // Chip widgets (DemoQA auto-complete) clear the input after a pick.
    // Only the exact chosen chip counts. A longer station option with an
    // empty box is a miss, not a chip.
    if (c && t && !a && c === t) return true;
    if (!a) return false;
    if (c && a === c) return true;
    if (c && a !== t && (a.indexOf(c) !== -1 || c.indexOf(a) !== -1)) return true;
    if (!c && t && a === t) return true;
    return false;
  }

  function truthyChoice(v: any) {
    var n = norm(v);
    return n === 'true' || n === 'on' || n === 'checked' || n === 'yes' || n === '1';
  }

  function valuesMatch(field: any, el: any, actual: any) {
    var planned = String(field && field.value || '');
    var t = String((el && el.type) || (field && field.type) || '').toLowerCase();
    var tag = String((el && el.tagName) || '').toLowerCase();
    if (t === 'checkbox' || t === 'checkbox-agreement' || t === 'checkbox-group') {
      var checked = !!(el && el.checked);
      if (truthyChoice(planned)) return checked;
      if (norm(planned) === 'false' || norm(planned) === 'off' || norm(planned) === 'unchecked') return !checked;
      return checked && (norm(actual) === norm(planned) || truthyChoice(actual));
    }
    if (tag === 'select' || t === 'dropdown' || t === 'select') {
      var opt = el && el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      var text = opt ? String(opt.text || '') : '';
      var val = opt ? String(opt.value || '') : String(actual || '');
      var p = norm(planned);
      if (!p) return false;
      return norm(text) === p || norm(val) === p || (text && (norm(text).indexOf(p) !== -1 || p.indexOf(norm(text)) !== -1));
    }
    return norm(actual) === norm(planned);
  }

  function isButton(field: any) {
    return /^(button|submit)$/i.test(field && field.type || '');
  }

  function labelOf(field: any) {
    return (field && (field.visualLabel || field.label)) || '';
  }

  function needsList(field: any, el: any) {
    var label = labelOf(field).toLowerCase();
    if (label.indexOf('station') !== -1) return true;
    if (!el || !el.getAttribute) return false;
    return !!(el.getAttribute('aria-autocomplete') || el.getAttribute('aria-controls'));
  }

  function readValue(el: any) {
    if (!el) return '';
    var ceAttr = el.getAttribute && el.getAttribute('contenteditable');
    if (el.isContentEditable === true || (ceAttr != null && (String(ceAttr).toLowerCase().trim() === 'true' || String(ceAttr).trim() === ''))) {
      return String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return el.value != null ? String(el.value) : '';
  }

  function liveDeps(doc: any) {
    return {
      resolve: function (selector: any) {
        var resolver = root.CcResolveCcSelector;
        if (!resolver || typeof resolver.resolveCcSelector !== 'function') return null;
        return resolver.resolveCcSelector(selector, doc);
      },
      fill: async function (field: any) {
        if (typeof root.fillFormFieldsSequential !== 'function') return;
        var label = labelOf(field);
        var mapping: any = {};
        var fbs: any = {};
        mapping[field.selector] = { value: String(field.value), type: field.type || 'text', label: label, visualLabel: label };
        fbs[field.selector] = { label: label, visualLabel: label, source: 'operator' };
        await root.fillFormFieldsSequential(mapping, fbs, {}, [field]);
      },
      open: function (el: any) {
        var chooser = root.CcChooseAutocomplete;
        if (chooser && typeof chooser.open === 'function') chooser.open(el);
      },
      choose: function (value: any) {
        var chooser = root.CcChooseAutocomplete;
        if (!chooser || typeof chooser.choose !== 'function') return { pressed: false, clicked: '' };
        return chooser.choose(doc, value);
      },
      press: function (field: any) {
        var clickApi = root.CcClickControl;
        if (!clickApi || typeof clickApi.press !== 'function') return { pressed: false, reason: 'not_found', clicked: '' };
        return clickApi.press(field, doc);
      },
      sleep: function (ms: any) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
      },
      url: function () { return (doc.defaultView && doc.defaultView.location && doc.defaultView.location.href) || ''; },
      title: function () { return (doc.defaultView && doc.defaultView.document && doc.defaultView.document.title) || (doc.title || ''); },
    };
  }

  async function actOnce(field: any, doc: any, deps: any) {
    var el = deps.resolve(field.selector, doc);
    if (!el) {
      return { selector: field.selector, label: labelOf(field), result: 'failed', failReason: 'not_found', plannedValue: String(field.value || ''), actualValue: '' };
    }
    await deps.fill(field, el, doc);
    if (!needsList(field, el)) {
      var live = deps.resolve(field.selector, doc) || el;
      var plain = readValue(live);
      if (live && live.type === 'checkbox') plain = live.checked ? (live.value || 'on') : 'false';
      if (live && String(live.tagName || '').toLowerCase() === 'select' && live.options && live.selectedIndex >= 0) {
        var opt = live.options[live.selectedIndex];
        plain = (opt && (opt.text || opt.value)) || plain;
      }
      var ok = valuesMatch(field, live, plain);
      return {
        selector: field.selector,
        label: labelOf(field),
        result: ok ? 'filled' : 'failed',
        failReason: ok ? '' : 'value_mismatch',
        plannedValue: String(field.value || ''),
        actualValue: plain,
      };
    }
    el = deps.resolve(field.selector, doc) || el;
    var chooser = root.CcChooseAutocomplete;
    if (chooser && typeof chooser.typeKeepFocus === 'function') chooser.typeKeepFocus(el, field.value);
    if (deps.open) deps.open(el);
    if (deps.sleep) await deps.sleep(300);
    var chosen = null;
    var attempts = 0;
    while (attempts < 12) {
      chosen = deps.choose(String(field.value), doc);
      if (chosen && chosen.pressed) break;
      if (deps.open && attempts === 3) deps.open(el);
      attempts += 1;
      if (deps.sleep) await deps.sleep(250);
    }
    if (chosen && chosen.pressed && deps.sleep) await deps.sleep(200);
    var actual = readValue(deps.resolve(field.selector, doc) || el);
    var choice = chosen && chosen.clicked || '';
    if (landed(field.value, actual, choice)) {
      return {
        selector: field.selector,
        label: labelOf(field),
        result: 'chosen',
        failReason: '',
        plannedValue: String(field.value || ''),
        actualValue: actual || choice,
      };
    }
    return {
      selector: field.selector,
      label: labelOf(field),
      result: chosen && chosen.pressed ? 'not_landed' : 'no_option',
      failReason: chosen && chosen.pressed ? 'not_landed' : 'no_option',
      plannedValue: String(field.value || ''),
      actualValue: actual || choice,
    };
  }

  async function run(fields: any, doc: any, deps: any) {
    var list = Array.isArray(fields) ? fields : [];
    deps = deps || liveDeps(doc || (typeof document !== 'undefined' ? document : null));
    var records = [];
    var stopped = false;
    var i = 0;
    for (i = 0; i < list.length; i++) {
      var field = list[i];
      if (!field || !field.selector) continue;
      if (isButton(field)) continue;
      if (field.value == null || String(field.value) === '') continue;
      if (stopped) {
        records.push({ selector: field.selector, label: labelOf(field), result: 'skipped', failReason: 'previous_field', plannedValue: String(field.value), actualValue: '' });
        continue;
      }
      var record = await actOnce(field, doc, deps);
      if (record.result !== 'filled' && record.result !== 'chosen') {
        record = await actOnce(field, doc, deps);
      }
      records.push(record);
      // Station/autocomplete misses still block Search. A checkbox/select
      // value_mismatch does not skip the rest of the form (#349).
      if (record.result === 'not_landed' || record.result === 'no_option') stopped = true;
    }
    for (i = 0; i < list.length; i++) {
      var button = list[i];
      if (!button || !isButton(button)) continue;
      if (stopped) {
        records.push({ selector: button.selector, label: labelOf(button), result: 'skipped', failReason: 'previous_field', plannedValue: labelOf(button), actualValue: '' });
        continue;
      }
      var beforeUrl = deps.url ? deps.url() : '';
      var beforeTitle = deps.title ? deps.title() : '';
      var pressed = deps.press ? deps.press(button, doc) : { pressed: false, reason: 'not_found', clicked: '' };
      if (deps.sleep) await deps.sleep(700);
      var changed = (deps.url ? deps.url() : '') !== beforeUrl || (deps.title ? deps.title() : '') !== beforeTitle;
      var didPress = !!(pressed && pressed.pressed);
      records.push({
        selector: (pressed && pressed.selector) || button.selector,
        label: labelOf(button),
        result: didPress ? 'clicked' : 'no_effect',
        failReason: didPress ? '' : ((pressed && pressed.reason) || 'not_found'),
        plannedValue: labelOf(button),
        actualValue: (pressed && pressed.clicked) || '',
        moved: changed,
      });
    }
    return { stopped: stopped, records: records };
  }

  root.CcAgUiLoop = { landed: landed, run: run, needsList: needsList };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (globalThis as any).CcAgUiLoop;
