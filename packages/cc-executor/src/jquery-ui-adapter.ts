/**
 * jQuery UI adapter — executor-side compatibility for jQuery UI widgets.
 *
 * The adapter deliberately treats the native control as the source of truth.
 * It does not depend on page-world jQuery being visible from the extension's
 * isolated world. Interactions use DOM events and verify the resulting native
 * value plus the widget's rendered state.
 */
(function (root: any) {
  'use strict';

  function normalize(value: any) {
    return String(value == null ? '' : value).replace(/\\s+/g, ' ').trim().toLowerCase();
  }

  function text(node: any) {
    return String(node && node.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function isSelectmenuButton(el: any) {
    return !!(el && el.classList && el.classList.contains('ui-selectmenu-button'));
  }

  function findSelectForButton(button: any) {
    if (!button) return null;
    var id = String(button.id || '');
    if (id.endsWith('-button')) {
      var selectId = id.slice(0, -7);
      var byId = button.ownerDocument.getElementById(selectId);
      if (byId && String(byId.tagName).toLowerCase() === 'select') return byId;
    }
    var labelledBy = button.getAttribute && button.getAttribute('aria-labelledby');
    if (labelledBy) {
      var label = button.ownerDocument.getElementById(labelledBy);
      if (label && label.htmlFor) {
        var linked = button.ownerDocument.getElementById(label.htmlFor);
        if (linked && String(linked.tagName).toLowerCase() === 'select') return linked;
      }
    }
    return null;
  }

  function findButton(el: any) {
    if (isSelectmenuButton(el)) return el;
    if (el && el.matches && el.matches('[id$="-button"].ui-selectmenu-button')) return el;
    if (el && el.querySelector) {
      var nested = el.querySelector('.ui-selectmenu-button');
      if (nested) return nested;
    }
    return null;
  }

  function findVisibleMenu(doc: any, button: any) {
    var menus = Array.from(doc.querySelectorAll('.ui-selectmenu-menu.ui-selectmenu-open, .ui-selectmenu-menu'));
    var visible = menus.filter(function (menu: any) {
      var style = doc.defaultView && doc.defaultView.getComputedStyle ? doc.defaultView.getComputedStyle(menu) : null;
      return menu.getClientRects().length > 0 && (!style || (style.display !== 'none' && style.visibility !== 'hidden'));
    });
    if (!visible.length) return null;
    // Each Selectmenu gets a generated menu id: <select-id>-menu.
    // Prefer the menu belonging to this button; never pick another widget's menu.
    var buttonId = String(button && button.id || '');
    var expectedId = buttonId.endsWith('-button') ? buttonId.slice(0, -7) + '-menu' : '';
    if (expectedId) {
      var owned = visible.find(function (menu: any) { return menu.id === expectedId; });
      if (owned) return owned;
    }
    return visible.find(function (menu: any) { return menu.classList.contains('ui-selectmenu-open'); }) || null;
  }

  function selectmenu(el: any, requestedValue: any) {
    var button = findButton(el);
    if (!button) return null;
    var select = findSelectForButton(button);
    if (!select) return Promise.resolve({ success: false, verified: false, settled: true, reason: 'jquery-ui-source-select-not-found' });

    var before = String(select.value || '');
    button.click();
    return new Promise(function (resolve: any) {
      var started = Date.now();
      var poll = setInterval(function () {
        var menu = findVisibleMenu(select.ownerDocument, button);
        var items = menu ? Array.from(menu.querySelectorAll('.ui-menu-item-wrapper')) : [];
        if (!menu || !items.length) {
          if (Date.now() - started >= 3000) {
            clearInterval(poll);
            resolve({ success: false, verified: false, settled: true, reason: 'jquery-ui-menu-not-open', previousValue: before });
          }
          return;
        }

        var options = Array.from(select.options || []);
        var wanted = normalize(requestedValue);
        var option = options.find(function (candidate: any) {
          return normalize(candidate.value) === wanted || normalize(candidate.text) === wanted;
        });
        if (!option) {
          option = options.find(function (candidate: any) {
            var label = normalize(candidate.text);
            return label === wanted || (label && wanted && (label.includes(wanted) || wanted.includes(label)));
          });
        }
        if (!option) {
          clearInterval(poll);
          resolve({ success: false, verified: false, settled: true, reason: 'jquery-ui-option-not-found', optionCount: options.length });
          return;
        }

        var target = items.find(function (item: any) {
          return normalize(text(item)) === normalize(option.text);
        });
        if (!target) {
          clearInterval(poll);
          resolve({ success: false, verified: false, settled: true, reason: 'jquery-ui-menu-option-not-found' });
          return;
        }

        clearInterval(poll);
        target.click();
        setTimeout(function () {
          var selected = String(select.value || '');
          var rendered = button.querySelector('.ui-selectmenu-text');
          var renderedText = text(rendered);
          var expectedText = String(option.text || '').trim();
          var verified = selected === String(option.value) &&
            normalize(renderedText) === normalize(expectedText);
          resolve({
            success: verified,
            verified: verified,
            settled: true,
            reason: verified ? '' : 'jquery-ui-selection-not-confirmed',
            previousValue: before,
            selectedValue: selected,
            selectedText: renderedText,
            waitMs: Date.now() - started,
          });
        }, 100);
      }, 50);
    });
  }

  function isDatepickerInput(el: any) {
    return !!(el && el.classList && el.classList.contains('hasDatepicker'));
  }

  function fillDatepicker(el: any, value: any, parseDateValue: any) {
    if (!isDatepickerInput(el)) return null;
    var rawValue = String(value == null ? '' : value).trim();
    if (!rawValue) return 0;

    // jQuery UI's dateFormat is widget-specific (the default is mm/dd/yy).
    // Pass the original string to setDate so the widget parses it using its
    // configured dateFormat; the generic profile parser is day-first and can
    // silently reinterpret US-formatted dates such as 11/03/2026.
    var jq = root.jQuery || root.$;
    if (jq && jq.fn && typeof jq.fn.datepicker === 'function') {
      try {
        jq(el).datepicker('setDate', rawValue);
        return String(el.value || '').trim() === rawValue ? 1 : 0;
      } catch (e) {
        return 0;
      }
    }

    // Isolated-world fallback: update the input using its native setter and
    // emit the events datepicker and application listeners observe. Do not
    // claim success unless the requested value actually landed.
    var doc = el.ownerDocument;
    var view = doc && doc.defaultView;
    var descriptor = view && view.HTMLInputElement
      ? Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')
      : null;
    if (typeof el.focus === 'function') el.focus();
    if (descriptor && descriptor.set) descriptor.set.call(el, rawValue);
    else el.value = rawValue;
    var EventCtor = view && view.Event ? view.Event : Event;
    ['input', 'change', 'keyup'].forEach(function (eventName: any) {
      el.dispatchEvent(new EventCtor(eventName, { bubbles: true }));
    });
    if (typeof el.blur === 'function') el.blur();
    return String(el.value || '').trim() === rawValue ? 1 : 0;
  }

  root.CcJQueryUiAdapter = {
    isSelectmenuButton: isSelectmenuButton,
    findSelectForButton: findSelectForButton,
    selectmenu: selectmenu,
    isDatepickerInput: isDatepickerInput,
    fillDatepicker: fillDatepicker,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
