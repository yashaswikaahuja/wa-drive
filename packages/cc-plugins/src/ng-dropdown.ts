/**
 * ng-dropdown plugin — handles Angular and Vuetify custom selects.
 * jQuery UI Selectmenu is delegated to the dedicated executor adapter.
 */
var TRIGGER_SELECTORS = ['.value-area', '.select-type', '.ng-value-container', '.ng-select-container', '.v-field__input', '.v-select__selection', '.v-field', '.ui-selectmenu-button', '[tabindex]'];
var OPTION_SELECTORS = ['.ng-option', 'mat-option', '.v-list-item', '.ui-menu-item-wrapper', '.dropdown-item', '.option', '[role="option"]', 'li'];
var OVERLAY_SELECTORS = ['app-dropdown', 'ng-dropdown-panel', '.ng-dropdown-panel', '.dropdown-options', '.options-list', '.options', '.v-overlay__content', '.v-menu > .v-overlay__content', '.ui-selectmenu-menu', '.ui-menu', 'ul', 'cdk-overlay-container'];
function findOptionsInContainer(container: any, optSel: any, isVisible: any) {
  if (optSel) return Array.from(container.querySelectorAll(optSel)).filter(isVisible);
  for (var sel of OPTION_SELECTORS) { var items = Array.from(container.querySelectorAll(sel)).filter(isVisible); if (items.length) return items; }
  return [];
}
var NgDropdownPlugin = {
  id: 'ng-dropdown',
  description: 'Angular and Vuetify custom select: open, choose and verify',
  supports(el, fieldContext) {
    if (!el) return false;
    if (fieldContext.type === 'ng-dropdown' || fieldContext.type === 'mat-select') return true;
    if (el.classList && ['ng-dropdown','ng-select','v-select','v-autocomplete','v-combobox'].some(function (c) { return el.classList.contains(c); })) return true;
    if (el.tagName === 'NG-SELECT' || (el.closest && el.closest('ng-select, .v-select, .v-autocomplete, .v-combobox'))) return true;
    var tag = String(el.tagName || '').toLowerCase();
    return tag !== 'select' && tag !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox');
  },
  fill(el, value, context) {
    var adapter = context.portalAdapters || {};
    // jQuery UI Selectmenu owns a generated menu and native <select> source.
    // Keep it out of the generic Angular/Vuetify overlay interaction path.
    var jqueryUi = (typeof globalThis !== 'undefined' && (globalThis as any).CcJQueryUiAdapter) || window.CcJQueryUiAdapter;
    var isJqueryUiSelectmenu = !!(el.classList && el.classList.contains('ui-selectmenu-button'));
    if (isJqueryUiSelectmenu) {
      if (!jqueryUi || !jqueryUi.isSelectmenuButton || !jqueryUi.selectmenu) {
        return Promise.resolve({
          success: false, verified: false, settled: true,
          reason: 'jquery-ui-adapter-unavailable',
        });
      }
      return Promise.resolve(jqueryUi.selectmenu(el, value)).then(function (result: any) {
        return result && result.success && result.verified
          ? result
          : Object.assign({ success: false, verified: false, settled: true }, result || {}, {
              reason: (result && result.reason) || 'jquery-ui-selection-not-confirmed',
            });
      });
    }
    function isVisible(node: any) { return window.ccDomUtils.isVisible(node); }
    var trigger = null;
    if (adapter.triggerSelector) trigger = el.querySelector(adapter.triggerSelector);
    if (!trigger) for (var i = 0; i < TRIGGER_SELECTORS.length; i++) { trigger = el.querySelector(TRIGGER_SELECTORS[i]); if (trigger && isVisible(trigger)) break; trigger = null; }
    if (!trigger) trigger = el;
    trigger.click();
    var startTime = Date.now(), optSel = adapter.optionSelector || null;
    return new Promise((resolve: (v?: any) => void) => {
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        if (Date.now() - startTime > 5000) { clearInterval(poll); resolve({ success: false, settled: true, reason: 'timeout-no-options' }); return; }
        var opts = [];
        if (adapter.optionsContainer) { var configured = document.querySelector(adapter.optionsContainer); if (configured) opts = findOptionsInContainer(configured, optSel, isVisible); }
        if (!opts.length) {
          var panel = el.id ? document.querySelector('[data-owner="' + el.id + '"]') : null;
          if (panel) opts = findOptionsInContainer(panel, optSel, isVisible);
          if (!opts.length && el.nextElementSibling) opts = findOptionsInContainer(el.nextElementSibling, optSel, isVisible);
          if (!opts.length && el.parentElement) { var siblings = Array.from(el.parentElement.children).filter(function (c: any) { return c !== el; }); for (var si = 0; si < siblings.length; si++) { opts = findOptionsInContainer(siblings[si], optSel, isVisible); if (opts.length) break; } }
        }
        if (!opts.length) {
          var rect = el.getBoundingClientRect(), best = [], bestDistance = Infinity;
          for (var oi = 0; oi < OVERLAY_SELECTORS.length; oi++) { var containers = document.querySelectorAll(OVERLAY_SELECTORS[oi]); for (var ci = 0; ci < containers.length; ci++) { var items = findOptionsInContainer(containers[ci], optSel, isVisible); if (!items.length) continue; var cr = containers[ci].getBoundingClientRect(); var distance = Math.abs(cr.left - rect.left) + Math.abs(cr.top - rect.bottom); if (distance < bestDistance) { bestDistance = distance; best = items; } } }
          opts = best;
        }
        if (!opts.length) opts = findOptionsInContainer(el, optSel, isVisible);
        if (!opts.length && attempts < 15) return;
        var texts = opts.map(function (o: any) { return String(o.textContent || '').replace(/\s+/g, ' ').trim(); });
        var matched = window.ccMatchOption(value, texts);
        var match = matched ? opts.find(function (o: any) { return String(o.textContent || '').replace(/\s+/g, ' ').trim() === matched; }) : null;
        if (!match) { if (attempts >= 15) { clearInterval(poll); resolve({ success: false, settled: true, reason: 'no-matching-option', optionCount: opts.length }); } return; }
        clearInterval(poll);
        ['pointerdown','mousedown','pointerup','mouseup'].forEach(function (eventName: any) { match.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true })); });
        if (typeof match.click === 'function') match.click();
        setTimeout(function () {
          var owner = (el.closest && el.closest('.v-select, .v-autocomplete, .v-combobox')) || el;
          var displaySelector = '.value-area,.ng-value-label,.select-type,.mat-mdc-select-min-line,.mat-select-value-text,.v-select__selection-text,.v-select__selection,.v-chip__content';
          var displayed = owner.querySelector && owner.querySelector(displaySelector);
          var input = owner.querySelector && owner.querySelector('input');
          var displayedText = displayed ? String(displayed.textContent || '').replace(/\s+/g, ' ').trim() : (input && String(input.value || '').trim()) || '';
          var selectedText = String(match.textContent || '').replace(/\s+/g, ' ').trim();
          var norm = function (s: any) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
          var actual = norm(displayedText), expected = norm(selectedText);
          var ok = !!actual && (actual === expected || actual.indexOf(expected) !== -1 || expected.indexOf(actual) !== -1);
          resolve({ success: ok, verified: ok, settled: true, reason: ok ? '' : 'selection-not-confirmed', waitMs: Date.now() - startTime, matchedText: selectedText, displayedText: displayedText });
        }, 500);
      }, 250);
    });
  },
  meta: { interactionFamily: 'ng-dropdown', needsStabilization: true, populatesChildren: false, dependsOn: [], waitFor: 'dom-quiet', needsParentValues: false },
};
registerPlugin(NgDropdownPlugin);
