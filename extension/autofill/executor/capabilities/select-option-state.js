/**
 * select-option-state — Native Select Element State Reader
 *
 * Pure DOM-reading functions for inspecting a native <select> element's
 * current state without modifying it.
 *
 * No kernel, no CcExecParts, no Chrome APIs, no cascade knowledge.
 * Safe to use in any browser context.
 *
 * Public API (on globalThis.CcSelectOptionState):
 *   isPlaceholderOption(option) => boolean
 *   realOptions(el) => HTMLOptionElement[]
 *   sampleOptions(el, n?) => {value, text}[]
 *   readSelectActual(el) => {actualValue, actualOptionValue}
 *   selectLoadMode(el) => 'static' | 'ajax' | 'unknown'
 *   selectIsActive(el) => boolean
 *   isPlaceholderPlanned(value) => boolean
 *
 * See select-option-state.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Returns true if the given <option> element is a placeholder — i.e. it
   * represents "nothing selected" rather than a real selectable value.
   *
   * Placeholder rules (any one is sufficient):
   *   - option is null/undefined
   *   - value is empty string, '0', or '-1'
   *   - text (lowercased) is empty, '--', or contains 'select', 'choose', 'loading'
   *
   * @param {HTMLOptionElement|null|undefined} o
   * @returns {boolean}
   */
  function isPlaceholderOption(o) {
    if (!o) return true;
    var v = String(o.value == null ? '' : o.value).trim();
    var t = String(o.text || '').trim().toLowerCase();
    if (!v || v === '0' || v === '-1' || v === '') return true;
    if (!t || t === '--' || t.includes('select') || t.includes('choose') || t.includes('loading')) return true;
    return false;
  }

  /**
   * Returns the non-placeholder options from a <select> element.
   * Returns [] for null/undefined elements or elements without options.
   *
   * @param {HTMLSelectElement|null|undefined} el
   * @returns {HTMLOptionElement[]}
   */
  function realOptions(el) {
    if (!el || !el.options) return [];
    return Array.from(el.options).filter(function (o) { return !isPlaceholderOption(o); });
  }

  /**
   * Returns up to n non-placeholder options as plain objects for debug logging.
   * Default n = 8. Value truncated to 40 chars, text to 60 chars.
   *
   * @param {HTMLSelectElement|null|undefined} el
   * @param {number} [n=8]
   * @returns {{value: string, text: string}[]}
   */
  function sampleOptions(el, n) {
    n = n || 8;
    return realOptions(el).slice(0, n).map(function (o) {
      return {
        value: String(o.value || '').slice(0, 40),
        text: String(o.text || '').trim().slice(0, 60),
      };
    });
  }

  /**
   * Reads the currently selected value from a <select> element.
   * Returns the displayed text and the raw value of the selected option.
   * If nothing meaningful is selected (placeholder or no selection):
   *   actualValue is '' and actualOptionValue is the raw option value (or '').
   *
   * Returns {actualValue: null, actualOptionValue: null} for non-select elements.
   *
   * @param {HTMLSelectElement|null|undefined} el
   * @returns {{actualValue: string|null, actualOptionValue: string|null}}
   */
  function readSelectActual(el) {
    if (!el || el.tagName !== 'SELECT') return { actualValue: null, actualOptionValue: null };
    var opt = el.options && el.options[el.selectedIndex];
    if (!opt || isPlaceholderOption(opt)) {
      return { actualValue: '', actualOptionValue: opt ? String(opt.value || '') : '' };
    }
    return {
      actualValue: String(opt.text || '').trim(),
      actualOptionValue: String(opt.value || ''),
    };
  }

  /**
   * Determines whether a <select> element has real options loaded yet.
   *
   * 'static'  — has one or more real (non-placeholder) options
   * 'ajax'    — empty or only placeholder options (AJAX child waiting for parent)
   * 'unknown' — null/undefined element or not a SELECT
   *
   * @param {HTMLSelectElement|null|undefined} el
   * @returns {'static'|'ajax'|'unknown'}
   */
  function selectLoadMode(el) {
    if (!el || el.tagName !== 'SELECT') return 'unknown';
    return realOptions(el).length > 0 ? 'static' : 'ajax';
  }

  /**
   * Returns true if the <select> element is both present and interactable
   * (not disabled, not visibility-hidden).
   *
   * The visibility check uses offsetParent === null + getClientRects().length === 0
   * as a heuristic. This is a DOM-based check, not a CSS visibility check —
   * it will correctly detect most hidden selects but not all CSS-only hidden elements.
   *
   * @param {HTMLSelectElement|null|undefined} el
   * @returns {boolean}
   */
  function selectIsActive(el) {
    if (!el) return false;
    if (el.disabled) return false;
    try {
      if (el.offsetParent === null && el.getClientRects && el.getClientRects().length === 0) return false;
    } catch (e) { /* ignore — some environments throw on hidden elements */ }
    return true;
  }

  /**
   * Returns true if the planned fill value is itself a placeholder — i.e. the
   * profile data contains "Select", "--", "0", "Please select", etc. rather than
   * a real value to fill.
   *
   * This is distinct from isPlaceholderOption which operates on DOM option elements.
   * This operates on the string value from the profile/mapping.
   *
   * @param {string|null|undefined} v
   * @returns {boolean}
   */
  function isPlaceholderPlanned(v) {
    var t = String(v == null ? '' : v).toLowerCase().trim();
    return !t || t === '--' || t === '0' || t.includes('please select') || t === 'select' || t.startsWith('select ');
  }

  root.CcSelectOptionState = {
    isPlaceholderOption: isPlaceholderOption,
    realOptions: realOptions,
    sampleOptions: sampleOptions,
    readSelectActual: readSelectActual,
    selectLoadMode: selectLoadMode,
    selectIsActive: selectIsActive,
    isPlaceholderPlanned: isPlaceholderPlanned,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
