/**
 * fillOne dispatcher — resolve el/elType, run handlers in order.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOne = function (k) {
    k.fillOneHandlers = k.fillOneHandlers || [];

    function resolveEl(selector) {
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        return all[parseInt(selector.split('-')[2], 10)];
      }
      if (selector.startsWith('ng-dropdown-')) {
        return document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2], 10)];
      }
      return document.querySelector(selector);
    }

    function detectElType(el, type) {
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'select') return 'select';
      if (tagName === 'ng-select') return 'ng-dropdown';
      if (tagName === 'mat-select') return 'mat-select';
      if (tagName === 'mat-checkbox') return 'mat-checkbox';
      if (tagName === 'mat-radio-button') return 'mat-radio';
      if (el.classList && (el.classList.contains('ng-dropdown') || el.classList.contains('ng-select'))) return 'ng-dropdown';
      if (tagName !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) return 'ng-dropdown';
      return el.type || type || 'text';
    }

    k.fillOne = function fillOne(selector, value, type) {
      try {
        const el = resolveEl(selector);
        if (!el) return 0;
        const elType = detectElType(el, type);
        console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
        const handlers = k.fillOneHandlers || [];
        for (let i = 0; i < handlers.length; i++) {
          const r = handlers[i].try(el, selector, value, type, elType);
          if (r !== null && r !== undefined) return r;
        }
        return 0;
      } catch (e) {
        return 0;
      }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
