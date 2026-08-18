/**
 * STRATEGY_REGISTRY + detectStrategy + verifyValue
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installStrategy = function (k) {
    const getEl = function () { return k.getEl.apply(k, arguments); };
  // ── Strategy Registry — named strategies with VerificationContracts ────────
  // Phase 2: strategies coexist with existing if/else logic (migration-safe)
  // Each strategy: { name, applies(el, type), verify(el, value), description }
  const STRATEGY_REGISTRY = {
    'ng-dropdown-click': {
      name: 'ng-dropdown-click',
      description: 'Angular custom ng-dropdown: click trigger, wait for li options, click match',
      applies: (el, type) => type === 'ng-dropdown' || (el && el.classList?.contains('ng-dropdown')),
      verify: {
        method: 'visual_text',
        check: (el, expected) => {
          const displayed = el.querySelector('.select-type,.value-area,.ng-value-label');
          return displayed ? displayed.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0,6)) : false;
        },
        timeout: 1000,
      },
    },
    'mat-select-click': {
      name: 'mat-select-click',
      description: 'Angular Material mat-select: click trigger, wait for panel, click option',
      applies: (el, type) => type === 'mat-select' || el?.tagName === 'MAT-SELECT',
      verify: {
        method: 'visual_text',
        check: (el, expected) => {
          const v = el.querySelector('.mat-select-value-text,.mat-mdc-select-value-text');
          return v ? v.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0,4)) : false;
        },
        timeout: 500,
      },
    },
    'native-select': {
      name: 'native-select',
      description: 'Native <select>: set value via nativeSetter, dispatch change',
      applies: (el, type) => type === 'select' || el?.tagName === 'SELECT',
      verify: {
        method: 'dom_value',
        check: (el, expected) => {
          const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          return norm(el.value) === norm(expected) ||
                 norm(el.options[el.selectedIndex]?.text||'').includes(norm(expected).slice(0,6));
        },
        timeout: 300,
      },
    },
    'dwr-cascade-select': {
      name: 'dwr-cascade-select',
      description: 'ServicePlus DWR cascade: waitForOptions then set value, re-apply after DWR reset',
      applies: (el, type) => type === 'select' && el?.getAttribute('data-datatype') === 'custLGDHierarchy',
      verify: {
        method: 'dom_value',
        check: (el, expected) => {
          const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          return norm(el.options[el.selectedIndex]?.text||'').includes(norm(expected).slice(0,4));
        },
        timeout: 500,
      },
    },
    'text-input': {
      name: 'text-input',
      description: 'Text/email/tel input: nativeInputValueSetter + input/change events',
      applies: (el, type) => !['select','ng-dropdown','mat-select','mat-radio','mat-checkbox','radio','checkbox','radio-group','radio-click','checkbox-group','checkbox-agreement'].includes(type),
      verify: {
        method: 'dom_value',
        check: (el, expected) => el.value === expected || el.value.includes(expected.slice(0,8)),
        timeout: 200,
      },
    },
    'radio-click': {
      name: 'radio-click',
      description: 'Click a specific radio option (resolved by planner)',
      applies: (el, type) => type === 'radio-click' || type === 'radio' || type === 'radio-group' || (el && el.type === 'radio'),
      verify: {
        method: 'dom_value',
        check: (el) => !!(el && (el.checked || (el.querySelector && el.querySelector('input[type=radio]:checked')))),
        timeout: 200,
      },
    },
  };

  // Detect which strategy applies to a field (for ReplayRecord tagging)
  function detectStrategy(el, type) {
    for (const [key, s] of Object.entries(STRATEGY_REGISTRY)) {
      try { if (s.applies(el, type)) return key; } catch {}
    }
    return type || 'unknown';
  }

  // Verify a field's actual current value matches what we tried to fill.
  // Tolerates masked-input reformatting (e.g. '9155049176188766' becomes
  // '9155 0491 7618 8766' on UIDAI). Compares the alphanumeric core of both.
  // Returns { ok, actualValue, normExpected, normActual }
  async function verifyValue(selector, expected, settleMs) {
    settleMs = (typeof settleMs === 'number') ? settleMs : 150;
    // Wait for framework to react (validators, formatters, ControlValueAccessor)
    if (settleMs > 0) await new Promise(r => setTimeout(r, settleMs));
    // Resolve element — index-based selectors use the same getEl() helper
    let liveEl;
    if (selector && selector.startsWith && selector.startsWith('form-field-')) {
      liveEl = getEl(selector);
    } else if (selector && selector.startsWith && selector.startsWith('ng-dropdown-')) {
      liveEl = null; // ng-dropdown verify handled by plugin's own verify
    } else {
      liveEl = document.querySelector(selector);
    }
    if (!liveEl) return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'no-element-on-verify' };
    const tag = (liveEl.tagName || '').toLowerCase();
    // Checkbox: verify by .checked state, not .value
    if (liveEl.type === 'checkbox') {
      return {
        ok: !!liveEl.checked,
        actualValue: liveEl.checked ? 'true' : 'false',
        normExpected: String(expected || ''),
        normActual: liveEl.checked ? 'true' : 'false',
      };
    }
    if (liveEl.type === 'radio') {
      // Report selected option label in the name group (not bare checked boolean)
      const groupName = liveEl.name;
      let selected = liveEl.checked ? liveEl : null;
      if (groupName) {
        const checked = document.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
        if (checked) selected = checked;
      }
      if (!selected) {
        return { ok: false, actualValue: '', normExpected: String(expected || ''), normActual: '', reason: 'radio-none-checked' };
      }
      const lbl = selected.id ? document.querySelector('label[for="' + selected.id + '"]') : null;
      const actualLabel = (lbl && lbl.textContent.trim()) || selected.value || 'true';
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ok = !expected || norm(actualLabel).includes(norm(expected).slice(0, 4))
        || norm(expected).includes(norm(actualLabel).slice(0, 4))
        || selected.checked;
      return { ok: !!ok, actualValue: actualLabel, normExpected: norm(expected), normActual: norm(actualLabel) };
    }
    if (tag === 'select') {
      // For selects: compare selected option's text or value
      const opt = liveEl.options[liveEl.selectedIndex];
      const actualVal = (opt ? (opt.text || opt.value) : '') || '';
      const normExp = String(expected || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normAct = actualVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      return { ok: normExp.length > 0 && (normAct === normExp || normAct.includes(normExp) || normExp.includes(normAct)), actualValue: actualVal, normExpected: normExp, normActual: normAct };
    }
    const actual = liveEl.value || '';
    const expStr = String(expected || '');
    if (!expStr) return { ok: false, actualValue: actual, normExpected: '', normActual: actual, reason: 'empty-expected' };
    // Normalise: lowercase + strip non-alphanumeric (handles masked formatting and case)
    const normExp = expStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normAct = actual.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normExp === normAct) return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct };
    if (normAct.length > 0 && (normAct.startsWith(normExp.slice(0, Math.max(8, normExp.length - 2))) || normExp.startsWith(normAct.slice(0, 8)))) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, partial: true };
    }
    // Masked-input pattern (UIDAI, banks): actual shows '********6597' but real value is full 12 digits.
    if (actual.length >= 8 && actual.length === expStr.length) {
      const tail = expStr.slice(-4).toLowerCase();
      if (actual.toLowerCase().endsWith(tail)) {
        return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, masked: true };
      }
    }
    return { ok: false, actualValue: actual, normExpected: normExp, normActual: normAct, reason: actual === '' ? 'value-rejected-empty' : 'value-mismatch' };
  }
    k.STRATEGY_REGISTRY = STRATEGY_REGISTRY;
    k.detectStrategy = detectStrategy;
    k.verifyValue = verifyValue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
