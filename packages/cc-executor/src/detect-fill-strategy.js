/**
 * detect-fill-strategy — Fill Strategy Detector
 *
 * Given a DOM element and a type hint, returns the name of the fill strategy
 * that applies to that element. Used to tag fill records and debug events.
 *
 * The strategy registry defines which strategy applies to each widget type
 * and what verification contract it carries.
 *
 * No kernel, no CcExecParts, no Chrome APIs, no async behavior.
 * Strategy detection is pure synchronous DOM property inspection.
 *
 * Public API (on globalThis.CcDetectFillStrategy):
 *   detectFillStrategy(el, type) => string
 *   STRATEGY_REGISTRY: Record<string, StrategyEntry>
 *
 * See detect-fill-strategy.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Named fill strategies with applies predicates and verification contracts.
   *
   * Each strategy:
   *   name        — the strategy identifier (matches the key)
   *   description — human-readable explanation
   *   applies     — function(el, type) => boolean: does this strategy apply?
   *   verify      — verification contract used after filling:
   *                   method: 'visual_text' | 'dom_value'
   *                   check:  function(el, expected) => boolean
   *                   timeout: ms to wait before checking
   *
   * Strategies are tested in registration order. First match wins.
   *
   * @type {Object}
   */
  var STRATEGY_REGISTRY = {
    'ng-dropdown-click': {
      name: 'ng-dropdown-click',
      description: 'Angular custom ng-dropdown: click trigger, wait for li options, click match',
      applies: function (el, type) {
        return type === 'ng-dropdown' || (el && el.classList && el.classList.contains('ng-dropdown'));
      },
      verify: {
        method: 'visual_text',
        check: function (el, expected) {
          var displayed = el.querySelector('.select-type,.value-area,.ng-value-label');
          return displayed ? displayed.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0, 6)) : false;
        },
        timeout: 1000,
      },
    },
    'mat-select-click': {
      name: 'mat-select-click',
      description: 'Angular Material mat-select: click trigger, wait for panel, click option',
      applies: function (el, type) {
        return type === 'mat-select' || (el && el.tagName === 'MAT-SELECT');
      },
      verify: {
        method: 'visual_text',
        check: function (el, expected) {
          var v = el.querySelector('.mat-select-value-text,.mat-mdc-select-value-text');
          return v ? v.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0, 4)) : false;
        },
        timeout: 500,
      },
    },
    'native-select': {
      name: 'native-select',
      description: 'Native <select>: set value via nativeSetter, dispatch change',
      applies: function (el, type) {
        return type === 'select' || (el && el.tagName === 'SELECT');
      },
      verify: {
        method: 'dom_value',
        check: function (el, expected) {
          var norm = function (s) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); };
          return norm(el.value) === norm(expected) ||
            norm((el.options && el.options[el.selectedIndex] && el.options[el.selectedIndex].text) || '').includes(norm(expected).slice(0, 6));
        },
        timeout: 300,
      },
    },
    'dwr-cascade-select': {
      name: 'dwr-cascade-select',
      description: 'ServicePlus DWR cascade: waitForOptions then set value, re-apply after DWR reset',
      applies: function (el, type) {
        return type === 'select' && el && el.getAttribute && el.getAttribute('data-datatype') === 'custLGDHierarchy';
      },
      verify: {
        method: 'dom_value',
        check: function (el, expected) {
          var norm = function (s) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); };
          return norm((el.options && el.options[el.selectedIndex] && el.options[el.selectedIndex].text) || '').includes(norm(expected).slice(0, 4));
        },
        timeout: 500,
      },
    },
    'text-input': {
      name: 'text-input',
      description: 'Text/email/tel input: nativeInputValueSetter + input/change events',
      applies: function (el, type) {
        var EXCLUDED = ['select', 'ng-dropdown', 'mat-select', 'mat-radio', 'mat-checkbox',
          'radio', 'checkbox', 'radio-group', 'radio-click', 'checkbox-group', 'checkbox-agreement'];
        return EXCLUDED.indexOf(type) === -1;
      },
      verify: {
        method: 'dom_value',
        check: function (el, expected) {
          return el.value === expected || el.value.includes(expected.slice(0, 8));
        },
        timeout: 200,
      },
    },
    'radio-click': {
      name: 'radio-click',
      description: 'Click a specific radio option (resolved by planner)',
      applies: function (el, type) {
        return type === 'radio-click' || type === 'radio' || type === 'radio-group' ||
          (el && el.type === 'radio');
      },
      verify: {
        method: 'dom_value',
        check: function (el) {
          return !!(el && (el.checked || (el.querySelector && el.querySelector('input[type=radio]:checked'))));
        },
        timeout: 200,
      },
    },
  };

  /**
   * Returns the name of the first strategy whose applies() predicate matches
   * the given element and type hint.
   *
   * Returns the type hint unchanged if it is not empty and no strategy matched,
   * or 'unknown' if both are empty/null.
   *
   * Never throws — each applies() call is wrapped in try/catch.
   *
   * @param {Element|null} el   The resolved DOM element
   * @param {string} type       Type hint from the fill mapping
   * @returns {string}          Strategy name
   */
  function detectFillStrategy(el, type) {
    var keys = Object.keys(STRATEGY_REGISTRY);
    for (var i = 0; i < keys.length; i++) {
      try {
        if (STRATEGY_REGISTRY[keys[i]].applies(el, type)) return keys[i];
      } catch (e) { /* ignore — defensive against null element in applies */ }
    }
    return type || 'unknown';
  }

  root.CcDetectFillStrategy = {
    detectFillStrategy: detectFillStrategy,
    STRATEGY_REGISTRY: STRATEGY_REGISTRY,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcDetectFillStrategy;
