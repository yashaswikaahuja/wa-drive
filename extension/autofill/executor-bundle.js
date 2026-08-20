/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/executor/*.js + executor.js
 * Rebuild: node extension/autofill/build-executor-bundle.mjs
 */

/* ==== kernel-bind.js ==== */
/**
 * Shared kernel locals for executor task modules.
 * Avoids repeating 35-line alias blocks in every file (keeps parts ≤200 lines).
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};

  /**
   * @param {object} k — fill kernel
   * @returns {object} local aliases matching the old closure names
   */
  root.CcExecParts.bindKernelLocals = function bindKernelLocals(k) {
    return {
      portalAdapters: k.portalAdapters,
      filledBySource: k.filledBySource,
      mapping: k.mapping,
      allFields: k.allFields,
      _replayResults: k.replayResults,
      _ccRecords: k.records,
      RUNTIME_VERSION: k.RUNTIME_VERSION,
      STRATEGY_VERSION: k.STRATEGY_VERSION,
      WAIT_ENGINE_VERSION: k.WAIT_ENGINE_VERSION,
      _CC_USE_PLUGINS: k.CC_USE_PLUGINS,
      _CC_LEGACY_COMPARE: k.CC_LEGACY_COMPARE,
      PRIORITY_KEYS: k.PRIORITY_KEYS,
      entries: k.entries,
      getEl: function () { return k.getEl.apply(k, arguments); },
      _emitFillDebug: function () { return k.emitFillDebug.apply(k, arguments); },
      _flushRecords: function () { return k.flushRecords(); },
      _pushSelectRecord: function () { return k.pushSelectRecord.apply(k, arguments); },
      settleAfterAct: function () {
        if (typeof k.settleAfterAct !== 'function') {
          return Promise.resolve({ idle: true, waitedMs: 0, kind: 'text' });
        }
        return k.settleAfterAct.apply(k, arguments);
      },
      waitForSelectOptionsSequential: function () {
        if (typeof k.waitForSelectOptionsSequential !== 'function') {
          return Promise.resolve(null);
        }
        return k.waitForSelectOptionsSequential.apply(k, arguments);
      },
      waitForOptions: function () {
        if (typeof k.waitForOptions !== 'function') return Promise.resolve(null);
        return k.waitForOptions.apply(k, arguments);
      },
      waitForDOMQuiet: function (ms) {
        if (typeof k.waitForDOMQuiet === 'function') {
          return k.waitForDOMQuiet.apply(k, arguments);
        }
        // Fallback — must never throw "waitForDOMQuiet is not defined"
        return new Promise(function (r) { setTimeout(r, ms || 300); });
      },
      waitForNetworkIdle: function (q, m) {
        if (typeof k.waitForNetworkIdle === 'function') {
          return k.waitForNetworkIdle.apply(k, arguments);
        }
        if (typeof window !== 'undefined' && window.ccWaitForNetworkIdle) {
          return window.ccWaitForNetworkIdle(q || 200, m || 8000);
        }
        return Promise.resolve({ idle: true, waitedMs: 0 });
      },
      detectStrategy: function () {
        if (typeof k.detectStrategy !== 'function') return 'unknown';
        return k.detectStrategy.apply(k, arguments);
      },
      verifyValue: function () {
        if (typeof k.verifyValue !== 'function') {
          return Promise.resolve({ ok: false, actualValue: '', reason: 'no-verify' });
        }
        return k.verifyValue.apply(k, arguments);
      },
      _isPlaceholderOption: function () {
        return typeof k.isPlaceholderOption === 'function'
          ? k.isPlaceholderOption.apply(k, arguments)
          : false;
      },
      _realOptions: function () {
        return typeof k.realOptions === 'function' ? k.realOptions.apply(k, arguments) : [];
      },
      _sampleOptions: function () {
        return typeof k.sampleOptions === 'function' ? k.sampleOptions.apply(k, arguments) : [];
      },
      _readSelectActual: function () {
        return typeof k.readSelectActual === 'function'
          ? k.readSelectActual.apply(k, arguments)
          : { actualValue: null, actualOptionValue: null };
      },
      _selectLoadMode: function () {
        return typeof k.selectLoadMode === 'function' ? k.selectLoadMode.apply(k, arguments) : 'unknown';
      },
      _cascadeSemanticKey: function () {
        return typeof k.cascadeSemanticKey === 'function'
          ? k.cascadeSemanticKey.apply(k, arguments)
          : '';
      },
      _CASCADE_PARENTS: k.CASCADE_PARENTS,
      _cascadeSettled: k.cascadeSettled,
      _isPlaceholderPlanned: function () {
        return typeof k.isPlaceholderPlanned === 'function'
          ? k.isPlaceholderPlanned.apply(k, arguments)
          : false;
      },
      _selectIsActive: function () {
        return typeof k.selectIsActive === 'function' ? k.selectIsActive.apply(k, arguments) : true;
      },
      fillOne: function () {
        if (typeof k.fillOne !== 'function') return 0;
        return k.fillOne.apply(k, arguments);
      },
      k: k,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== debug.js ==== */
/**
 * Live fill_debug emit (port + batch queue)
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDebug = function (k) {
    k._debugPort = null;
    k._debugQueue = [];
    k._debugFlushTimer = null;
  function ensureDebugPort() {
    if (k._debugPort) return k._debugPort;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) return null;
      k._debugPort = chrome.runtime.connect({ name: 'cc_fill_debug' });
      k._debugPort.onDisconnect.addListener(function () {
        k._debugPort = null;
      });
    } catch (e) {
      k._debugPort = null;
    }
    return k._debugPort;
  }
  function flushDebugQueue() {
    if (!k._debugQueue.length) return;
    const batch = k._debugQueue.splice(0, 40);
    try {
      const port = ensureDebugPort();
      if (port) {
        port.postMessage({ type: 'FILL_DEBUG_BATCH', events: batch });
        if (k._debugQueue.length) scheduleDebugFlush();
        return;
      }
    } catch (e) {
      k._debugPort = null;
    }
    // Fallback: one-by-one sendMessage (best-effort)
    for (let i = 0; i < batch.length; i++) {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: 'FILL_DEBUG' }, batch[i]), function () {
          void chrome.runtime.lastError;
        });
      } catch (e2) {
        /* ignore */
      }
    }
    if (k._debugQueue.length) scheduleDebugFlush();
  }
  function scheduleDebugFlush() {
    if (k._debugFlushTimer) return;
    k._debugFlushTimer = setTimeout(function () {
      k._debugFlushTimer = null;
      flushDebugQueue();
    }, 40);
  }
  function emitFillDebug(event, payload) {
    const evt = Object.assign(
      {
        event: event,
        fillRunId: k.fillRunId,
        hostname: typeof location !== 'undefined' ? location.hostname : '',
        ts: Date.now(),
        rv: k.RUNTIME_VERSION,
      },
      payload || {}
    );
    // Rename field widget type so it doesn't clash with message type
    if (evt.type && evt.type !== 'FILL_DEBUG') {
      evt.fieldType = evt.type;
      delete evt.type;
    }
    k._debugQueue.push(evt);
    // Start/end and large batches flush immediately; field.* coalesce ~40ms
    if (event === 'fill.start' || event === 'fill.end' || k._debugQueue.length >= 6) {
      if (k._debugFlushTimer) {
        clearTimeout(k._debugFlushTimer);
        k._debugFlushTimer = null;
      }
      flushDebugQueue();
    } else {
      scheduleDebugFlush();
    }
  }
    k.emitFillDebug = emitFillDebug;
    k.flushDebugQueue = flushDebugQueue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/cascade-field-level.js ==== */
/**
 * cascade-field-level — Cascade Geography Level Identifier
 *
 * Identifies which level of India's administrative cascade hierarchy a form field
 * belongs to, and provides the parent-dependency map (which levels must be settled
 * before a given level can be filled).
 *
 * Pure JavaScript — no DOM, no Chrome, no imports.
 * Safe to use in browser (executor) and Node.js (extension-service fill planner).
 *
 * Public API (on globalThis.CcCascadeFieldLevel):
 *   cascadeFieldLevel(label, profileKey, selector) => string
 *   CASCADE_PARENTS: Record<string, string[]>
 *
 * See cascade-field-level.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Parent-dependency map.
   * For each cascade level, lists which levels must be filled and settled first.
   * 'state' has no entry — it has no parents.
   *
   * @type {Record<string, string[]>}
   */
  var CASCADE_PARENTS = {
    district:       ['state'],
    sub_division:   ['district', 'state'],
    block:          ['district', 'sub_division', 'state'],
    panchayat:      ['block', 'district'],
    village:        ['block', 'district'],
    police_station: ['district', 'block'],
    post_office:    ['block', 'village', 'district'],
  };

  /**
   * Identify which cascade level a form field belongs to.
   *
   * Concatenates profileKey + label + selector (all lower-cased) and tests
   * against English and Hindi Unicode keyword patterns for each cascade level.
   *
   * Returns the level name ('state', 'district', 'sub_division', 'block',
   * 'panchayat', 'village', 'police_station', 'post_office', 'pin_code')
   * or '' if the field does not belong to any cascade level.
   *
   * Never throws. Null/undefined inputs are treated as empty strings.
   *
   * @param {string|null|undefined} label      Field label text from the form DOM
   * @param {string|null|undefined} profileKey Profile data key (e.g. 'state')
   * @param {string|null|undefined} selector   CSS selector or form-field-N string
   * @returns {string}
   */
  function cascadeFieldLevel(label, profileKey, selector) {
    var s = ((profileKey || '') + ' ' + (label || '') + ' ' + (selector || '')).toLowerCase();

    // sub_division must be tested before state to avoid 'sub division' matching 'state'
    if (/sub[_\s-]*div|अनुमंडल|subdivision/.test(s)) return 'sub_division';

    // state: only match if 'sub' is not also present (prevents sub_division misclassification)
    if (/state|rajya|राज्य/.test(s) && !/sub/.test(s)) return 'state';

    if (/district|jila|जिला/.test(s)) return 'district';
    if (/block|prakhand|प्रखंड|tehsil|taluka/.test(s)) return 'block';
    if (/panchayat|पंचायत/.test(s)) return 'panchayat';
    if (/village|gram|ग्राम|mohalla|मोहल्ला/.test(s)) return 'village';
    if (/police|thana|थाना/.test(s)) return 'police_station';
    if (/post[_\s-]*office|डाक/.test(s)) return 'post_office';
    if (/\bpin\b|pincode|pin[_\s-]*code|पिन/.test(s)) return 'pin_code';

    return '';
  }

  root.CcCascadeFieldLevel = {
    cascadeFieldLevel: cascadeFieldLevel,
    CASCADE_PARENTS: CASCADE_PARENTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/select-option-state.js ==== */
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

/* ==== select-helpers.js ==== */
/**
 * Select/cascade helpers + pushSelectRecord
 * Part of sequential kernel — load before autofill/executor.js
 *
 * select-option-state.js is the single source of truth for the 7 pure select
 * state functions. This file re-exposes them on the kernel (k) for existing
 * consumers that access them via bindKernelLocals(k).
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSelectHelpers = function (k) {

  // ── Delegate to capabilities/select-option-state.js ──────────────────────
  // Must be loaded before select-helpers.js (see build-executor-bundle.mjs ORDER).
  var _sos = root.CcSelectOptionState || {};
  var isPlaceholderOption  = _sos.isPlaceholderOption  || function () { return true; };
  var realOptions          = _sos.realOptions          || function () { return []; };
  var sampleOptions        = _sos.sampleOptions        || function () { return []; };
  var readSelectActual     = _sos.readSelectActual     || function () { return { actualValue: null, actualOptionValue: null }; };
  var selectLoadMode       = _sos.selectLoadMode       || function () { return 'unknown'; };
  var selectIsActive       = _sos.selectIsActive       || function () { return false; };
  var isPlaceholderPlanned = _sos.isPlaceholderPlanned || function () { return true; };
  // cascade-field-level.js is the single source of truth for cascade geography.
  // It must be loaded before select-helpers.js (see build-executor-bundle.mjs ORDER).
  var _cascadeGeo = root.CcCascadeFieldLevel;
  function cascadeSemanticKey(label, profileKey, selector) {
    return _cascadeGeo
      ? _cascadeGeo.cascadeFieldLevel(label, profileKey, selector)
      : ''; // safe fallback if loaded out of order
  }
  /** Parent keys that must be settled before this cascade key. */
  k.CASCADE_PARENTS = _cascadeGeo ? _cascadeGeo.CASCADE_PARENTS : {};
  // ── Cascade geography (delegated to capabilities/cascade-field-level.js) ─

  function pushSelectRecord(base) {
    const rec = Object.assign(
      {
        ts: Date.now(),
        rv: k.RUNTIME_VERSION,
        fillMode: 'sequential',
      },
      base
    );
    k.records.push(rec);
    k.flushRecords();
    const result = String(rec.result || '');
    if (result === 'filled' || result === 'succeeded') {
      k.emitFillDebug('field.done', {
        selector: rec.selector,
        label: rec.label,
        type: rec.type,
        planned: rec.value,
        actual: rec.actualValue,
        strategy: rec.strategy,
      });
    } else if (result === 'skipped' || result === 'failed' || result === 'error' || result === 'waiting_human') {
      k.emitFillDebug(result === 'waiting_human' ? 'field.wait' : 'field.fail', {
        selector: rec.selector,
        label: rec.label,
        type: rec.type,
        planned: rec.value,
        actual: rec.actualValue,
        failReason: rec.failReason || rec.error || result,
        strategy: rec.strategy,
      });
    }
    return rec;
  }
    k.isPlaceholderOption = isPlaceholderOption;
    k.realOptions = realOptions;
    k.sampleOptions = sampleOptions;
    k.readSelectActual = readSelectActual;
    k.selectLoadMode = selectLoadMode;
    k.cascadeSemanticKey = cascadeSemanticKey;
    k.isPlaceholderPlanned = isPlaceholderPlanned;
    k.selectIsActive = selectIsActive;
    k.pushSelectRecord = pushSelectRecord;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== settle.js ==== */
/**
 * settleAfterAct + WaitEngine
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function (k) {
  async function settleAfterAct(kind, opts) {
    opts = opts || {};
    const budget = typeof opts.budgetMs === 'number' ? opts.budgetMs : k.ajaxWaitBudgetMs;
    if (kind === 'text') {
      await new Promise((r) => setTimeout(r, 100));
      return { idle: true, waitedMs: 100, kind: 'text' };
    }
    // Let DWR/XHR kick off after change/click
    const kick = kind === 'button' ? 300 : 200;
    await new Promise((r) => setTimeout(r, kick));
    let maxNet = kind === 'button' ? 5000 : kind === 'select' ? 4500 : 3500;
    maxNet = Math.min(maxNet, Math.max(300, budget > 0 ? budget : 400));
    const quiet = kind === 'select' ? 150 : 120;
    const t0 = Date.now();
    const net = await waitForNetworkIdle(quiet, maxNet);
    const used = Date.now() - t0;
    k.ajaxWaitBudgetMs = Math.max(0, k.ajaxWaitBudgetMs - used);
    return Object.assign({ kind: kind }, net);
  }

  /** Before acting on a select with no options yet: wait (previous field may have been radio). */
  async function waitForSelectOptionsSequential(selector, maxMs) {
    maxMs = Math.min(maxMs || 6000, Math.max(400, k.ajaxWaitBudgetMs || 400));
    const t0 = Date.now();
    // First a general settle (covers radio→ajax-select)
    await settleAfterAct('choice', { budgetMs: Math.min(2000, maxMs) });
    const left = Math.max(300, maxMs - (Date.now() - t0));
    const el = await waitForOptions(selector, 1, left);
    k.ajaxWaitBudgetMs = Math.max(0, k.ajaxWaitBudgetMs - (Date.now() - t0));
    return el;
  }

  function waitForOptions(selector, minCount, timeout) {
    minCount = minCount || 1; timeout = timeout || 8000;
    return new Promise(function(resolve) {
      var deadline = Date.now() + timeout;
      var resolved = false;
      var poll, mo;
      function cleanup(val) {
        if (resolved) return;
        resolved = true;
        if (poll) clearInterval(poll);
        if (mo) mo.disconnect();
        resolve(val);
      }
      function check() {
        if (resolved) return;
        var el = document.querySelector(selector);
        var real = Array.from(el ? el.options || [] : []).filter(function(o) {
          return o.value && o.value !== '0' && o.value !== '' && o.value !== '-1';
        });
        if (real.length >= minCount) { cleanup(el); return; }
        if (Date.now() > deadline) { cleanup(null); return; }
      }
      mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
      check();
      poll = setInterval(function() {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
  }

  function waitForDOMQuiet(ms) {
    ms = ms || 300;
    return new Promise(function(resolve) {
      var last = Date.now();
      var mo = new MutationObserver(function() { last = Date.now(); });
      mo.observe(document.body, { childList: true, subtree: true });
      var check = setInterval(function() {
        if (Date.now() - last >= ms) { clearInterval(check); mo.disconnect(); resolve(); }
      }, 50);
      setTimeout(function() { clearInterval(check); mo.disconnect(); resolve(); }, 5000);
    });
  }

  /**
   * Resolve when the page network has been idle for `quietMs` consecutive
   * milliseconds. Delegates to shared/network-idle.js.
   */
  function waitForNetworkIdle(quietMs, maxMs) {
    return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8000);
  }
    k.settleAfterAct = settleAfterAct;
    k.waitForSelectOptionsSequential = waitForSelectOptionsSequential;
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/resolve-cc-selector.js ==== */
/**
 * resolve-cc-selector — CC-Style Selector Resolver
 *
 * Resolves a CyberControl selector string to a DOM element.
 * Handles three formats:
 *   form-field-N    → Nth visible form control (input/select/textarea)
 *   ng-dropdown-N   → Nth div.ng-dropdown
 *   <css selector>  → document.querySelector(selector)
 *
 * The document is injectable for testing (jsdom) and cross-frame use.
 * No Chrome API, no CcExecParts, no kernel, no fill state.
 *
 * Public API (on globalThis.CcResolveCcSelector):
 *   resolveCcSelector(selector, doc?) => Element | null
 *
 * See resolve-cc-selector.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Query string for form-field-N resolution.
   * Covers all visible form control types used on government forms.
   * Excludes input[type=hidden] intentionally.
   */
  var FORM_FIELD_QUERY = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="date"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'input:not([type])',
    'textarea',
    'select',
  ].join(',');

  /**
   * Resolve a cc-style selector to a DOM element.
   *
   * @param {string} selector
   * @param {Document} [doc] - document to query against (defaults to global document)
   * @returns {Element|null}
   */
  function resolveCcSelector(selector, doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return null;

    if (selector.startsWith('form-field-')) {
      var idx = parseInt(selector.slice('form-field-'.length), 10);
      var all = d.querySelectorAll(FORM_FIELD_QUERY);
      return all[idx] || null;
    }

    if (selector.startsWith('ng-dropdown-')) {
      var ngIdx = parseInt(selector.slice('ng-dropdown-'.length), 10);
      var dropdowns = d.querySelectorAll('div.ng-dropdown');
      return dropdowns[ngIdx] || null;
    }

    return d.querySelector(selector);
  }

  root.CcResolveCcSelector = {
    resolveCcSelector: resolveCcSelector,
    /** Exposed for consumers that need to build compatible form-field selectors. */
    FORM_FIELD_QUERY: FORM_FIELD_QUERY,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== dom-order.js ==== */
/**
 * getEl + PRIORITY_KEYS + DOM-order entries
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDomOrder = function (k) {

    // resolve-cc-selector.js is the single owner of cc-style selector resolution.
    // It must be loaded before dom-order.js (see build-executor-bundle.mjs ORDER).
    var _resolve = root.CcResolveCcSelector
      ? root.CcResolveCcSelector.resolveCcSelector
      : function (sel) { return document.querySelector(sel); }; // safe fallback

    function getEl(sel) {
      return _resolve(sel);
    }
    k.getEl = getEl;
    // PRIORITY_KEYS: keywords used to detect cascade-geography fields during DOM sort.
    // Derived from the single authoritative source: cascade-field-level.js
    // Kept as a flat keyword array for the sort classifier (field label contains any of these).
    k.PRIORITY_KEYS = [
      'state', 'rajya', 'राज्य',
      'district', 'jila', 'जिला',
      'sub_division', 'subdivision', 'sub-division', 'अनुमंडल',
      'block', 'prakhand', 'प्रखंड',
      'panchayat', 'village_panchayat', 'पंचायत',
      'village', 'gram', 'ग्राम', 'mohalla', 'मोहल्ला',
      'tehsil', 'taluka', 'तहसील',
      'police_station', 'police-station', 'thana', 'थाना',
      'post_office', 'post-office', 'डाक घर',
      'pin_code', 'pincode', 'पिन',
      'municipal', 'नगर',
    ];
    k.entries = Object.entries(k.mapping || {});
    k.entries.sort(([sa], [sb]) => {
      const a = getEl(sa), b = getEl(sb);
      if (!a || !b) return 0;
      if (a === b) return 0;
      if (typeof a.compareDocumentPosition !== 'function') return 0;
      const following = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) || 4;
      return a.compareDocumentPosition(b) & following ? -1 : 1;
    });

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== strategy.js ==== */
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

/* ==== fill-one-ng-helpers.js ==== */
/**
 * ng-dropdown shared helpers (score/pick/visible)
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNgHelpers = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k._ngIsVisible = function (node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    };

    /** Score option text against planned value (higher = better). */
    k._ngScoreOption = function (optText, planned) {
      const ot = String(optText || '').trim().toLowerCase();
      const v = String(planned || '').trim().toLowerCase();
      if (!ot || !v) return 0;
      if (ot === v) return 100;
      if (ot.startsWith(v) || v.startsWith(ot)) return 80;
      if (ot.includes(v) || v.includes(ot)) return 60;
      const otTok = ot.split(/[^a-z0-9]+/).filter(Boolean);
      const vTok = v.split(/[^a-z0-9]+/).filter(Boolean);
      let hit = 0;
      for (let i = 0; i < vTok.length; i++) if (otTok.includes(vTok[i])) hit++;
      if (hit && hit === vTok.length) return 50;
      if (hit) return 30 + hit;
      return 0;
    };

    k._ngCancelSession = function (_label) {
      if (!window._ccReplaySessions || !window._ccReplaySessions.has(_label)) return;
      const old = window._ccReplaySessions.get(_label);
      old.cancelled = true;
      clearInterval(old.pollTimer);
      old.timeoutIds.forEach((id) => clearTimeout(id));
      if (old.observer) old.observer.disconnect();
      window._ccReplaySessions.delete(_label);
    };

    k._ngPickOption = function (opts, planned) {
      let best = null;
      let bestScore = 0;
      for (let i = 0; i < opts.length; i++) {
        const text = (opts[i].textContent || opts[i].innerText || '').trim();
        const sc = k._ngScoreOption(text, planned);
        if (sc > bestScore) {
          bestScore = sc;
          best = opts[i];
        }
      }
      return bestScore >= 30 ? best : null;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-ng.js ==== */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  // Minimal fallback if fill-one-ng-helpers.js did not inject
  root.CcExecParts.installFillOneNgHelpers = root.CcExecParts.installFillOneNgHelpers || function (k) {
    k._ngCancelSession = function (label) {
      const old = window._ccReplaySessions && window._ccReplaySessions.get(label);
      if (!old) return;
      old.cancelled = true; try { clearInterval(old.pollTimer); } catch (e) {}
      (old.timeoutIds || []).forEach(function (id) { clearTimeout(id); });
      if (old.observer) old.observer.disconnect();
      window._ccReplaySessions.delete(label);
    };
  };
  root.CcExecParts.installFillOneNg = function (k) {
    root.CcExecParts.installFillOneNgHelpers(k);
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters, filledBySource = b.filledBySource;
    const _replayResults = b._replayResults, _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION, _flushRecords = b._flushRecords;
    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
        const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];
        if (adapter) {
          const _label = filledBySource[selector]?.label || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;
          if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
          k._ngCancelSession && k._ngCancelSession(_label);
          const session = { id: Math.random().toString(36).slice(2,8), fieldKey: _label, resolved: false, cancelled: false, pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
          window._ccReplaySessions.set(_label, session);
          function isVisible(node) {
            return window.ccDomUtils.isVisible(node);
          }
          function cleanupSession(result) {
            if (session.resolved && result !== session._result) return; // already resolved, don't overwrite
            session.resolved = true;
            session._result = result;
            clearInterval(session.pollTimer);
            session.timeoutIds.forEach(id => clearTimeout(id));
            if (session.observer) { session.observer.disconnect(); session.observer = null; }
            window._ccReplaySessions.delete(_label);
            _replayResults[_label] = result;
            sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
            const _isOk = result === 'ok';
            _ccRecords.push({ selector, value, type: 'ng-dropdown', result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result, strategy: 'ng-dropdown-click', durationMs: Date.now()-session.startedAt, ts: Date.now(), rv: RUNTIME_VERSION });
            _flushRecords();
          }
          const OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
                '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
          const addedNodes = [];
          const _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0, optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };
          trigger.click();
          const mo = new MutationObserver(mutations => {
            if (session.cancelled || session.resolved) return;
            for (const m of mutations) {
              m.addedNodes.forEach(n => { if (n.nodeType === 1) addedNodes.push(n); });
            }
          });
          session.observer = mo;
          mo.observe(document.body, { childList: true, subtree: true });
          let _lastMutation = Date.now();
          const _stabilizeMo = new MutationObserver(() => { _lastMutation = Date.now(); });
          _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });
          function waitStable(cb) {
            const check = setInterval(() => {
              if (session.cancelled) { clearInterval(check); _stabilizeMo.disconnect(); return; }
              if (Date.now() - _lastMutation >= 150) { clearInterval(check); _stabilizeMo.disconnect(); cb(); }
            }, 50);
            const capId = setTimeout(() => { clearInterval(check); _stabilizeMo.disconnect(); if (!session.cancelled) cb(); }, 1200);
            session.timeoutIds.push(capId);
          }
          waitStable(() => {
            if (session.cancelled || session.resolved) return;
            mo.disconnect();
            session.observer = null;
            _trace.mutationCount = addedNodes.length;
            let activeOverlayRoot = null;
            const trigRect = trigger.getBoundingClientRect();
            for (const node of addedNodes) {
              if (!isVisible(node)) continue;
              const _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
              const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (lis.length > 0) { activeOverlayRoot = node; break; }
            }
            if (!activeOverlayRoot) {
              let bestDist = Infinity;
              OVERLAY_TAGS.forEach(sel => {
                try {
          document.querySelectorAll(sel).forEach(node => {
            const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
            if (lis.length === 0) return;
            const r = node.getBoundingClientRect();
            const dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
            if (dist < bestDist) { bestDist = dist; activeOverlayRoot = node; }
          });
                } catch {}
              });
            }
            if (!activeOverlayRoot && adapter.optionsContainer) {
              activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
            }
            if (!activeOverlayRoot) {
              const rootLis = Array.from(root.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (rootLis.length > 0) activeOverlayRoot = root;
            }
            _trace.overlayFound = !!activeOverlayRoot;
            _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0,40) : 'NONE';
            let attempts = 0;
            session.pollTimer = setInterval(() => {
              if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
              attempts++;
              const searchRoot = activeOverlayRoot || root;
              let opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (opts.length === 0 && searchRoot !== document) {
                opts = Array.from(document.querySelectorAll(_optQ)).filter(o => isVisible(o) && root.contains(o) === false && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]'));
              }
              const v = value.toLowerCase().trim();
              _trace.optionCount = opts.length;
              function _matchScore(optText) {
                const ot = optText.toLowerCase().trim();
                if (ot === v) return 100;
                if (ot.includes(v)) return 80;
                if (v.includes(ot) && ot.length > 3) return 70;
                const vToks = v.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const oToks = ot.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const overlap = vToks.filter(t => oToks.some(o => o.includes(t) || t.includes(o))).length;
                if (overlap >= 2) return 60;
                if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
                const eduSynonyms = [
          ['intermediate','higher secondary','10+2','12th','hsc','senior secondary'],
          ['matriculation','10th','sslc','secondary','high school','class 10','class x'],
          ['graduation','graduate','degree','bachelor','ug'],
          ['post graduation','post graduate','masters','pg','m.a','m.sc','m.com'],
                ];
                for (const group of eduSynonyms) {
          const vIn = group.some(s => v.includes(s));
          const oIn = group.some(s => ot.includes(s));
          if (vIn && oIn) return 55;
                }
                return 0;
              }
              let bestOpt = null, bestScore = 0;
              for (const o of opts) {
                const score = _matchScore(o.textContent.trim());
                if (score > bestScore) { bestScore = score; bestOpt = o; }
              }
              const opt = bestScore >= 50 ? bestOpt : null;
              if (opt) {
                clearInterval(session.pollTimer);
                if (session.cancelled || session.resolved) return;
                _trace.matchedOption = opt.textContent.trim();
                _trace.clicked = true;
                ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
          opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
                );
                const verifyStart = Date.now();
                const triggerInitialText = trigger.textContent.trim();
                const verifyPoll = setInterval(() => {
          if (session.cancelled || session.resolved) { clearInterval(verifyPoll); return; }
          const verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
          const displayed = verifyEl ? verifyEl.textContent.trim() : '';
          const overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
          const triggerChanged = trigger.textContent.trim() !== triggerInitialText;
          const ariaSelected = opt.getAttribute('aria-selected') === 'true';
          const ok = (displayed && !/^(select|choose|--)$/i.test(displayed)) || overlayGone || triggerChanged || ariaSelected;
          if (ok || Date.now() - verifyStart >= 3000) {
            clearInterval(verifyPoll);
            if (session.resolved) return;
            _trace.verifyStatus = ok ? 'ok' : 'verify-fail';
            _trace.durationMs = Date.now() - session.startedAt;
            cleanupSession(_trace.verifyStatus);
          }
                }, 200);
                session.timeoutIds.push(setInterval(() => {}, 0)); // placeholder — verifyPoll managed separately
              } else if (attempts >= 10) {
                clearInterval(session.pollTimer);
                if (session.resolved) return;
                document.body.click();
                _trace.durationMs = Date.now() - session.startedAt;
                cleanupSession('no-option');
              }
            }, 300);
          });
          return 1;
        }
        const _noAdapterLabel = filledBySource[selector]?.label || selector;
        _replayResults[_noAdapterLabel] = 'no-adapter';
        sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
        return 0;
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-mat.js ==== */
/**
 * mat-select/checkbox/radio
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneMat = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'mat',
      try(el, selector, value, type, elType) {
        if (elType !== 'mat-select' && elType !== 'mat-checkbox' && elType !== 'mat-radio') return null;
        if (elType === 'mat-select') {
                const trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
                trigger.click();
                setTimeout(() => {
                  const v = value.toLowerCase().trim();
                  const opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
                  const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                              opts.find(o => o.textContent.trim().toLowerCase().startsWith(v)) ||
                              opts.find(o => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) ||
                              opts.find(o => o.textContent.trim().toLowerCase().includes(v));
                  if (opt) opt.click(); else document.body.click();
                }, 400);
                return 1; // fire-and-forget, count as filled
              }
        if (elType === 'mat-checkbox') {
                const shouldCheck = /yes|true|1|on|checked/i.test(value);
                const input = el.querySelector('input[type="checkbox"]');
                const isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
                if (shouldCheck !== isChecked) { (input || el).click(); }
                return 1;
              }
        if (elType === 'mat-radio') {
                const v = value.toLowerCase().trim();
                const label = el.textContent.trim().toLowerCase();
                if (label === v || label.includes(v) || v.includes(label)) {
                  const input = el.querySelector('input[type="radio"]') || el;
                  input.click();
                  return 1;
                }
                return 0;
              }
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-radio-planned.js ==== */
/**
 * radio-click / radio-group
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneRadioPlanned = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'radio-planned',
      try(el, selector, value, type, elType) {
        if (type === 'radio-click') {
                const target = (el.type === 'radio') ? el : (el.querySelector && el.querySelector('input[type="radio"]')) || el;
                target.focus();
                target.checked = true;
                ['click', 'change'].forEach((ev) => target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
                return 1;
              }
        if (type === 'radio-group' && elType === 'radio' && el.name) {
                const normR0 = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                const vR0 = normR0(value);
                const radios0 = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
                const match0 = Array.from(radios0).find((r) => {
                  if (normR0(r.value) === vR0) return true;
                  const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
                  const lblText = lbl ? normR0(lbl.textContent) : '';
                  if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
                  // Gender synonyms
                  const wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
                  const wantMale = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
                  if (wantFemale && /female|महिला|स्त्री/.test((lbl && lbl.textContent) || r.value)) return true;
                  if (wantMale && /male|पुरुष/.test((lbl && lbl.textContent) || r.value) && !/female/.test((lbl && lbl.textContent) || '')) return true;
                  return false;
                });
                if (match0) {
                  match0.focus();
                  match0.checked = true;
                  ['click', 'change'].forEach((ev) => match0.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
                  return 1;
                }
                console.debug('[CC] radio-group no option match:', selector, value);
                return 0;
              }
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-select.js ==== */
/**
 * native select
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneSelect = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'select',
      try(el, selector, value, type, elType) {
        if (elType !== 'select') return null;
        if (elType === 'select') {
                const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const v = norm(value);
                const vWords = v.split(' ').filter(w => w.length > 1);
                const extraValues = [];
                if (mapping[selector]?.monthNum) { extraValues.push(mapping[selector].monthNum.toString()); if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase()); }

                function findOpt(options) {
                  // shared/option-match.js is injected before executor.js runs
                  return window.ccMatchOption(value, options, { extraValues: extraValues });
                }

                function applySelect(el, opt) {
                  el.focus();
                  el.dispatchEvent(new Event('focus', { bubbles: true }));

                  // Step 1: Mark the option directly (most reliable for ASP.NET/NIC)
                  Array.from(el.options).forEach(o => { o.selected = false; });
                  opt.selected = true;
                  el.selectedIndex = opt.index;

                  // Step 2: Sync el.value via native setter
                  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
                  if (nativeSetter) nativeSetter.set.call(el, opt.value);
                  else el.value = opt.value;

                  // Step 3: Fire full event sequence
                  ['mousedown','mouseup','click','input','change'].forEach(ev =>
                    el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
                  );
                  // Trigger ASP.NET onchange handler directly if present
                  if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch(e) { console.debug('[CC] onchange handler error:', e.message); } }
                  // jQuery change trigger — needed for ServicePlus/DWR cascading selects
                  if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch(e) {} }
                  // propertychange for old ASP.NET/IE compat (optional)
                  try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch {}
                  el.dispatchEvent(new Event('blur', { bubbles: true }));

                  // Step 4: Verify persistence after events (framework may reset)
                  setTimeout(() => {
                    if (el.value !== opt.value || el.selectedIndex !== opt.index) {
                      console.debug('[CC] select reset by framework, re-applying:', selector, opt.value);
                      opt.selected = true;
                      el.selectedIndex = opt.index;
                      if (nativeSetter) nativeSetter.set.call(el, opt.value);
                      else el.value = opt.value;
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    console.debug('[CC] select verify:', selector, 'value:', el.value, 'selectedIndex:', el.selectedIndex, 'expected:', opt.value, opt.index);
                  }, 300);

                  // Step 5: One more delayed change (no duplicate guard needed — only fires once)
                  setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 700);

                  // Step 6: Re-apply after DWR cascade may reset the value (ServicePlus pattern)
                  const _reapplyVal = opt.value; const _reapplyIdx = opt.index;
                  setTimeout(() => {
                    if (el.value !== _reapplyVal) {
                      el.selectedIndex = _reapplyIdx; el.value = _reapplyVal;
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      console.debug('[CC] re-applied after DWR reset:', selector, _reapplyVal);
                    }
                  }, 3500);

                  console.debug('[CC] select applied:', selector, '->', opt.text.trim(), '(value:', opt.value, 'index:', opt.index, ')');
                  return 1;
                }

                const allOptions = Array.from(el.options);
                const opt = findOpt(allOptions);
                console.debug('[CC] select attempt:', selector, 'value:', value, 'total opts:', allOptions.length, 'matched:', opt ? opt.text.trim() : 'NONE', 'sample:', allOptions.slice(0,3).map(o=>o.value+'='+o.text.trim()));
                if (opt) return applySelect(el, opt);

                // Options not ready yet (dependent dropdown) — schedule retry
                // The sequential loop already handles cascade timing via waitForNetworkIdle + waitForOptions.
                // This retry is a fallback for when fillOne is called directly (not through the cascade path).
                let attempts = 0;
                const interval = setInterval(() => {
                  const allOpts = Array.from(el.options);
                  const realOpts = allOpts.filter(o => {
                    if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
                    const txt = o.text.toLowerCase();
                    return !txt.includes('select') && !txt.includes('choose') && !txt.includes('loading') && txt !== '--';
                  });
                  if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
                  const opt2 = findOpt(allOpts);
                  if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
                  if (++attempts >= 15) {
                    clearInterval(interval);
                    // AI fallback — ask LLM to pick the best option
                    const groqKey = window._cc_groq_key || (document.body.getAttribute('data-cc-llm-key') || '');
                    if (groqKey && realOpts.length > 0) {
                      const optTexts = realOpts.map(o => o.text.trim()).join('\n');
                      window.ccLLM.call({
                        apiKey: groqKey,
                        baseUrl: document.body.getAttribute('data-cc-llm-url') || undefined,
                        model: document.body.getAttribute('data-cc-llm-model') || undefined,
                        userPrompt: 'From these dropdown options, which best matches "' + value + '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
                        maxTokens: 50,
                      }).then(result => {
                        const aiText = (result.text || '').trim();
                        if (aiText) {
                          const aiOpt = realOpts.find(o => o.text.trim() === aiText) || realOpts.find(o => o.text.trim().toLowerCase().includes(aiText.toLowerCase()));
                          if (aiOpt) { console.debug('[CC] AI matched:', aiText, '->', aiOpt.text); applySelect(el, aiOpt); }
                        }
                      }).catch(() => {});
                    }
                    console.debug('[CC] select no match after wait:', selector, 'value:', value, 'opts:', realOpts.slice(0,5).map(o=>o.text.trim()));
                  }
                }, 200);
                return 1; // counted as filled; actual value applied async

              }
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-choice-dom.js ==== */
/**
 * DOM radio / checkbox / file
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneChoiceDom = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'choice-dom',
      try(el, selector, value, type, elType) {
        if (elType === 'radio') {
                const normR = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                const vR = normR(value);
                const radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
                const match = Array.from(radios).find(r => {
                  if (normR(r.value) === vR) return true;
                  const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
                  const lblText = lbl ? normR(lbl.textContent) : '';
                  return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
                });
                if (match) {
                  match.focus();
                  match.checked = true;
                  ['click','change'].forEach(ev => match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
                  match.dispatchEvent(new Event('blur', { bubbles: true }));
                  return 1;
                }
              } else if (elType === 'checkbox') {
                // Only fill checkboxes with boolean-like values — never with names/numbers/IDs
                const booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
                if (!booleanLike.includes(value.toLowerCase())) { console.debug('[CC] skipped checkbox with non-boolean value:', value); return 0; }
                const truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
                if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; }
              } else if (el.type === 'file') {
                // ── File input (sync path) ───────────────────────────────────────────
                // Chrome: "File chooser dialog can only be shown with a user activation."
                // Never el.click() a file input during autofill — it throws and aborts fill.
                // URL fetch is handled in the async sequential loop. Here: base64 only,
                // otherwise return 0 so sequential marks waiting_human without dialog.
                if (!value) {
                  console.debug('[CC] file: no value — waiting_human (no dialog):', selector);
                  return 0;
                }
                if (value.startsWith('data:')) {
                  try {
                    const [meta, b64] = value.split(',');
                    const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
                    const ext = mime.split('/')[1] || 'bin';
                    const fileName = (filledBySource[selector]?.label || 'file').replace(/[^a-z0-9]/gi, '_') + '.' + ext;
                    const binary = atob(b64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    const file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    el.files = dt.files;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    console.debug('[CC] file assigned (base64):', selector, fileName, file.size, 'bytes');
                    return 1;
                  } catch (e) {
                    console.debug('[CC] file base64 error:', e.message, '— waiting_human (no dialog)');
                    return 0;
                  }
                }
                if (value.startsWith('http://') || value.startsWith('https://')) {
                  // URL fetch handled in sequential loop
                  console.debug('[CC] file URL deferred to sequential loop:', selector);
                  return 0;
                }
                // Filename hint only — cannot open OS dialog from automation
                console.debug('[CC] file: filename hint only — waiting_human (no dialog):', selector, value);
                return 0;
              } 
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-date.js ==== */
/**
 * date pickers
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneDate = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'date',
      try(el, selector, value, type, elType) {
        if (el._flatpickr || el.classList.contains('flatpickr-input')) {
                // ── flatpickr datepicker ─────────────────────────────────────────────
                // flatpickr attaches _flatpickr instance to the input. Use its API.
                const fp = el._flatpickr;
                // Parse the date value: convert DD/MM/YYYY or DD-MM-YYYY to Date object
                let dateObj = null;
                const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
                if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
                const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
                if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
                if (!dateObj) dateObj = new Date(value);

                if (fp && !isNaN(dateObj)) {
                  fp.setDate(dateObj, true); // true = trigger onChange
                } else {
                  // Fallback: set value directly + dispatch
                  const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                  el.focus();
                  if (niv) niv.set.call(el, value); else el.value = value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  el.blur();
                }
                console.debug('[CC] flatpickr fill:', selector, 'value:', value, 'result:', el.value);
                return el.value ? 1 : 0;
              } else if (el.classList.contains('hasDatepicker') || (typeof $ !== 'undefined' && typeof $.fn !== 'undefined' && typeof $.fn.datepicker !== 'undefined' && $(el).data('datepicker'))) {
                // ── jQuery UI Datepicker ─────────────────────────────────────────────
                let dateObj = null;
                const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
                if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
                const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
                if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
                if (!dateObj) dateObj = new Date(value);

                if (!isNaN(dateObj)) {
                  $(el).datepicker('setDate', dateObj);
                } else {
                  // Fallback: set value + trigger
                  const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                  el.focus();
                  if (niv) niv.set.call(el, value); else el.value = value;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                console.debug('[CC] jQuery datepicker fill:', selector, 'value:', value, 'result:', el.value);
                return el.value ? 1 : 0;
              } else if (el.getAttribute('matdatepicker') !== null || el.getAttribute('matInput') !== null && el.closest('mat-datepicker-toggle,mat-form-field') && (el.type === 'text' || el.type === 'date')) {
                // ── Angular Material mat-datepicker ──────────────────────────────────
                // mat-datepicker binds to a plain <input matInput [matDatepicker]="...">
                // Setting .value alone doesn't update the Angular FormControl.
                // We must: 1) set via native setter, 2) fire input+change, 3) fire a
                // synthetic MatDatepickerInputEvent so Angular's ControlValueAccessor picks it up.
                const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                el.focus();
                if (niv) niv.set.call(el, value); else el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                // Angular Material listens for 'dateChange' and 'dateInput' on the host element
                el.dispatchEvent(new CustomEvent('dateChange', { bubbles: true, detail: { value } }));
                el.dispatchEvent(new CustomEvent('dateInput', { bubbles: true, detail: { value } }));
                // Also try keyboard simulation — some Angular versions only update on keyup
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'Enter' }));
                el.blur();
                return 1;
              } else if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'month' || el.type === 'week') {
                // ── Native date/time inputs ──────────────────────────────────────────
                // These require ISO format: YYYY-MM-DD for date, YYYY-MM-DDTHH:MM for
                // datetime-local, YYYY-MM for month. Profile data is usually in Indian
                // format (DD/MM/YYYY or DD-MM-YYYY). Convert before setting.
                let isoValue = value;
                // Detect DD/MM/YYYY or DD-MM-YYYY and convert to YYYY-MM-DD
                const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
                if (ddmmyyyy) {
                  const [, day, month, year] = ddmmyyyy;
                  if (el.type === 'month') {
                    isoValue = `${year}-${month.padStart(2, '0')}`;
                  } else {
                    isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                  }
                }
                // Detect YYYY/MM/DD or YYYY-MM-DD (already ISO-ish)
                const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
                if (yyyymmdd && !ddmmyyyy) {
                  const [, year, month, day] = yyyymmdd;
                  isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }
                // For datetime-local: if only date provided, append T00:00
                if (el.type === 'datetime-local' && !isoValue.includes('T')) {
                  isoValue += 'T00:00';
                }
                // Set via native setter (keystroke doesn't work on date inputs)
                const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                el.focus();
                if (niv) niv.set.call(el, isoValue); else el.value = isoValue;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.blur();
                console.debug('[CC] date fill:', selector, 'original:', value, 'iso:', isoValue, 'result:', el.value);
                return el.value ? 1 : 0;
              } 
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one-text.js ==== */
/**
 * text / keystroke fill
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneText = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'text',
      try(el, selector, value, type, elType) {

                // Angular/React compatible input filling
                const isTextarea = el.tagName === 'TEXTAREA';
                const niv = isTextarea
                  ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
                  : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

                // PRIMARY PATH: keystroke-style fill — mimics real typing with full
                // keydown/beforeinput/input(insertText)/keypress/keyup event sequence.
                // Works on every site we've tested + is required by aadhaar/OTP/captcha
                // fields that reject value+dispatch. v5.67 made this the default.
                if (typeof window.keystrokeFillSync === 'function') {
                  const ok = window.keystrokeFillSync(el, value);
                  // ServicePlus / RTPS Bihar pattern: typing English into a name field
                  // and pressing Tab should auto-fill the paired Hindi field via the
                  // site's own transliteration. keystrokeFillSync now dispatches Tab
                  // keydown after typing, which triggers RTPS's handler.
                  // We add a safety net: 500ms later, check if Hindi sibling is still
                  // empty, and if so call Google's transliteration API ourselves.
                  if (el.getAttribute && el.getAttribute('data-type') === 'fullName') {
                    const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
                    const idx = allInputs.indexOf(el);
                    const next = allInputs[idx + 1];
                    if (next && next.getAttribute('data-type') === 'text') {
                      setTimeout(() => {
                        if (next.value && next.value.length > 0) return; // site filled it
                        const fillHindi = (hindiVal) => {
                          if (typeof window.keystrokeFillSync === 'function') window.keystrokeFillSync(next, hindiVal);
                        };
                        fetch('https://inputtools.google.com/request?text='+encodeURIComponent(value)+'&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
                          .then(r=>r.json())
                          .then(d=>{ const hindi = d?.[1]?.[0]?.[1]?.[0]; fillHindi(hindi || value); })
                          .catch(()=>fillHindi(value));
                      }, 500);
                    }
                  }
                  return ok ? 1 : 0;
                }

                // Legacy fallback (only if keystroke plugin failed to load):
                // value-set + dispatch.
                el.focus();
                if (niv) niv.set.call(el, value);
                else el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
                return 1;
        return 0;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== fill-one.js ==== */
/**
 * fillOne dispatcher — resolve el/elType, run handlers in order.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOne = function (k) {
    k.fillOneHandlers = k.fillOneHandlers || [];

    // resolve-cc-selector.js is the single owner of cc-style selector resolution.
    var _resolve = root.CcResolveCcSelector
      ? root.CcResolveCcSelector.resolveCcSelector
      : function (sel) { return document.querySelector(sel); }; // safe fallback

    function resolveEl(selector) {
      return _resolve(selector);
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

/* ==== sequential.js ==== */
﻿/**
 * sequential fill â€” solid closure (no AsyncFunction).
 * AUTO-generated by _rebuild-sequential-solid.mjs from _source_snapshot.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters;
    const filledBySource = b.filledBySource;
    const mapping = b.mapping;
    const _replayResults = b._replayResults;
    const _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION;
    const _CC_USE_PLUGINS = b._CC_USE_PLUGINS;
    const PRIORITY_KEYS = b.PRIORITY_KEYS;
    const entries = b.entries;
    const getEl = b.getEl;
    const _emitFillDebug = b._emitFillDebug;
    const _flushRecords = b._flushRecords;
    const _pushSelectRecord = b._pushSelectRecord;
    const settleAfterAct = b.settleAfterAct;
    const waitForSelectOptionsSequential = b.waitForSelectOptionsSequential;
    const waitForOptions = b.waitForOptions;
    const waitForDOMQuiet = b.waitForDOMQuiet || function (ms) {
      return new Promise(function (r) { setTimeout(r, ms || 300); });
    };
    const waitForNetworkIdle = b.waitForNetworkIdle || function (q, m) {
      return (window.ccWaitForNetworkIdle
        ? window.ccWaitForNetworkIdle(q || 200, m || 8000)
        : Promise.resolve({ idle: true, waitedMs: 0 }));
    };
    const detectStrategy = b.detectStrategy;
    const verifyValue = b.verifyValue;
    const _isPlaceholderOption = b._isPlaceholderOption;
    const _realOptions = b._realOptions;
    const _sampleOptions = b._sampleOptions;
    const _readSelectActual = b._readSelectActual;
    const _selectLoadMode = b._selectLoadMode;
    const _cascadeSemanticKey = b._cascadeSemanticKey;
    const _CASCADE_PARENTS = b._CASCADE_PARENTS;
    const _cascadeSettled = b._cascadeSettled;
    const _isPlaceholderPlanned = b._isPlaceholderPlanned;
    const _selectIsActive = b._selectIsActive;
    const fillOne = b.fillOne;

    // Mark kernel ready (compat with older facade checks)
    k._seqChunks = k._seqChunks || ['baked-solid'];

    k.fillSequential = async function fillSequential() {
          for (const [selector, fieldData] of entries) {
            const { value, type } = fieldData;
            let isNgDropdown = type === 'ng-dropdown' || selector.startsWith('ng-dropdown-');
            const fieldLabel = (filledBySource[selector]?.label || selector).toLowerCase();
            const _fieldCtxEarly = filledBySource[selector] || {};
            _emitFillDebug('field.start', {
              selector,
              label: _fieldCtxEarly.label || fieldLabel,
              type,
              planned: value,
              profileKey: _fieldCtxEarly.profileKey || fieldData.profileKey || null,
            });
            const _selectLike = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || '');
            const isDependent = _selectLike && PRIORITY_KEYS.some((pk) => fieldLabel.includes(pk) || selector.toLowerCase().includes(pk));
            // resolve-cc-selector.js is the single owner of selector resolution.
            let el = (typeof root !== 'undefined' && root.CcResolveCcSelector)
              ? root.CcResolveCcSelector.resolveCcSelector(selector)
              : document.querySelector(selector); // safe fallback
            if (!isNgDropdown && el) {
              const _tag = el.tagName.toLowerCase();
              if (_tag === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')))) {
                isNgDropdown = true;
              }
              if (!isNgDropdown && _tag !== 'select' && _tag !== 'input' && _tag !== 'mat-select') {
                const _role = el.getAttribute('role');
                if (_role === 'combobox' || _role === 'listbox') isNgDropdown = true;
              }
            }
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              await new Promise(r => setTimeout(r, 300));
            }
            const _t0 = Date.now();
            const _fieldCtx = {
              type,
              label: fieldData.label || filledBySource[selector]?.label || selector,
              profileKey: fieldData.profileKey || filledBySource[selector]?.profileKey || '',
              selector,
              matchBy: fieldData.matchBy || filledBySource[selector]?.matchBy || 'label',
            };
            const _selectLike2 = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || '');
            if (_selectLike2) console.log('[CC] route:', selector, 'type:', type, 'isNgDropdown:', isNgDropdown, 'isDependent:', isDependent, 'filled:', k.filled, 'elTag:', el?.tagName, 'elType:', el?.type);
            if (fieldData.type === 'button') {
              const _btnPlugin = (_CC_USE_PLUGINS && typeof findPlugin === 'function') ? findPlugin(el, _fieldCtx) : null;
              if (_btnPlugin) {
                const _pResult = _btnPlugin.fill(el, value, { attempt: 1 });
                const _preCount = document.querySelectorAll("input,select,textarea,div.ng-dropdown").length;
                await waitForDOMQuiet(800);
                const newFields = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select,div.ng-dropdown');
                const newFieldCount = newFields.length;
                _ccRecords.push({ selector, value, type: 'button', result: 'filled', strategy: 'plugin:button-click', plugin: 'button-click', role: fieldData.role || 'navigation', newFieldCount, transitionOutcome: newFieldCount > _preCount ? "transition_success" : newFieldCount === _preCount ? "transition_no_change" : "transition_partial", durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' }); _flushRecords();
                console.debug('[CC][plugin] button-click', selector, 'newFields:', newFieldCount);
              } else {
                if (el) el.click();
                await waitForDOMQuiet(800);
              }
              await settleAfterAct('button');
            } else if (isNgDropdown) {
              if (!el) { _ccRecords.push({ selector, value, type, result: 'skipped', failReason: 'no-element', strategy: 'ng-dropdown', ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords(); continue; }
              if (_realOptions(el).length === 0 && el.tagName === 'SELECT') {
                el = (await waitForSelectOptionsSequential(selector, 5000)) || el;
              }
              const _ngPlugin = (_CC_USE_PLUGINS && typeof findPlugin === 'function') ? findPlugin(el, _fieldCtx) : null;
              if (_ngPlugin) {
                try {
                  const _ctx = { profileKey: _fieldCtx.profileKey, portalAdapters: portalAdapters || {}, attempt: 1 };
                  const _pResult = await _ngPlugin.fill(el, value, _ctx);
                  const _r = _pResult.success ? 1 : 0;
                  k.filled += _r;
                  _ccRecords.push({ selector, value, type, result: _r ? 'filled' : 'skipped', failReason: _r ? null : _pResult.reason, strategy: 'plugin:' + _ngPlugin.id, plugin: _ngPlugin.id, durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' }); _flushRecords();
                } catch(e) {
                  fillOne(selector, value, type);
                }
              } else {
                fillOne(selector, value, type);
              }
              await settleAfterAct('select');
            } else if (_selectLike && el && el.tagName === 'SELECT') {
              const semKey = _cascadeSemanticKey(_fieldCtx.label, _fieldCtx.profileKey, selector);
              let liveEl = el;
              let loadMode = _selectLoadMode(liveEl);
              let optionCountBefore = _realOptions(liveEl).length;
              let sampleBefore = _sampleOptions(liveEl);
              let settleMeta = { idle: true, waitedMs: 0 };
              if (_isPlaceholderPlanned(value)) {
                _pushSelectRecord({
                  selector, value, type, label: _fieldCtx.label, profileKey: _fieldCtx.profileKey || null,
                  result: 'skipped', failReason: 'placeholder_planned_value', strategy: 'sequential',
                  loadMode, actualValue: _readSelectActual(el).actualValue, durationMs: Date.now() - _t0,
                });
                continue;
              }
              if (!_selectIsActive(el) && loadMode === 'ajax') {
                _pushSelectRecord({
                  selector, value, type, label: _fieldCtx.label, profileKey: _fieldCtx.profileKey || null,
                  result: 'skipped', failReason: 'ajax_control_inactive', strategy: 'sequential',
                  loadMode: 'ajax', actualValue: '', durationMs: Date.now() - _t0,
                });
                continue;
              }
              if (_realOptions(liveEl).length === 0) {
                const exhausted = k.ajaxWaitBudgetMs <= 0 || k.ajaxNotLoadedCount >= 5;
                const cap = exhausted ? 500 : Math.min(6000, Math.max(500, k.ajaxWaitBudgetMs));
                console.log('[CC] sequential-wait-options:', selector, 'budget=', k.ajaxWaitBudgetMs, 'cap=', cap);
                const waitedEl = await waitForSelectOptionsSequential(selector, cap);
                liveEl = waitedEl || document.querySelector(selector) || el;
                loadMode = _selectLoadMode(liveEl);
                if (_realOptions(liveEl).length === 0) {
                  k.ajaxNotLoadedCount += 1;
                  _pushSelectRecord({
                    selector, value, type, label: _fieldCtx.label, profileKey: _fieldCtx.profileKey || null,
                    result: 'skipped',
                    failReason: exhausted ? 'ajax_wait_budget_exhausted' : 'strategy_options_not_ready',
                    strategy: 'sequential',
                    loadMode: 'ajax',
                    optionCount: 0,
                    optionSample: _sampleOptions(liveEl, 8),
                    actualValue: _readSelectActual(liveEl).actualValue,
                    durationMs: Date.now() - _t0,
                  });
                  continue;
                }
              }
              optionCountBefore = _realOptions(liveEl).length;
              sampleBefore = _sampleOptions(liveEl, 10);
              let strategy = 'native-select';
              let attempt = 1;
              async function tryApply(attemptNo) {
                const _plugin =
                  _CC_USE_PLUGINS && typeof findPlugin === 'function' ? findPlugin(liveEl, _fieldCtx) : null;
                if (_plugin) {
                  const _pResult = _plugin.fill(liveEl, value, {
                    profileKey: _fieldCtx.profileKey,
                    attempt: attemptNo,
                  });
                  strategy = 'plugin:' + _plugin.id;
                  if (_pResult && _pResult.success) return { ok: true, reason: null };
                  return {
                    ok: false,
                    reason: (_pResult && _pResult.reason) || 'strategy_option_mismatch',
                    optionCount: _pResult && _pResult.optionCount,
                  };
                }
                const _r = fillOne(selector, value, type) || 0;
                strategy = 'native-select';
                if (_r) return { ok: true, reason: null };
                const real = _realOptions(liveEl);
                if (!real.length) return { ok: false, reason: 'strategy_options_not_ready' };
                return { ok: false, reason: 'strategy_option_mismatch', optionCount: real.length };
              }
              let applyRes = await tryApply(1);
              if (!applyRes.ok && k.ajaxWaitBudgetMs > 2000 && k.ajaxNotLoadedCount < 3) {
                attempt = 2;
                await settleAfterAct('select', { budgetMs: 2500 });
                liveEl = document.querySelector(selector) || liveEl;
                if (_realOptions(liveEl).length > 0) applyRes = await tryApply(2);
              }
              settleMeta = await settleAfterAct('select');
              liveEl = document.querySelector(selector) || liveEl;
              const actual = _readSelectActual(liveEl);
              let matchOk = applyRes.ok;
              if (!matchOk && actual.actualValue && value) {
                const np = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
                const na = String(actual.actualValue).toLowerCase().replace(/[^a-z0-9]/g, '');
                if (np && na && (np === na || na.includes(np) || np.includes(na))) matchOk = true;
              }
              if (matchOk) {
                k.filled += 1;
                if (semKey) {
                  _cascadeSettled[semKey] = {
                    key: semKey,
                    selector,
                    value,
                    actualValue: actual.actualValue,
                  };
                }
              } else if (applyRes.reason === 'strategy_options_not_ready' || applyRes.reason === 'ajax_options_not_loaded') {
                k.ajaxNotLoadedCount += 1;
              }
              _pushSelectRecord({
                selector,
                value,
                type,
                label: _fieldCtx.label,
                profileKey: _fieldCtx.profileKey || null,
                result: matchOk ? 'filled' : 'skipped',
                failReason: matchOk ? null : (applyRes.reason || 'strategy_failed'),
                strategy,
                loadMode,
                optionCount: _realOptions(liveEl).length,
                optionSample: _sampleOptions(liveEl, 10),
                optionSampleBefore: sampleBefore,
                optionCountBefore,
                actualValue: actual.actualValue,
                actualOptionValue: actual.actualOptionValue,
                verified: matchOk,
                attempt,
                waitedMs: settleMeta.waitedMs,
                networkIdle: settleMeta.idle,
                durationMs: Date.now() - _t0,
              });
            } else if (el && el.type === 'file') {
              if (value && (value.startsWith('http://') || value.startsWith('https://'))) {
                try {
                  const resp = await fetch(value);
                  if (resp.ok) {
                    const blob = await resp.blob();
                    const fileName = value.split('/').pop().split('?')[0] || 'document';
                    const file = new File([blob], fileName, {
                      type: blob.type || 'application/octet-stream',
                      lastModified: Date.now(),
                    });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    el.files = dt.files;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    k.filled += 1;
                    console.debug('[CC] file URL assigned:', selector, fileName, file.size, 'bytes');
                    _ccRecords.push({
                      selector,
                      value,
                      type: 'file',
                      label: _fieldCtx.label,
                      result: 'filled',
                      strategy: 'file-url-fetch',
                      fileName,
                      fileSize: file.size,
                      fillMode: 'sequential',
                      durationMs: Date.now() - _t0,
                      ts: Date.now(),
                      rv: RUNTIME_VERSION,
                    });
                    _flushRecords();
                  } else {
                    _ccRecords.push({
                      selector,
                      value,
                      type: 'file',
                      label: _fieldCtx.label,
                      result: 'waiting_human',
                      failReason: 'fetch-' + resp.status,
                      strategy: 'file-needs-human',
                      fillMode: 'sequential',
                      durationMs: Date.now() - _t0,
                      ts: Date.now(),
                      rv: RUNTIME_VERSION,
                    });
                    _flushRecords();
                  }
                } catch (e) {
                  _ccRecords.push({
                    selector,
                    value,
                    type: 'file',
                    label: _fieldCtx.label,
                    result: 'waiting_human',
                    failReason: e.message || 'fetch-error',
                    strategy: 'file-needs-human',
                    fillMode: 'sequential',
                    durationMs: Date.now() - _t0,
                    ts: Date.now(),
                    rv: RUNTIME_VERSION,
                  });
                  _flushRecords();
                }
              } else {
                _ccRecords.push({
                  selector,
                  value: value || null,
                  type: 'file',
                  label: _fieldCtx.label,
                  result: 'waiting_human',
                  failReason: value ? 'filename_only_no_url' : 'no_file_value',
                  strategy: 'file-needs-human',
                  fillMode: 'sequential',
                  durationMs: Date.now() - _t0,
                  ts: Date.now(),
                  rv: RUNTIME_VERSION,
                });
                _flushRecords();
              }
              await settleAfterAct('text');
            } else {
              const isChoice =
                type === 'radio-click' ||
                type === 'radio' ||
                type === 'radio-group' ||
                type === 'checkbox' ||
                type === 'mat-checkbox' ||
                type === 'mat-radio' ||
                (el && (el.type === 'radio' || el.type === 'checkbox'));
              try {
                const _r = fillOne(selector, value, type) || 0;
                if (isChoice) await settleAfterAct('choice');
                else await settleAfterAct('text');
                const _el2 = el || document.querySelector(selector);
                const _strategy = detectStrategy(_el2, type);
                const _ver = await verifyValue(selector, value, isChoice ? 80 : 100);
                let _trulyFilled = false;
                if (isChoice && _r === 1) {
                  if (_el2 && (_el2.type === 'radio' || _el2.type === 'checkbox')) {
                    _trulyFilled = !!_el2.checked;
                  } else {
                    _trulyFilled = _ver.ok || _r === 1;
                  }
                  if (!_trulyFilled && _ver.actualValue === 'true') _trulyFilled = true;
                } else {
                  _trulyFilled = _r === 1 && _ver.ok;
                }
                if (_trulyFilled) k.filled += 1;
                const _recChoice = {
                  selector,
                  value,
                  type,
                  label: _fieldCtx.label,
                  profileKey: _fieldCtx.profileKey || null,
                  result: _trulyFilled ? 'filled' : 'skipped',
                  failReason: _trulyFilled
                    ? null
                    : _r
                      ? _ver.reason || 'strategy_failed'
                      : _el2
                        ? 'strategy_failed'
                        : 'no-element',
                  actualValue: _ver.actualValue,
                  verified: _trulyFilled,
                  strategy: _strategy,
                  matchBy: _fieldCtx.matchBy,
                  fillMode: 'sequential',
                  durationMs: Date.now() - _t0,
                  ts: Date.now(),
                  rv: RUNTIME_VERSION,
                };
                _ccRecords.push(_recChoice);
                _flushRecords();
                _emitFillDebug(_trulyFilled ? 'field.done' : 'field.fail', {
                  selector,
                  label: _fieldCtx.label,
                  type,
                  planned: value,
                  actual: _ver.actualValue,
                  failReason: _recChoice.failReason,
                  strategy: _strategy,
                });
              } catch (e) {
                _ccRecords.push({
                  selector,
                  value,
                  type,
                  result: 'error',
                  error: e.message,
                  fillMode: 'sequential',
                  ts: Date.now(),
                  rv: RUNTIME_VERSION,
                });
                _flushRecords();
                _emitFillDebug('field.fail', {
                  selector,
                  type,
                  planned: value,
                  failReason: e.message || 'error',
                });
              }
            }
          }
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== post-fill-corrections.js ==== */
/**
 * correction observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillCorrections = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, allFields, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

// ── Operator Correction Observer ─────────────────────────────────────────
  // After runtime settles, snapshot filled values.
  // On form submit or page unload, capture final state and POST corrections.
  setTimeout(() => {
    const _ccBackendUrl = document.body.getAttribute('data-cc-backend') || '';
    const _ccFormKey = document.body.getAttribute('data-cc-formkey') || '';
    const snapshot = {};
    const fieldMeta = {};
    for (const [selector, fieldData] of entries) {
      let el = getEl(selector);
      if (!el) continue;
      const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
        : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
        : el.value || '';
      snapshot[selector] = val;
      const rec = _ccRecords.find(r => r.selector === selector);
      fieldMeta[selector] = {
        label: filledBySource[selector]?.label || selector,
        semanticKey: filledBySource[selector]?.semanticKey || '',
        profileKey: filledBySource[selector]?.profileKey || '',
        plugin: rec?.plugin || null,
        strategy: rec?.strategy || '',
        originalResult: rec?.result || 'unknown',
        autofilledValue: fieldData.value
      };
    }

    // Also snapshot UNMAPPED fields the popup detected — so when operator fills them
    // manually, we capture them as 'completion' corrections (= teaching signal that
    // populates the profile next time)
    if (Array.isArray(allFields)) {
      for (const f of allFields) {
        if (snapshot[f.selector] !== undefined) continue; // already tracked as mapped
        const el = getEl(f.selector);
        if (!el) continue;
        const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        snapshot[f.selector] = val;
        fieldMeta[f.selector] = {
          label: f.label || f.selector,
          semanticKey: '',
          profileKey: '',
          plugin: null,
          strategy: 'unmapped',
          originalResult: 'unmapped',
          autofilledValue: '',
        };
      }
    }

    function captureCorrections(trigger) {
      const corrections = [];
      for (const [selector, originalVal] of Object.entries(snapshot)) {
        let el = getEl(selector);
        if (!el) continue;
        const currentVal = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        if (currentVal !== originalVal && currentVal !== '') {
          const meta = fieldMeta[selector] || {};
          corrections.push({
            selector, field: meta.label, semanticKey: meta.semanticKey, profileKey: meta.profileKey,
            autofilledValue: meta.autofilledValue, snapshotValue: originalVal, finalOperatorValue: currentVal,
            correctionType: (!originalVal || originalVal === '') ? 'completion' : 'override',
            originalResult: meta.originalResult, plugin: meta.plugin, strategy: meta.strategy,
            trigger, ts: Date.now()
          });
        }
      }
      return corrections;
    }

    function postCorrections(trigger) {
      const corrections = captureCorrections(trigger);
      if (corrections.length === 0) return;
      document.body.setAttribute('data-cc-corrections', JSON.stringify(corrections));
      if (_ccBackendUrl) {
        const _ccToken = document.body.getAttribute('data-cc-token') || '';
        const _ccProfileId = document.body.getAttribute('data-cc-profile-id') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (_ccToken) headers['Authorization'] = 'Bearer ' + _ccToken;
        fetch(_ccBackendUrl + '/corrections', {
          method: 'POST',
          headers,
          body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey, profileId: _ccProfileId, trigger, corrections })
        }).catch(() => {});
      }
    }

    // Detect submit button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
      if (!btn) return;
      const txt = (btn.textContent || btn.value || '').toLowerCase();
      if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === 'submit') {
        postCorrections('submit');
      }
    }, true);

    // Fallback: beforeunload
    window.addEventListener('beforeunload', () => postCorrections('unload'));
  }, 10000);

  
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== post-fill-confirm.js ==== */
/**
 * confirm/retype pass
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillConfirm = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

// ── Confirm/Retype propagation pass ─────────────────────────────────────────
  // After primary fills settle, mirror DOM values into confirm/retype fields
  setTimeout(function() {
    var confirmPatterns = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number]'));
    allInputs.forEach(function(el) {
      if (!el.id && !el.name) return;
      var id = (el.id || el.name || '').toLowerCase();
      var label = (function() { if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)return l.textContent.toLowerCase();} return ''; })();
      var isConfirm = confirmPatterns.test(id) || /confirm|retype|re.type|re.enter|verify/i.test(label);
      if (!isConfirm) return;
      if (el.value) return; // already filled, skip
      // Find primary field by stripping confirm prefix from ID
      var baseId = id.replace(/^c(?=[a-z])/,'').replace(/^confirm_?/i,'').replace(/^retype_?/i,'').replace(/^re_?type_?/i,'').replace(/^re_?enter_?/i,'').replace(/^verify_?/i,'');
      var primary = document.getElementById(baseId) || document.querySelector('[id$="'+baseId+'"]') || document.querySelector('[name="'+baseId+'"]');
      // Also try matching by placeholder pattern (both DOB fields have DD/MM)
      if (!primary || !primary.value) {
        var ph = (el.placeholder || '').toLowerCase();
        if (ph.includes('dd/mm') || ph.includes('dd-mm')) {
          // Find any filled input with same placeholder pattern
          var allFilled = Array.from(document.querySelectorAll('input[type=text]')).filter(function(inp) {
            return inp !== el && inp.value && (inp.placeholder || '').toLowerCase().match(/dd.mm/);
          });
          if (allFilled.length > 0) primary = allFilled[0];
        }
      }
      if (!primary || !primary.value) return;
      // Propagate settled DOM value
      var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (niv) niv.set.call(el, primary.value); else el.value = primary.value;
      ['input','change','blur'].forEach(function(ev) { el.dispatchEvent(new Event(ev, {bubbles:true})); });
      _ccRecords.push({ selector: '#'+(el.id||el.name), value: primary.value, type: 'text', result: 'filled', strategy: 'confirm-mirror', durationMs: 0, ts: Date.now(), rv: RUNTIME_VERSION });
      _flushRecords();
    });
  }, 4000);

  
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== post-fill-mirror.js ==== */
/**
 * mirror observer
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillMirror = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

// ── Mirror Observer: sync derived fields when operator fills primary manually ──
  setTimeout(function() {
    var confirmPatterns = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel]'));
    allInputs.forEach(function(el) {
      if (!el.id) return;
      if (el.value) return; // already filled — no need to observe
      var id = el.id.toLowerCase();
      // Find if this is a primary field with a derived confirm field
      var confirmId = null;
      allInputs.forEach(function(other) {
        if (!other.id || other === el) return;
        var oid = other.id.toLowerCase();
        if (confirmPatterns.test(oid)) {
          var baseId = oid.replace(/^c(?=[a-z])/,'').replace(/^confirm_?/i,'').replace(/^retype_?/i,'').replace(/^re_?type_?/i,'').replace(/^re_?enter_?/i,'').replace(/^verify_?/i,'');
          if (baseId === id || id.includes(baseId) || baseId.includes(id)) confirmId = other.id;
        }
      });
      if (!confirmId) return;
      // Attach listener: when primary changes, mirror to confirm
      var _mirrorTarget = document.getElementById(confirmId);
      var _mirroring = false;
      el.addEventListener('input', function() {
        if (_mirroring) return;
        _mirroring = true;
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (niv) niv.set.call(_mirrorTarget, el.value); else _mirrorTarget.value = el.value;
        ['input','change'].forEach(function(ev) { _mirrorTarget.dispatchEvent(new Event(ev, {bubbles:true})); });
        _mirroring = false;
      });
    });
  }, 3000);

  // Final flush via DOM attribute (shared between all worlds and executeScript calls)
  try { document.body.setAttribute('data-cc-records', JSON.stringify(_ccRecords)); } catch {}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== post-fill.js ==== */
/**
 * Post-fill — compose corrections / confirm / mirror.
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFill = function (k) {
    root.CcExecParts.installPostFillCorrections(k);
    root.CcExecParts.installPostFillConfirm(k);
    root.CcExecParts.installPostFillMirror(k);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== executor.js (facade) ==== */
/**
 * Sequential fill kernel — thin facade.
 *
 * Parts under autofill/executor/ (injected before this file). Public API unchanged:
 *   fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields)
 */
globalThis.fillFormFieldsSequential = async function fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields) {
  portalAdapters = portalAdapters || {};
  const parts = (typeof globalThis !== 'undefined' && globalThis.CcExecParts) || {};

  // Hard requirements — without these fill cannot run
  const need = [
    'bindKernelLocals',
    'installDebug',
    'installSelectHelpers',
    'installSettle',
    'installDomOrder',
    'installStrategy',
    'installFillOne',
    'installSequential',
  ];
  // Soft requirements — missing = degraded path (log, don't hard-crash early)
  const soft = [
    'installFillOneNgHelpers',
    'installFillOneNg',
    'installFillOneMat',
    'installFillOneRadioPlanned',
    'installFillOneSelect',
    'installFillOneChoiceDom',
    'installFillOneDate',
    'installFillOneText',
    'installPostFill',
  ];
  const missingHard = need.filter((n) => typeof parts[n] !== 'function');
  if (missingHard.length) {
    const ver =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
        ? chrome.runtime.getManifest().version
        : '?';
    const present = Object.keys(parts)
      .filter((k) => k === 'bindKernelLocals' || k.indexOf('install') === 0)
      .sort()
      .join('|');
    console.error('[CC] executor hard parts missing:', missingHard.join(','), 'present=', present, 'ver=', ver);
    throw new Error('executor_parts_not_loaded:' + missingHard[0] + ' @' + ver);
  }
  const missingSoft = soft.filter((n) => typeof parts[n] !== 'function');
  if (missingSoft.length) {
    console.warn('[CC] executor soft parts missing (inject incomplete?):', missingSoft.join(','));
  }

  const RUNTIME_VERSION =
    typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : 'inj';

  console.log(
    '[CC] fillFormFieldsSequential started v' + RUNTIME_VERSION + ', fields:',
    Object.keys(mapping || {}).length
  );

  const k = {
    mapping: mapping || {},
    filledBySource: filledBySource || {},
    portalAdapters: portalAdapters,
    allFields: allFields || null,
    records: [],
    replayResults: {},
    RUNTIME_VERSION: RUNTIME_VERSION,
    STRATEGY_VERSION: '1.0',
    WAIT_ENGINE_VERSION: '1.2',
    CC_USE_PLUGINS: true,
    CC_LEGACY_COMPARE: true,
    fillRunId: 'fill:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ajaxWaitBudgetMs: 45000,
    ajaxNotLoadedCount: 0,
    cascadeSettled: Object.create(null),
    filled: 0,
    entries: [],
    PRIORITY_KEYS: null,
    CASCADE_PARENTS: null,
    fillOneHandlers: [],
    _seqChunks: [],
  };

  k.flushRecords = function flushRecords() {
    try {
      document.body.setAttribute('data-cc-records', JSON.stringify(k.records));
    } catch {
      /* ignore */
    }
  };

  function install(name) {
    if (typeof parts[name] === 'function') parts[name](k);
  }

  // Core helpers
  install('installDebug');
  install('installSelectHelpers');
  install('installSettle');
  install('installDomOrder');
  install('installStrategy');

  // fillOne handlers then dispatcher
  install('installFillOneNgHelpers');
  install('installFillOneNg');
  install('installFillOneMat');
  install('installFillOneRadioPlanned');
  install('installFillOneSelect');
  install('installFillOneChoiceDom');
  install('installFillOneDate');
  install('installFillOneText');
  install('installFillOne');

  // sequential — solid closure (no AsyncFunction)
  install('installSequential');
  if (typeof k.fillSequential !== 'function') {
    throw new Error(
      'executor_parts_not_loaded:fillSequential @' +
        ((typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
          ? chrome.runtime.getManifest().version
          : '?')
    );
  }

  k.emitFillDebug('fill.start', {
    fieldCount: Object.keys(k.mapping).length,
    waitEngine: k.WAIT_ENGINE_VERSION,
  });

  await k.fillSequential();

  k.emitFillDebug('fill.end', {
    filled: k.filled,
    records: k.records.length,
    ajaxBudgetLeftMs: k.ajaxWaitBudgetMs,
  });

  parts.installPostFill(k);

  try {
    document.body.setAttribute('data-cc-records', JSON.stringify(k.records));
  } catch {
    /* ignore */
  }

  return k.filled;
}
