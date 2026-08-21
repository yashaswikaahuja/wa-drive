/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/executor/*.js + executor.js
 * Rebuild: node extension/autofill/build-executor-bundle.mjs
 */

/* ==== capabilities/parse-date-value.js ==== */
/**
 * parse-date-value — Profile Date String Parser
 *
 * Parses a raw date string from a profile (which may be in DD/MM/YYYY,
 * DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, YYYY/MM/DD, or other formats) and
 * converts it to the format a specific date widget needs.
 *
 * Used by fill-one-date.js for flatpickr, jQuery UI datepicker, Angular
 * Material mat-datepicker, and native <input type="date"> handling.
 * Previously duplicated 3× inline in the same file.
 *
 * No DOM, no kernel, no Chrome APIs. Pure JS date parsing.
 *
 * Public API (on globalThis.CcParseDateValue):
 *   parseDateValue(value) => { dateObj, isoDate, isoMonth, isoDatetime }
 *
 * See parse-date-value.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Parse a raw date string from a profile into multiple output formats.
   *
   * Recognized input formats:
   *   DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY   (Indian/European day-first)
   *   YYYY/MM/DD  YYYY-MM-DD  YYYY.MM.DD   (ISO-ish year-first)
   *   Any string parseable by new Date(value) as fallback
   *
   * Returns an object with:
   *   dateObj   {Date|null}   — a JS Date (null if parsing failed)
   *   isoDate   {string}      — 'YYYY-MM-DD' or '' on failure
   *   isoMonth  {string}      — 'YYYY-MM' or '' on failure
   *   isoDatetime {string}    — 'YYYY-MM-DDTHH:MM' (appends T00:00) or ''
   *
   * Never throws. Returns all-empty result on null/invalid input.
   *
   * @param {string|null|undefined} value
   * @returns {{ dateObj: Date|null, isoDate: string, isoMonth: string, isoDatetime: string }}
   */
  function parseDateValue(value) {
    var empty = { dateObj: null, isoDate: '', isoMonth: '', isoDatetime: '' };
    if (value == null || value === '') return empty;

    var str = String(value).trim();
    if (!str) return empty;

    var dateObj = null;

    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (day-first, Indian/European format)
    var ddmmyyyy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (ddmmyyyy) {
      dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
    }

    // YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD (ISO-ish, year-first)
    var yyyymmdd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!dateObj && yyyymmdd) {
      dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2] - 1, +yyyymmdd[3]);
    }

    // Fallback: let JS Date constructor try
    if (!dateObj) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) dateObj = d;
    }

    if (!dateObj || isNaN(dateObj.getTime())) return empty;

    var year  = dateObj.getFullYear();
    var month = String(dateObj.getMonth() + 1).padStart(2, '0');
    var day   = String(dateObj.getDate()).padStart(2, '0');

    var isoDate     = year + '-' + month + '-' + day;
    var isoMonth    = year + '-' + month;
    var isoDatetime = isoDate + 'T00:00';

    return { dateObj: dateObj, isoDate: isoDate, isoMonth: isoMonth, isoDatetime: isoDatetime };
  }

  root.CcParseDateValue = {
    parseDateValue: parseDateValue,
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

/* ==== capabilities/confirm-field-pattern.js ==== */
/**
 * confirm-field-pattern — Confirm/Retype Field Identifier
 *
 * Identifies whether an input field is a confirm/retype field, and derives
 * the base field ID that it confirms.
 *
 * Used by post-fill-confirm.js (static propagation) and post-fill-mirror.js
 * (live mirror). Previously duplicated identically in both files.
 *
 * No DOM, no kernel, no Chrome APIs. Pure string/pattern matching.
 *
 * Public API (on globalThis.CcConfirmFieldPattern):
 *   isConfirmField(id, label?) => boolean
 *   getBaseId(id) => string
 *
 * See confirm-field-pattern.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Matches confirm/retype field ID prefixes (case-insensitive):
   *   c{letter}  — e.g. cPassword, cEmail
   *   confirm    — e.g. confirmPassword, confirm_email
   *   retype     — e.g. retypePassword
   *   re_type    — e.g. re_type_password
   *   re_enter   — e.g. re_enter_mobile
   *   verify     — e.g. verifyEmail
   */
  var CONFIRM_PREFIX_PATTERN = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;

  /**
   * Matches confirm/retype keywords in label text (case-insensitive).
   */
  var CONFIRM_LABEL_PATTERN = /confirm|retype|re.type|re.enter|verify/i;

  /**
   * Returns true if the field appears to be a confirm/retype field.
   *
   * @param {string} id     The element's id or name attribute
   * @param {string} [label]  Optional label text
   * @returns {boolean}
   */
  function isConfirmField(id, label) {
    var idStr = String(id || '').toLowerCase();
    if (!idStr) return false;
    if (CONFIRM_PREFIX_PATTERN.test(idStr)) return true;
    if (label && CONFIRM_LABEL_PATTERN.test(String(label))) return true;
    return false;
  }

  /**
   * Derives the base field ID by stripping the confirm prefix.
   * Returns the original string if no prefix matched.
   *
   * NOTE — legacy behavior: the ^c(?=[a-z]) rule fires first. This means
   * 'confirmPassword' → 'onfirmPassword' (the 'c' followed by lowercase 'o'
   * is stripped, not the full 'confirm'). This is the original behavior and
   * is preserved exactly. Use IDs like 'cPassword' (with uppercase base) if
   * you want the c-prefix stripping to work as intended.
   *
   * @param {string} id
   * @returns {string}
   */
  function getBaseId(id) {
    return String(id || '')
      .replace(/^c(?=[a-z])/, '')
      .replace(/^confirm_?/i, '')
      .replace(/^retype_?/i, '')
      .replace(/^re_?type_?/i, '')
      .replace(/^re_?enter_?/i, '')
      .replace(/^verify_?/i, '');
  }

  root.CcConfirmFieldPattern = {
    isConfirmField: isConfirmField,
    getBaseId: getBaseId,
    CONFIRM_PREFIX_PATTERN: CONFIRM_PREFIX_PATTERN,
    CONFIRM_LABEL_PATTERN: CONFIRM_LABEL_PATTERN,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/ng-option-scorer.js ==== */
/**
 * ng-option-scorer — Angular Dropdown Option Scorer
 *
 * Scores a dropdown option's text against a planned fill value to determine
 * how well they match. Returns a numeric score (0–100); higher is better.
 * Used when selecting the best option from an ng-dropdown / ng-select list.
 *
 * Also provides scoreAndPick(opts, planned) for picking the best option
 * from a list of {text, node} entries.
 *
 * Pure JS — no DOM, no Chrome, no kernel. Deterministic.
 *
 * Public API (on globalThis.CcNgOptionScorer):
 *   scoreOption(optText, planned) => number    (0–100)
 *   scoreAndPick(opts, planned, minScore?) => opt | null
 *
 * See ng-option-scorer.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Score how well `optText` matches `planned`.
   *
   * Scoring cascade (higher = better match):
   *   100 — exact match (case-insensitive)
   *    80 — one string contains the other
   *    70 — reverse-contains (optText in planned) with >3 chars
   *    60 — token overlap ≥2
   *    55 — education-level synonym match
   *    50 — single-token overlap when either string is short (≤2 tokens)
   *     0 — no match
   *
   * @param {string} optText  — option label text
   * @param {string} planned  — planned fill value
   * @returns {number} 0–100
   */
  function scoreOption(optText, planned) {
    var ot = String(optText || '').toLowerCase().trim();
    var v  = String(planned  || '').toLowerCase().trim();
    if (!ot || !v) return 0;
    if (ot === v) return 100;
    if (ot.includes(v)) return 80;
    if (v.includes(ot) && ot.length > 3) return 70;
    // Token overlap: split on common separators, require tokens > 2 chars
    var vToks = v.split(/[\s()+,/\-]+/).filter(function (t) { return t.length > 2; });
    var oToks = ot.split(/[\s()+,/\-]+/).filter(function (t) { return t.length > 2; });
    var overlap = vToks.filter(function (t) {
      return oToks.some(function (o) { return o.includes(t) || t.includes(o); });
    }).length;
    if (overlap >= 2) return 60;
    if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
    // Education-level synonyms (common Indian government form variants)
    var EDU_SYNONYMS = [
      ['intermediate', 'higher secondary', '10+2', '12th', 'hsc', 'senior secondary'],
      ['matriculation', '10th', 'sslc', 'secondary', 'high school', 'class 10', 'class x'],
      ['graduation', 'graduate', 'degree', 'bachelor', 'ug'],
      ['post graduation', 'post graduate', 'masters', 'master', 'pg', 'm.a', 'm.sc', 'm.com'],
    ];
    for (var i = 0; i < EDU_SYNONYMS.length; i++) {
      var group = EDU_SYNONYMS[i];
      var vIn = group.some(function (s) { return v.includes(s); });
      var oIn = group.some(function (s) { return ot.includes(s); });
      if (vIn && oIn) return 55;
    }
    return 0;
  }

  /**
   * Pick the best option from a list.
   *
   * @param {Array<{text: string, node: *}>} opts  — list of candidates
   * @param {string} planned                        — planned fill value
   * @param {number} [minScore=50]                  — minimum score to accept
   * @returns {{text, node, score} | null}
   */
  function scoreAndPick(opts, planned, minScore) {
    minScore = (typeof minScore === 'number') ? minScore : 50;
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < opts.length; i++) {
      var score = scoreOption(opts[i].text, planned);
      if (score > bestScore) {
        bestScore = score;
        best = opts[i];
      }
    }
    if (bestScore >= minScore) {
      return Object.assign({ score: bestScore }, best);
    }
    return null;
  }

  root.CcNgOptionScorer = {
    scoreOption: scoreOption,
    scoreAndPick: scoreAndPick,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/ng-session-manager.js ==== */
/**
 * ng-session-manager — ng-dropdown Replay Session Manager
 *
 * Manages the lifecycle of ng-dropdown fill sessions stored in a Map.
 * Each session tracks poll timers, timeout IDs, and a MutationObserver
 * that must all be cleaned up when a session is cancelled or superseded.
 *
 * The session store is injected so this capability is testable without
 * a real browser window.
 *
 * Public API (on globalThis.CcNgSessionManager):
 *   cancelSession(label, sessions)  — cancel + cleanup a named session
 *   createSession(label, sessions)  — register a new blank session
 *   cleanupSession(session, sessions, label)  — cleanup without deleting from store
 *
 * sessions: Map<string, NgSession>   — injected store (window._ccReplaySessions in production)
 *
 * NgSession shape:
 *   { id, fieldKey, resolved, cancelled, pollTimer, timeoutIds, observer, startedAt, _result? }
 *
 * See ng-session-manager.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Cancel an active session by label.
   * Clears poll timer, all timeout IDs, disconnects MutationObserver,
   * and removes the session from the store.
   *
   * No-op if sessions is null/undefined or label not present.
   *
   * @param {string} label       — field key / session label
   * @param {Map}    sessions    — session store (window._ccReplaySessions)
   */
  function cancelSession(label, sessions) {
    if (!sessions || !sessions.has(label)) return;
    var old = sessions.get(label);
    old.cancelled = true;
    try { clearInterval(old.pollTimer); } catch (e) {}
    (old.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
    if (old.observer) { try { old.observer.disconnect(); } catch (e) {} old.observer = null; }
    sessions.delete(label);
  }

  /**
   * Create and register a new blank session.
   *
   * @param {string} label    — field key / session label
   * @param {Map}    sessions — session store
   * @returns {NgSession}
   */
  function createSession(label, sessions) {
    var session = {
      id: Math.random().toString(36).slice(2, 8),
      fieldKey: label,
      resolved: false,
      cancelled: false,
      pollTimer: null,
      timeoutIds: [],
      observer: null,
      startedAt: Date.now(),
    };
    sessions.set(label, session);
    return session;
  }

  /**
   * Clean up a session's resources without deleting it from the store.
   * Used by the session itself when it resolves normally.
   *
   * @param {NgSession} session
   * @param {Map}       sessions
   * @param {string}    label
   */
  function cleanupSession(session, sessions, label) {
    try { clearInterval(session.pollTimer); } catch (e) {}
    (session.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
    if (session.observer) { try { session.observer.disconnect(); } catch (e) {} session.observer = null; }
    if (sessions && label !== undefined) sessions.delete(label);
  }

  root.CcNgSessionManager = {
    cancelSession: cancelSession,
    createSession: createSession,
    cleanupSession: cleanupSession,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/build-fill-record.js ==== */
/**
 * build-fill-record — Fill Record Assembler
 *
 * Pure function that stamps a base field-result object with the three
 * common envelope fields that every CcRecord must carry:
 *   ts        — Date.now() at record creation time
 *   rv        — RUNTIME_VERSION string
 *   fillMode  — always 'sequential' for the sequential fill loop
 *
 * This pattern was previously repeated inline at every _ccRecords.push(...)
 * call site. This is the single canonical implementation.
 *
 * Pure JS — no DOM, no Chrome, no kernel. Deterministic (ts injected via opts.now).
 *
 * Public API (on globalThis.CcBuildFillRecord):
 *   buildFillRecord(base, opts?) => CcRecord
 *
 * opts: { rv?, fillMode?, now? }  — all optional, primarily used for testing
 *
 * See build-fill-record.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Stamp a base object with envelope fields.
   *
   * @param {object} base     — caller-provided fields (selector, value, type, result, …)
   * @param {object} [opts]
   * @param {string} [opts.rv]       — RUNTIME_VERSION (default: '')
   * @param {string} [opts.fillMode] — fill mode label (default: 'sequential')
   * @param {function(): number} [opts.now] — timestamp fn (default: Date.now)
   * @returns {object} stamped record
   */
  function buildFillRecord(base, opts) {
    opts = opts || {};
    var rv       = (opts.rv !== undefined)       ? opts.rv       : '';
    var fillMode = (opts.fillMode !== undefined) ? opts.fillMode : 'sequential';
    var now      = (typeof opts.now === 'function') ? opts.now : Date.now;
    return Object.assign(
      { ts: now(), rv: rv, fillMode: fillMode },
      base
    );
  }

  root.CcBuildFillRecord = {
    buildFillRecord: buildFillRecord,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-debug-emitter.js ==== */
/**
 * fill-debug-emitter — Debug Event Queue + Emitter
 *
 * Assembles fill debug events, batches them in a queue, and flushes them
 * to an injected sender (Chrome port or sendMessage). The sender is injected
 * so this capability is fully testable without a browser.
 *
 * Events are coalesced with a 40ms timer. High-priority events
 * (fill.start, fill.end, queue >= 6) flush immediately.
 *
 * Public API (on globalThis.CcFillDebugEmitter):
 *   createEmitter(opts) => emitter
 *
 * emitter:
 *   emit(event, payload)   — enqueue and possibly flush
 *   flush()                — flush immediately
 *   queue                  — read-only access to pending queue (for tests)
 *
 * See fill-debug-emitter.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Create a fill debug emitter.
   *
   * @param {object} opts
   * @param {function(): string} opts.getRunId       — returns current fillRunId
   * @param {function(): string} opts.getRv           — returns RUNTIME_VERSION
   * @param {function(): string} [opts.getHostname]  — returns hostname (default: location.hostname)
   * @param {function(Array): void} opts.send         — batch sender (receives array of event objects)
   * @returns {{ emit, flush, queue }}
   */
  function createEmitter(opts) {
    opts = opts || {};
    var getRunId   = opts.getRunId   || function () { return ''; };
    var getRv      = opts.getRv      || function () { return ''; };
    var getHostname = opts.getHostname || function () {
      return (typeof location !== 'undefined') ? location.hostname : '';
    };
    var send = opts.send || function () {};

    var _queue = [];
    var _timer = null;

    function _flush() {
      if (!_queue.length) return;
      var batch = _queue.splice(0, 40);
      send(batch);
      if (_queue.length) _schedule();
    }

    function _schedule() {
      if (_timer) return;
      _timer = setTimeout(function () {
        _timer = null;
        _flush();
      }, 40);
    }

    function emit(event, payload) {
      var evt = Object.assign(
        {
          event: event,
          fillRunId: getRunId(),
          hostname: getHostname(),
          ts: Date.now(),
          rv: getRv(),
        },
        payload || {}
      );
      // Rename widget type so it doesn't clash with message envelope type
      if (evt.type && evt.type !== 'FILL_DEBUG') {
        evt.fieldType = evt.type;
        delete evt.type;
      }
      _queue.push(evt);
      // fill.start / fill.end + large batches flush immediately
      var immediate = event === 'fill.start' || event === 'fill.end' || _queue.length >= 6;
      if (immediate) {
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _flush();
      } else {
        _schedule();
      }
    }

    function flush() {
      if (_timer) { clearTimeout(_timer); _timer = null; }
      _flush();
    }

    return {
      emit: emit,
      flush: flush,
      get queue() { return _queue; },
    };
  }

  root.CcFillDebugEmitter = {
    createEmitter: createEmitter,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/wait-for-options.js ==== */
/**
 * wait-for-options — Select Options DOM Poller
 *
 * Waits for a <select> element to have at least minCount real (non-placeholder)
 * options by combining a MutationObserver on document.body with a 200ms poll
 * interval. Resolves with the element on success, null on timeout.
 *
 * "Real" options: value is non-empty, not '0', not '-1'.
 *
 * The querySelector function is injected so this capability is testable
 * without a real browser document.
 *
 * Public API (on globalThis.CcWaitForOptions):
 *   waitForOptions(selector, minCount, timeout, querySelector?, observeTarget?) => Promise<Element|null>
 *
 * querySelector  — defaults to document.querySelector
 * observeTarget  — defaults to document.body (the node to observe for mutations)
 *
 * See wait-for-options.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Wait for a <select> to have real options.
   *
   * @param {string}   selector       — CSS selector for the <select>
   * @param {number}   [minCount=1]   — minimum number of real options required
   * @param {number}   [timeout=8000] — max wait in ms
   * @param {function} [qs]           — querySelector function (injected for tests)
   * @param {Element}  [observeTarget] — MutationObserver target (injected for tests)
   * @returns {Promise<Element|null>}
   */
  function waitForOptions(selector, minCount, timeout, qs, observeTarget) {
    minCount = minCount || 1;
    timeout  = timeout  || 8000;
    qs = qs || (typeof document !== 'undefined' ? document.querySelector.bind(document) : function () { return null; });
    observeTarget = observeTarget || (typeof document !== 'undefined' ? document.body : null);

    return new Promise(function (resolve) {
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

      function isRealOption(o) {
        return o.value && o.value !== '0' && o.value !== '' && o.value !== '-1';
      }

      function check() {
        if (resolved) return;
        var el = qs(selector);
        var real = Array.from(el ? el.options || [] : []).filter(isRealOption);
        if (real.length >= minCount) { cleanup(el); return; }
        if (Date.now() > deadline) { cleanup(null); return; }
      }

      if (observeTarget) {
        mo = new MutationObserver(check);
        mo.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'class'],
        });
      }

      check();

      poll = setInterval(function () {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
  }

  root.CcWaitForOptions = {
    waitForOptions: waitForOptions,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/settle-after-act.js ==== */
/**
 * settle-after-act — Post-Action Settle Engine
 *
 * After a fill action (text input, select change, button click), waits for
 * the page to reach a quiet network state before proceeding. Manages an
 * ajax wait budget so long-running pages don't wait forever.
 *
 * Also provides waitForSelectOptionsSequential: waits for a dependent
 * cascade select to load options after a preceding field is filled.
 *
 * Both network-idle and option-polling are injected for testability.
 *
 * Public API (on globalThis.CcSettleAfterAct):
 *   createSettleEngine(opts) => { settleAfterAct, waitForSelectOptionsSequential }
 *
 * opts:
 *   waitForNetworkIdle(quietMs, maxMs) => Promise<{idle, waitedMs}>
 *   waitForOptions(selector, minCount, timeout) => Promise<Element|null>
 *   getBudget() => number        — read current ajaxWaitBudgetMs
 *   setBudget(n)                 — write current ajaxWaitBudgetMs
 *
 * See settle-after-act.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * @param {object} opts
   * @param {function} opts.waitForNetworkIdle
   * @param {function} opts.waitForOptions
   * @param {function} opts.getBudget
   * @param {function} opts.setBudget
   */
  function createSettleEngine(opts) {
    opts = opts || {};
    var waitForNetworkIdle = opts.waitForNetworkIdle || function (q, m) {
      return Promise.resolve({ idle: true, waitedMs: 0 });
    };
    var waitForOptions = opts.waitForOptions || function () {
      return Promise.resolve(null);
    };
    var getBudget = opts.getBudget || function () { return 0; };
    var setBudget = opts.setBudget || function () {};

    async function settleAfterAct(kind, actOpts) {
      actOpts = actOpts || {};
      var budget = typeof actOpts.budgetMs === 'number' ? actOpts.budgetMs : getBudget();

      // Text inputs: flat 100ms wait, no network polling needed
      if (kind === 'text') {
        await new Promise(function (r) { setTimeout(r, 100); });
        return { idle: true, waitedMs: 100, kind: 'text' };
      }

      // Let DWR/XHR kick off after change/click before network polling starts
      var kick = kind === 'button' ? 300 : 200;
      await new Promise(function (r) { setTimeout(r, kick); });

      var maxNet = kind === 'button' ? 5000 : kind === 'select' ? 4500 : 3500;
      maxNet = Math.min(maxNet, Math.max(300, budget > 0 ? budget : 400));

      var quiet = kind === 'select' ? 150 : 120;
      var t0 = Date.now();
      var net = await waitForNetworkIdle(quiet, maxNet);
      var used = Date.now() - t0;
      setBudget(Math.max(0, getBudget() - used));

      return Object.assign({ kind: kind }, net);
    }

    async function waitForSelectOptionsSequential(selector, maxMs) {
      maxMs = Math.min(maxMs || 6000, Math.max(400, getBudget() || 400));
      var t0 = Date.now();
      // First a general settle (covers radio→ajax-select pattern)
      await settleAfterAct('choice', { budgetMs: Math.min(2000, maxMs) });
      var left = Math.max(300, maxMs - (Date.now() - t0));
      var el = await waitForOptions(selector, 1, left);
      setBudget(Math.max(0, getBudget() - (Date.now() - t0)));
      return el;
    }

    return {
      settleAfterAct: settleAfterAct,
      waitForSelectOptionsSequential: waitForSelectOptionsSequential,
    };
  }

  root.CcSettleAfterAct = {
    createSettleEngine: createSettleEngine,
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

/* ==== capabilities/sort-fields-by-dom-order.js ==== */
/**
 * sort-fields-by-dom-order — Fill Entry DOM Order Sorter
 *
 * Sorts an array of [selector, fieldData] fill entries into the visual
 * top-to-bottom order they appear in the page.
 *
 * This ensures fields are filled in the order the form's own validation
 * expects — typically top to bottom as laid out in the DOM.
 *
 * No kernel, no CcExecParts, no Chrome APIs, no cascade knowledge.
 * The resolver function is injected so this capability is testable without a
 * real browser document.
 *
 * Public API (on globalThis.CcSortFieldsByDomOrder):
 *   sortFieldsByDomOrder(entries, resolveEl) => entries (sorted in place)
 *
 * See sort-fields-by-dom-order.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Sort fill entries in DOM top-to-bottom order.
   *
   * Uses compareDocumentPosition to determine which of two elements appears
   * earlier in the document. Entries whose selectors resolve to null (element
   * not present) are sorted to the end with their relative order preserved.
   *
   * Sorts the array in place and also returns it.
   *
   * @param {Array<[string, object]>} entries
   *   Array of [selector, fieldData] pairs from the fill mapping.
   *
   * @param {function(string): Element|null} resolveEl
   *   Function that turns a selector string into a DOM element.
   *   Should be CcResolveCcSelector.resolveCcSelector or equivalent.
   *
   * @returns {Array<[string, object]>} The same array, sorted in place.
   */
  function sortFieldsByDomOrder(entries, resolveEl) {
    if (!Array.isArray(entries) || entries.length < 2) return entries;
    var FOLLOWING = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) || 4;
    entries.sort(function (pairA, pairB) {
      var a = resolveEl(pairA[0]);
      var b = resolveEl(pairB[0]);
      if (!a || !b) return 0;        // one or both not in DOM — preserve order
      if (a === b) return 0;          // same element
      if (typeof a.compareDocumentPosition !== 'function') return 0;
      return a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1;
    });
    return entries;
  }

  root.CcSortFieldsByDomOrder = {
    sortFieldsByDomOrder: sortFieldsByDomOrder,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/verify-fill-value.js ==== */
/**
 * verify-fill-value — Fill Value Verifier
 *
 * After a fill attempt, reads the actual current DOM value and compares it
 * to the planned value to determine whether the fill succeeded.
 *
 * Handles: checkbox checked state, radio group selected label, <select>
 * option text, text input value, masked inputs (e.g. Aadhaar last-4),
 * and normalised alphanumeric comparison.
 *
 * The element resolver is injected so this capability is testable without
 * a real browser document.
 *
 * Public API (on globalThis.CcVerifyFillValue):
 *   verifyFillValue(selector, expected, resolveEl, settleMs?) => Promise<VerifyResult>
 *
 * VerifyResult: { ok, actualValue, normExpected, normActual, reason?, partial?, masked? }
 *
 * See verify-fill-value.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Verify that a fill attempt produced the expected value in the DOM.
   *
   * Waits `settleMs` milliseconds first (default 150ms) to allow framework
   * validators, formatters, and ControlValueAccessors to react.
   *
   * @param {string} selector       The cc-style selector for the field
   * @param {string|null} expected  The value that was planned/filled
   * @param {function(string): Element|null} resolveEl  Element resolver (injected)
   * @param {number} [settleMs=150]  How long to wait before reading DOM
   *
   * @returns {Promise<{ok, actualValue, normExpected, normActual, reason?, partial?, masked?}>}
   */
  async function verifyFillValue(selector, expected, resolveEl, settleMs) {
    settleMs = (typeof settleMs === 'number') ? settleMs : 150;

    // Wait for framework to react
    if (settleMs > 0) await new Promise(function (r) { setTimeout(r, settleMs); });

    // Resolve element
    var liveEl;
    if (selector && selector.startsWith && selector.startsWith('ng-dropdown-')) {
      liveEl = null; // ng-dropdown verify handled by the handler's own verify
    } else {
      liveEl = resolveEl(selector);
    }

    if (!liveEl) {
      return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'no-element-on-verify' };
    }

    var tag = (liveEl.tagName || '').toLowerCase();

    // ── Checkbox ──────────────────────────────────────────────────────────────
    if (liveEl.type === 'checkbox') {
      return {
        ok: !!liveEl.checked,
        actualValue: liveEl.checked ? 'true' : 'false',
        normExpected: String(expected || ''),
        normActual: liveEl.checked ? 'true' : 'false',
      };
    }

    // ── Radio ─────────────────────────────────────────────────────────────────
    if (liveEl.type === 'radio') {
      var groupName = liveEl.name;
      var selected = liveEl.checked ? liveEl : null;
      if (groupName) {
        var checked = document.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
        if (checked) selected = checked;
      }
      if (!selected) {
        return { ok: false, actualValue: '', normExpected: String(expected || ''), normActual: '', reason: 'radio-none-checked' };
      }
      var lbl = selected.id ? document.querySelector('label[for="' + selected.id + '"]') : null;
      var actualLabel = (lbl && lbl.textContent.trim()) || selected.value || 'true';
      var normFn = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var normExp0 = normFn(expected);
      var normAct0 = normFn(actualLabel);
      var ok0 = !expected ||
        normAct0.includes(normExp0.slice(0, 4)) ||
        normExp0.includes(normAct0.slice(0, 4)) ||
        selected.checked;
      return { ok: !!ok0, actualValue: actualLabel, normExpected: normExp0, normActual: normAct0 };
    }

    // ── Select ────────────────────────────────────────────────────────────────
    if (tag === 'select') {
      var opt = liveEl.options[liveEl.selectedIndex];
      var actualVal = (opt ? (opt.text || opt.value) : '') || '';
      var normExpS = String(expected || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var normActS = actualVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      var okS = normExpS.length > 0 && (normActS === normExpS || normActS.includes(normExpS) || normExpS.includes(normActS));
      return { ok: okS, actualValue: actualVal, normExpected: normExpS, normActual: normActS };
    }

    // ── Text input / textarea ─────────────────────────────────────────────────
    var actual = liveEl.value || '';
    var expStr = String(expected || '');

    if (!expStr) {
      return { ok: false, actualValue: actual, normExpected: '', normActual: actual, reason: 'empty-expected' };
    }

    var normExp = expStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    var normAct = actual.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match (after normalisation)
    if (normExp === normAct) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct };
    }

    // Partial match — framework may reformat (e.g. phone number groups)
    if (normAct.length > 0 &&
        (normAct.startsWith(normExp.slice(0, Math.max(8, normExp.length - 2))) ||
         normExp.startsWith(normAct.slice(0, 8)))) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, partial: true };
    }

    // Masked-input pattern (UIDAI Aadhaar: shows '****6597' but was filled with full number)
    // Same length + last 4 chars match → accept
    if (actual.length >= 8 && actual.length === expStr.length) {
      var tail = expStr.slice(-4).toLowerCase();
      if (actual.toLowerCase().endsWith(tail)) {
        return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, masked: true };
      }
    }

    return {
      ok: false,
      actualValue: actual,
      normExpected: normExp,
      normActual: normAct,
      reason: actual === '' ? 'value-rejected-empty' : 'value-mismatch',
    };
  }

  root.CcVerifyFillValue = {
    verifyFillValue: verifyFillValue,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/detect-fill-strategy.js ==== */
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

/* ==== capabilities/post-fill-corrections.js ==== */
/**
 * post-fill-corrections — Operator Correction Observer
 *
 * After fills settle, snapshots DOM values. On submit-button click or
 * beforeunload, captures operator-changed values and POSTs them as
 * correction signals to the backend (data-cc-backend attribute).
 * Also captures unmapped fields as 'completion' corrections.
 *
 * Public API (on globalThis.CcPostFillCorrections):
 *   installCorrectionsObserver(opts)
 *
 * opts: { entries, filledBySource, allFields, getEl, records,
 *         RUNTIME_VERSION, settleDelayMs? }
 */
(function (root) {
  'use strict';

  function readFieldValue(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      var opt = el.options && el.options[el.selectedIndex];
      return (opt ? (opt.text || opt.value) : '') || '';
    }
    if (el.classList && el.classList.contains('ng-dropdown')) {
      var vEl = el.querySelector('.value-area .value,.select-type,.ng-value-label');
      return (vEl && vEl.textContent.trim()) || '';
    }
    return el.value || '';
  }

  function installCorrectionsObserver(opts) {
    opts = opts || {};
    var entries         = opts.entries         || [];
    var filledBySource  = opts.filledBySource  || {};
    var allFields       = opts.allFields       || [];
    var getEl           = opts.getEl           || function (s) { return document.querySelector(s); };
    var records         = opts.records         || [];
    var settleDelayMs   = typeof opts.settleDelayMs === 'number' ? opts.settleDelayMs : 10000;

    setTimeout(function () {
      var _ccBackendUrl = document.body.getAttribute('data-cc-backend') || '';
      var _ccFormKey    = document.body.getAttribute('data-cc-formkey') || '';
      var snapshot = {}, fieldMeta = {};

      for (var i = 0; i < entries.length; i++) {
        var sel = entries[i][0], fd = entries[i][1];
        var el = getEl(sel);
        if (!el) continue;
        snapshot[sel] = readFieldValue(el);
        var rec = records.find(function (r) { return r.selector === sel; });
        fieldMeta[sel] = {
          label: (filledBySource[sel] && filledBySource[sel].label) || sel,
          semanticKey: (filledBySource[sel] && filledBySource[sel].semanticKey) || '',
          profileKey:  (filledBySource[sel] && filledBySource[sel].profileKey)  || '',
          plugin: rec && rec.plugin || null,
          strategy: rec && rec.strategy || '',
          originalResult: rec && rec.result || 'unknown',
          autofilledValue: fd.value,
        };
      }

      if (Array.isArray(allFields)) {
        for (var j = 0; j < allFields.length; j++) {
          var f = allFields[j];
          if (snapshot[f.selector] !== undefined) continue;
          var el2 = getEl(f.selector);
          if (!el2) continue;
          snapshot[f.selector] = readFieldValue(el2);
          fieldMeta[f.selector] = { label: f.label || f.selector, semanticKey: '', profileKey: '',
            plugin: null, strategy: 'unmapped', originalResult: 'unmapped', autofilledValue: '' };
        }
      }

      function captureCorrections(trigger) {
        var out = [];
        Object.keys(snapshot).forEach(function (s) {
          var el = getEl(s);
          if (!el) return;
          var cur = readFieldValue(el);
          if (cur !== snapshot[s] && cur !== '') {
            var m = fieldMeta[s] || {};
            out.push({ selector: s, field: m.label, semanticKey: m.semanticKey,
              profileKey: m.profileKey, autofilledValue: m.autofilledValue,
              snapshotValue: snapshot[s], finalOperatorValue: cur,
              correctionType: (!snapshot[s] || snapshot[s] === '') ? 'completion' : 'override',
              originalResult: m.originalResult, plugin: m.plugin, strategy: m.strategy,
              trigger: trigger, ts: Date.now() });
          }
        });
        return out;
      }

      function postCorrections(trigger) {
        var corrections = captureCorrections(trigger);
        if (!corrections.length) return;
        try { document.body.setAttribute('data-cc-corrections', JSON.stringify(corrections)); } catch (e) {}
        if (_ccBackendUrl) {
          var tok = document.body.getAttribute('data-cc-token') || '';
          var pid = document.body.getAttribute('data-cc-profile-id') || '';
          var hdrs = { 'Content-Type': 'application/json' };
          if (tok) hdrs['Authorization'] = 'Bearer ' + tok;
          fetch(_ccBackendUrl + '/corrections', {
            method: 'POST', headers: hdrs,
            body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey,
              profileId: pid, trigger: trigger, corrections: corrections }),
          }).catch(function () {});
        }
      }

      document.addEventListener('click', function (e) {
        var btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
        if (!btn) return;
        var txt = (btn.textContent || btn.value || '').toLowerCase();
        if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === 'submit') {
          postCorrections('submit');
        }
      }, true);

      window.addEventListener('beforeunload', function () { postCorrections('unload'); });
    }, settleDelayMs);
  }

  root.CcPostFillCorrections = { installCorrectionsObserver: installCorrectionsObserver };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-ng.js ==== */
/**
 * fill-one-ng — ng-dropdown Fill Handler
 *
 * Fills Angular ng-select / ng-dropdown elements via adapter-driven
 * overlay detection, MutationObserver session, option poll loop,
 * and click + verify pass.
 *
 * Depends on:
 *   CcNgOptionScorer   — option text scoring (CAP-11)
 *   CcNgSessionManager — session lifecycle (CAP-12)
 *   CcBuildFillRecord  — record stamping (CAP-10)
 *
 * Public API (on globalThis.CcFillOneNg):
 *   fillNg(el, selector, value, type, elType, ctx) => 1 | 0 | null
 *
 * ctx: { portalAdapters, filledBySource, _replayResults, _ccRecords,
 *        RUNTIME_VERSION, _flushRecords }
 *
 * Returns null if not ng-dropdown type.
 *
 * See fill-one-ng.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillNg(el, selector, value, type, elType, ctx) {
    if (!(elType === 'ng-dropdown' || type === 'ng-dropdown')) return null;

    var portalAdapters   = ctx.portalAdapters   || {};
    var filledBySource   = ctx.filledBySource   || {};
    var _replayResults   = ctx._replayResults   || {};
    var _ccRecords       = ctx._ccRecords       || [];
    var RUNTIME_VERSION  = ctx.RUNTIME_VERSION  || '';
    var _flushRecords    = ctx._flushRecords    || function () {};

    var _nos = root.CcNgOptionScorer  || {};
    var _nsm = root.CcNgSessionManager || {};
    var _bfr = root.CcBuildFillRecord || {};

    var rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
    var adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];

    if (!adapter) {
      var _noAdapterLabel = filledBySource[selector] && filledBySource[selector].label || selector;
      _replayResults[_noAdapterLabel] = 'no-adapter';
      try { sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults)); } catch (e) {}
      return 0;
    }

    var _label = (filledBySource[selector] && filledBySource[selector].label) || selector;
    var trigger = el.querySelector(adapter.triggerSelector) || el;

    if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
    if (_nsm.cancelSession) _nsm.cancelSession(_label, window._ccReplaySessions);

    var session = _nsm.createSession
      ? _nsm.createSession(_label, window._ccReplaySessions)
      : { id: Math.random().toString(36).slice(2, 8), fieldKey: _label, resolved: false, cancelled: false,
          pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
    if (!_nsm.createSession) window._ccReplaySessions.set(_label, session);

    function isVisible(node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    }

    function cleanupAndRecord(result) {
      if (session.resolved && result !== session._result) return;
      session.resolved = true;
      session._result = result;
      if (_nsm.cleanupSession) {
        _nsm.cleanupSession(session, window._ccReplaySessions, _label);
      } else {
        try { clearInterval(session.pollTimer); } catch (e) {}
        (session.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
        if (session.observer) { session.observer.disconnect(); session.observer = null; }
        window._ccReplaySessions.delete(_label);
      }
      _replayResults[_label] = result;
      try { sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults)); } catch (e) {}
      var _isOk = result === 'ok';
      var rec = _bfr.buildFillRecord
        ? _bfr.buildFillRecord({ selector: selector, value: value, type: 'ng-dropdown',
            result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result,
            strategy: 'ng-dropdown-click', durationMs: Date.now() - session.startedAt },
            { rv: RUNTIME_VERSION })
        : { selector: selector, value: value, type: 'ng-dropdown',
            result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result,
            strategy: 'ng-dropdown-click', durationMs: Date.now() - session.startedAt,
            ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' };
      _ccRecords.push(rec);
      _flushRecords();
    }

    var OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
      '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
    var addedNodes = [];
    var _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0,
      optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };

    trigger.click();

    var mo = new MutationObserver(function (mutations) {
      if (session.cancelled || session.resolved) return;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) addedNodes.push(n); });
      });
    });
    session.observer = mo;
    mo.observe(document.body, { childList: true, subtree: true });

    var _lastMutation = Date.now();
    var _stabilizeMo = new MutationObserver(function () { _lastMutation = Date.now(); });
    _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });

    function waitStable(cb) {
      var check = setInterval(function () {
        if (session.cancelled) { clearInterval(check); _stabilizeMo.disconnect(); return; }
        if (Date.now() - _lastMutation >= 150) { clearInterval(check); _stabilizeMo.disconnect(); cb(); }
      }, 50);
      var capId = setTimeout(function () {
        clearInterval(check); _stabilizeMo.disconnect();
        if (!session.cancelled) cb();
      }, 1200);
      session.timeoutIds.push(capId);
    }

    waitStable(function () {
      if (session.cancelled || session.resolved) return;
      mo.disconnect(); session.observer = null;
      _trace.mutationCount = addedNodes.length;

      var _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
      var activeOverlayRoot = null;
      var trigRect = trigger.getBoundingClientRect();

      for (var i = 0; i < addedNodes.length; i++) {
        var node = addedNodes[i];
        if (!isVisible(node)) continue;
        var lis = Array.from(node.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
        if (lis.length > 0) { activeOverlayRoot = node; break; }
      }

      if (!activeOverlayRoot) {
        var bestDist = Infinity;
        OVERLAY_TAGS.forEach(function (sel) {
          try {
            document.querySelectorAll(sel).forEach(function (node) {
              var lis2 = Array.from(node.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
              if (lis2.length === 0) return;
              var r = node.getBoundingClientRect();
              var dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
              if (dist < bestDist) { bestDist = dist; activeOverlayRoot = node; }
            });
          } catch (e) {}
        });
      }

      if (!activeOverlayRoot && adapter.optionsContainer) {
        activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
      }

      _trace.overlayFound = !!activeOverlayRoot;
      _trace.overlayTag = activeOverlayRoot
        ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0, 40) : 'NONE';

      var attempts = 0;
      session.pollTimer = setInterval(function () {
        if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
        attempts++;
        var searchRoot = activeOverlayRoot || document.body;
        var opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(function (o) { return isVisible(o); });
        if (opts.length === 0 && searchRoot !== document) {
          opts = Array.from(document.querySelectorAll(_optQ)).filter(function (o) {
            return isVisible(o) && !el.contains(o) && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]');
          });
        }

        var v = value.toLowerCase().trim();
        _trace.optionCount = opts.length;

        var scoreOption = _nos.scoreOption || function (ot) {
          ot = String(ot || '').toLowerCase().trim();
          if (ot === v) return 100;
          if (ot.includes(v)) return 80;
          if (v.includes(ot) && ot.length > 3) return 70;
          return 0;
        };

        var bestOpt = null, bestScore = 0;
        opts.forEach(function (o) {
          var score = scoreOption(o.textContent.trim(), v);
          if (score > bestScore) { bestScore = score; bestOpt = o; }
        });
        var opt = bestScore >= 50 ? bestOpt : null;

        if (opt) {
          clearInterval(session.pollTimer);
          if (session.cancelled || session.resolved) return;
          _trace.matchedOption = opt.textContent.trim();
          _trace.clicked = true;
          ['pointerdown','mousedown','mouseup','click'].forEach(function (ev) {
            opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
          });

          var verifyStart = Date.now();
          var triggerInitialText = trigger.textContent.trim();
          var verifyPoll = setInterval(function () {
            if (session.cancelled || session.resolved) { clearInterval(verifyPoll); return; }
            var verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
            var displayed = verifyEl ? verifyEl.textContent.trim() : '';
            var overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
            var triggerChanged = trigger.textContent.trim() !== triggerInitialText;
            var ariaSelected = opt.getAttribute('aria-selected') === 'true';
            var ok = (displayed && !/^(select|choose|--)$/i.test(displayed)) ||
                     overlayGone || triggerChanged || ariaSelected;
            if (ok || Date.now() - verifyStart >= 3000) {
              clearInterval(verifyPoll);
              if (session.resolved) return;
              _trace.verifyStatus = ok ? 'ok' : 'verify-fail';
              _trace.durationMs = Date.now() - session.startedAt;
              cleanupAndRecord(_trace.verifyStatus);
            }
          }, 200);

        } else if (attempts >= 10) {
          clearInterval(session.pollTimer);
          if (session.resolved) return;
          document.body.click();
          _trace.durationMs = Date.now() - session.startedAt;
          cleanupAndRecord('no-option');
        }
      }, 300);
    });

    return 1;
  }

  root.CcFillOneNg = {
    fillNg: fillNg,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-select.js ==== */
/**
 * fill-one-select — Native Select Fill Handler
 *
 * Fills <select> elements. Delegates option matching to window.ccMatchOption.
 * Applies selection via native setter + full event sequence (ASP.NET/NIC compat).
 * Includes DWR cascade re-apply (ServicePlus), AI LLM fallback.
 *
 * Public API (on globalThis.CcFillOneSelect):
 *   fillSelect(el, selector, value, mapping) => 1 | 0 | null
 *
 * Returns null if not a select element.
 *
 * See fill-one-select.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillSelect(el, selector, value, mapping) {
    if ((el.tagName || '').toLowerCase() !== 'select') return null;

    var norm = function (s) {
      return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    };
    var v = norm(value);
    var extraValues = [];
    var mapEntry = mapping && mapping[selector];
    if (mapEntry && mapEntry.monthNum) {
      extraValues.push(mapEntry.monthNum.toString());
      if (mapEntry.monthShort) extraValues.push(mapEntry.monthShort.toLowerCase());
    }

    function findOpt(options) {
      return window.ccMatchOption
        ? window.ccMatchOption(value, options, { extraValues: extraValues })
        : null;
    }

    function applySelect(el, opt) {
      el.focus();
      el.dispatchEvent(new Event('focus', { bubbles: true }));
      Array.from(el.options).forEach(function (o) { o.selected = false; });
      opt.selected = true;
      el.selectedIndex = opt.index;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
      if (nativeSetter) nativeSetter.set.call(el, opt.value);
      else el.value = opt.value;
      ['mousedown','mouseup','click','input','change'].forEach(function (ev) {
        el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch (e) {} }
      if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch (e) {} }
      try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch (e) {}
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      // Re-apply after framework reset (300ms)
      var _rv = opt.value, _ri = opt.index;
      setTimeout(function () {
        if (el.value !== _rv || el.selectedIndex !== _ri) {
          opt.selected = true; el.selectedIndex = _ri;
          if (nativeSetter) nativeSetter.set.call(el, _rv); else el.value = _rv;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 300);
      // One more delayed change
      setTimeout(function () { el.dispatchEvent(new Event('change', { bubbles: true })); }, 700);
      // DWR cascade re-apply (ServicePlus)
      setTimeout(function () {
        if (el.value !== _rv) {
          el.selectedIndex = _ri; el.value = _rv;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 3500);
      return 1;
    }

    var allOptions = Array.from(el.options);
    var opt = findOpt(allOptions);
    if (opt) return applySelect(el, opt);

    // Retry interval + AI fallback
    var attempts = 0;
    var interval = setInterval(function () {
      var allOpts = Array.from(el.options);
      var realOpts = allOpts.filter(function (o) {
        if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
        var txt = o.text.toLowerCase();
        return !txt.includes('select') && !txt.includes('choose') &&
               !txt.includes('loading') && txt !== '--';
      });
      if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
      var opt2 = findOpt(allOpts);
      if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
      if (++attempts >= 15) {
        clearInterval(interval);
        var groqKey = window._cc_groq_key || (document.body.getAttribute('data-cc-llm-key') || '');
        if (groqKey && realOpts.length > 0) {
          var optTexts = realOpts.map(function (o) { return o.text.trim(); }).join('\n');
          window.ccLLM && window.ccLLM.call({
            apiKey: groqKey,
            baseUrl: document.body.getAttribute('data-cc-llm-url') || undefined,
            model: document.body.getAttribute('data-cc-llm-model') || undefined,
            userPrompt: 'From these dropdown options, which best matches "' + value +
              '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
            maxTokens: 50,
          }).then(function (result) {
            var aiText = (result.text || '').trim();
            if (aiText) {
              var aiOpt = realOpts.find(function (o) { return o.text.trim() === aiText; }) ||
                          realOpts.find(function (o) { return o.text.trim().toLowerCase().includes(aiText.toLowerCase()); });
              if (aiOpt) applySelect(el, aiOpt);
            }
          }).catch(function () {});
        }
      }
    }, 200);
    return 1;
  }

  root.CcFillOneSelect = {
    fillSelect: fillSelect,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-date.js ==== */
/**
 * fill-one-date — Date Field Fill Handler
 *
 * Fills date inputs across 4 widget types:
 *   1. flatpickr  — uses fp.setDate() API
 *   2. jQuery UI datepicker — uses $(el).datepicker('setDate')
 *   3. Angular Material mat-datepicker — native setter + dateChange/dateInput events
 *   4. Native date/time inputs — ISO format conversion via CcParseDateValue
 *
 * Delegates date parsing to CcParseDateValue (already extracted).
 *
 * Public API (on globalThis.CcFillOneDate):
 *   fillDate(el, selector, value) => 1 | 0 | null
 *
 * Returns null if element is not a date widget (pass-through).
 *
 * See fill-one-date.md for full documentation.
 */
(function (root) {
  'use strict';

  function fillDate(el, selector, value) {
    var _pdv = root.CcParseDateValue || {};
    var parseDateValue = _pdv.parseDateValue || function (v) { return { dateObj: new Date(v) }; };

    // ── flatpickr ─────────────────────────────────────────────────────────────
    if (el._flatpickr || el.classList.contains('flatpickr-input')) {
      var fp = el._flatpickr;
      var parsed = parseDateValue(value);
      var dateObj = parsed.dateObj;
      if (fp && !isNaN(dateObj)) {
        fp.setDate(dateObj, true);
      } else {
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv) niv.set.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }
      return el.value ? 1 : 0;
    }

    // ── jQuery UI datepicker ──────────────────────────────────────────────────
    if (el.classList.contains('hasDatepicker') ||
        (typeof $ !== 'undefined' && typeof $.fn !== 'undefined' &&
         typeof $.fn.datepicker !== 'undefined' && $(el).data('datepicker'))) {
      var parsed2 = parseDateValue(value);
      var dateObj2 = parsed2.dateObj;
      if (!isNaN(dateObj2)) {
        $(el).datepicker('setDate', dateObj2);
      } else {
        var niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv2) niv2.set.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return el.value ? 1 : 0;
    }

    // ── Angular Material mat-datepicker ───────────────────────────────────────
    if (el.getAttribute('matdatepicker') !== null ||
        (el.getAttribute('matInput') !== null &&
         el.closest('mat-datepicker-toggle,mat-form-field') &&
         (el.type === 'text' || el.type === 'date'))) {
      var niv3 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      el.focus();
      if (niv3) niv3.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new CustomEvent('dateChange', { bubbles: true, detail: { value: value } }));
      el.dispatchEvent(new CustomEvent('dateInput', { bubbles: true, detail: { value: value } }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'Enter' }));
      el.blur();
      return 1;
    }

    // ── Native date/time inputs ───────────────────────────────────────────────
    if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'month' || el.type === 'week') {
      var parsed3 = parseDateValue(value);
      var isoValue;
      if (el.type === 'datetime-local' && String(value || '').includes('T')) {
        isoValue = String(value);
      } else if (parsed3 && parsed3.isoDate) {
        isoValue = (el.type === 'month') ? parsed3.isoMonth : parsed3.isoDate;
      } else {
        isoValue = value;
      }
      if (el.type === 'datetime-local' && !isoValue.includes('T')) {
        isoValue += 'T00:00';
      }
      var niv4 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      el.focus();
      if (niv4) niv4.set.call(el, isoValue); else el.value = isoValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return el.value ? 1 : 0;
    }

    return null;
  }

  root.CcFillOneDate = {
    fillDate: fillDate,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-radio.js ==== */
/**
 * fill-one-radio — Radio, Checkbox, and File Fill Handlers
 *
 * Handles: radio (name-group match), radio-click (direct), radio-group
 * (normalised match with gender synonyms), checkbox (boolean-like values),
 * file input (base64 path only; URL fetch handled in sequential loop).
 *
 * Public API (on globalThis.CcFillOneRadio):
 *   fillRadio(el, selector, value, type, elType, filledBySource) => 1 | 0 | null
 *
 * Returns null for unrecognised types (pass-through for handler chain).
 *
 * See fill-one-radio.md for full documentation.
 */
(function (root) {
  'use strict';

  var NORM = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim(); };

  function fillRadio(el, selector, value, type, elType, filledBySource) {
    // ── radio-click: direct click on a radio input ────────────────────────────
    if (type === 'radio-click') {
      var target = (el.type === 'radio') ? el : (el.querySelector && el.querySelector('input[type="radio"]')) || el;
      target.focus();
      target.checked = true;
      ['click', 'change'].forEach(function (ev) {
        target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      return 1;
    }

    // ── radio-group: find matching radio by value/label + gender synonyms ─────
    if (type === 'radio-group' && elType === 'radio' && el.name) {
      var vR0 = NORM(value);
      var radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var match = Array.from(radios).find(function (r) {
        if (NORM(r.value) === vR0) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : '';
        if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
        // Gender synonyms
        var wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
        var wantMale   = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
        if (wantFemale && /female|महिला|स्त्री/.test((lbl && lbl.textContent) || r.value)) return true;
        if (wantMale   && /male|पुरुष/.test((lbl && lbl.textContent) || r.value) &&
            !/female/.test((lbl && lbl.textContent) || '')) return true;
        return false;
      });
      if (match) {
        match.focus();
        match.checked = true;
        ['click', 'change'].forEach(function (ev) {
          match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        return 1;
      }
      return 0;
    }

    // ── DOM radio: name-group match by value/label ────────────────────────────
    if (elType === 'radio') {
      var vR = NORM(value);
      var radiosDOM = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var matchDOM = Array.from(radiosDOM).find(function (r) {
        if (NORM(r.value) === vR) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : '';
        return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
      });
      if (matchDOM) {
        matchDOM.focus();
        matchDOM.checked = true;
        ['click', 'change'].forEach(function (ev) {
          matchDOM.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        matchDOM.dispatchEvent(new Event('blur', { bubbles: true }));
        return 1;
      }
      return null; // pass to next handler
    }

    // ── checkbox ──────────────────────────────────────────────────────────────
    if (elType === 'checkbox') {
      var booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
      if (!booleanLike.includes(value.toLowerCase())) return 0; // non-boolean value skipped
      var truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
      if (truthy !== el.checked) {
        el.checked = truthy;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 1;
      }
      return 1;
    }

    // ── file (base64 only; URL fetch handled in sequential loop) ──────────────
    if (el.type === 'file') {
      if (!value) return 0;
      if (value.startsWith('data:')) {
        try {
          var parts  = value.split(',');
          var meta   = parts[0];
          var b64    = parts[1];
          var mime   = (meta.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
          var ext    = mime.split('/')[1] || 'bin';
          var fBys   = filledBySource || {};
          var label  = (fBys[selector] && fBys[selector].label) || 'file';
          var fileName = label.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
          var binary = atob(b64);
          var bytes  = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          var file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 1;
        } catch (e) { return 0; }
      }
      if (value.startsWith('http://') || value.startsWith('https://')) return 0; // deferred
      return 0;
    }

    return null;
  }

  root.CcFillOneRadio = {
    fillRadio: fillRadio,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-mat.js ==== */
/**
 * fill-one-mat — Angular Material Fill Handler
 *
 * Fills mat-select, mat-checkbox, and mat-radio elements.
 *
 * mat-select: opens overlay via trigger click, waits 400ms, finds matching
 * mat-option by text (exact → startsWith → reverseStartsWith → includes),
 * clicks it. Fire-and-forget — returns 1 immediately.
 *
 * mat-checkbox: toggles if current checked state doesn't match desired.
 *
 * mat-radio: clicks if label text matches value.
 *
 * Public API (on globalThis.CcFillOneMat):
 *   fillMat(el, value, elType) => 1 | 0 | null
 *
 * Returns null if elType is not a mat type (pass-through for handler chain).
 *
 * See fill-one-mat.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * @param {Element} el
   * @param {string}  value
   * @param {string}  elType  — 'mat-select' | 'mat-checkbox' | 'mat-radio'
   * @returns {1|0|null}
   */
  function fillMat(el, value, elType) {
    if (elType !== 'mat-select' && elType !== 'mat-checkbox' && elType !== 'mat-radio') {
      return null;
    }

    if (elType === 'mat-select') {
      var trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
      trigger.click();
      setTimeout(function () {
        var v = value.toLowerCase().trim();
        var opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
        var opt = opts.find(function (o) { return o.textContent.trim().toLowerCase() === v; }) ||
                  opts.find(function (o) { return o.textContent.trim().toLowerCase().startsWith(v); }) ||
                  opts.find(function (o) { return v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2; }) ||
                  opts.find(function (o) { return o.textContent.trim().toLowerCase().includes(v); });
        if (opt) opt.click(); else document.body.click();
      }, 400);
      return 1; // fire-and-forget
    }

    if (elType === 'mat-checkbox') {
      var shouldCheck = /yes|true|1|on|checked/i.test(value);
      var input = el.querySelector('input[type="checkbox"]');
      var isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
      if (shouldCheck !== isChecked) { (input || el).click(); }
      return 1;
    }

    if (elType === 'mat-radio') {
      var v2 = value.toLowerCase().trim();
      var label = el.textContent.trim().toLowerCase();
      if (label === v2 || label.includes(v2) || v2.includes(label)) {
        var radioInput = el.querySelector('input[type="radio"]') || el;
        radioInput.click();
        return 1;
      }
      return 0;
    }

    return 0;
  }

  root.CcFillOneMat = {
    fillMat: fillMat,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fill-one-text.js ==== */
/**
 * fill-one-text — Text / Keystroke Fill Handler
 *
 * Fills text inputs and textareas. Primary path uses window.keystrokeFillSync
 * (mimics real typing). Legacy fallback uses native value-set + event dispatch.
 *
 * Also handles the ServicePlus/RTPS Bihar pattern: after filling a fullName
 * field, fills the paired Hindi sibling via Google Transliteration API if the
 * site's own transliteration doesn't fire within 500ms.
 *
 * All browser globals are read at call time (not injected) since this
 * capability runs exclusively in the browser extension context.
 *
 * Public API (on globalThis.CcFillOneText):
 *   fillText(el, value) => 1 | 0
 *
 * See fill-one-text.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Fill a text input or textarea element.
   *
   * @param {Element} el     — target input or textarea
   * @param {string}  value  — value to fill
   * @returns {1|0}  1 = filled, 0 = failed
   */
  function fillText(el, value) {
    var isTextarea = el.tagName === 'TEXTAREA';
    var niv = isTextarea
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

    // PRIMARY PATH: keystroke-style fill
    if (typeof window.keystrokeFillSync === 'function') {
      var ok = window.keystrokeFillSync(el, value);

      // ServicePlus / RTPS Bihar: fill paired Hindi sibling if site doesn't
      if (el.getAttribute && el.getAttribute('data-type') === 'fullName') {
        var allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
        var idx = allInputs.indexOf(el);
        var next = allInputs[idx + 1];
        if (next && next.getAttribute('data-type') === 'text') {
          setTimeout(function () {
            if (next.value && next.value.length > 0) return; // site filled it
            var fillHindi = function (hindiVal) {
              if (typeof window.keystrokeFillSync === 'function') window.keystrokeFillSync(next, hindiVal);
            };
            fetch('https://inputtools.google.com/request?text=' + encodeURIComponent(value) +
              '&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
              .then(function (r) { return r.json(); })
              .then(function (d) {
                var hindi = d && d[1] && d[1][0] && d[1][0][1] && d[1][0][1][0];
                fillHindi(hindi || value);
              })
              .catch(function () { fillHindi(value); });
          }, 500);
        }
      }

      return ok ? 1 : 0;
    }

    // LEGACY FALLBACK: value-set + event dispatch
    el.focus();
    if (niv) niv.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
    return 1;
  }

  root.CcFillOneText = {
    fillText: fillText,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-kernel-bind.js ==== */
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

/* ==== capabilities/install-debug.js ==== */
/**
 * Live fill_debug emit (port + batch queue)
 * Part of sequential kernel — load before autofill/executor.js
 *
 * fill-debug-emitter.js owns the pure event queue + batch logic.
 * This file owns the Chrome transport and wires it to the kernel.
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDebug = function (k) {
    k._debugPort = null;
    k._debugQueue = [];
    k._debugFlushTimer = null;

  // ── fill-debug-emitter.js is the single source for queue + event assembly ──
  // Must be loaded before debug.js (see build-executor-bundle.mjs ORDER).
  var _fde = root.CcFillDebugEmitter || {};

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

  function chromeSend(batch) {
    try {
      var port = ensureDebugPort();
      if (port) {
        port.postMessage({ type: 'FILL_DEBUG_BATCH', events: batch });
        return;
      }
    } catch (e) {
      k._debugPort = null;
    }
    // Fallback: one-by-one sendMessage (best-effort)
    for (var i = 0; i < batch.length; i++) {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: 'FILL_DEBUG' }, batch[i]), function () {
          void chrome.runtime.lastError;
        });
      } catch (e2) { /* ignore */ }
    }
  }

  var _emitter;
  if (_fde.createEmitter) {
    _emitter = _fde.createEmitter({
      getRunId:    function () { return k.fillRunId || ''; },
      getRv:       function () { return k.RUNTIME_VERSION || ''; },
      send:        chromeSend,
    });
  }

  function emitFillDebug(event, payload) {
    if (_emitter) { _emitter.emit(event, payload); return; }
    // Safe fallback if emitter not loaded
    console.warn('[CC] fill-debug-emitter not loaded, event dropped:', event);
  }

  function flushDebugQueue() {
    if (_emitter) _emitter.flush();
  }

    k.emitFillDebug = emitFillDebug;
    k.flushDebugQueue = flushDebugQueue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-select-helpers.js ==== */
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
  // ── build-fill-record.js is the single source for record stamping ─────────
  var _bfr = root.CcBuildFillRecord || {};
  var _buildFillRecord = _bfr.buildFillRecord || function (base) { return Object.assign({ ts: Date.now(), rv: k.RUNTIME_VERSION, fillMode: 'sequential' }, base); };

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
    const rec = _buildFillRecord(base, { rv: k.RUNTIME_VERSION });
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
    k.buildFillRecord = _buildFillRecord;
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

/* ==== capabilities/install-settle.js ==== */
/**
 * settleAfterAct + WaitEngine
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function (k) {

    // CcSettleAfterAct and CcWaitForOptions are guaranteed to be loaded
    // before this installer runs (see build-executor-bundle.mjs ORDER).
    var _saa = root.CcSettleAfterAct;
    var _wfo = root.CcWaitForOptions;

    function waitForNetworkIdle(quietMs, maxMs) {
      if (typeof window !== 'undefined' && typeof window.ccWaitForNetworkIdle === 'function') {
        return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8000);
      }
      return new Promise(function (r) {
        setTimeout(r, quietMs || 200, { idle: true, waitedMs: quietMs || 200 });
      });
    }

    function waitForOptions(selector, minCount, timeout) {
      return _wfo.waitForOptions(selector, minCount, timeout,
        document.querySelector.bind(document), document.body);
    }

    var _settleEngine = _saa.createSettleEngine({
      waitForNetworkIdle: waitForNetworkIdle,
      waitForOptions: waitForOptions,
      getBudget: function () { return k.ajaxWaitBudgetMs; },
      setBudget: function (n) { k.ajaxWaitBudgetMs = n; },
    });

    function waitForDOMQuiet(ms) {
      ms = ms || 300;
      return new Promise(function (resolve) {
        var last = Date.now();
        var mo = new MutationObserver(function () { last = Date.now(); });
        mo.observe(document.body, { childList: true, subtree: true });
        var check = setInterval(function () {
          if (Date.now() - last >= ms) { clearInterval(check); mo.disconnect(); resolve(); }
        }, 50);
        setTimeout(function () { clearInterval(check); mo.disconnect(); resolve(); }, 5000);
      });
    }

    k.settleAfterAct = function (kind, opts) { return _settleEngine.settleAfterAct(kind, opts); };
    k.waitForSelectOptionsSequential = function (sel, maxMs) { return _settleEngine.waitForSelectOptionsSequential(sel, maxMs); };
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-dom-order.js ==== */
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
    // sort-fields-by-dom-order.js is the single owner of DOM order sorting.
    // Must be loaded before dom-order.js (see build-executor-bundle.mjs ORDER).
    k.entries = Object.entries(k.mapping || {});
    var _sort = root.CcSortFieldsByDomOrder;
    if (_sort) {
      _sort.sortFieldsByDomOrder(k.entries, _resolve);
    } else {
      // safe fallback: preserve insertion order if capability not loaded
      console.warn('[CC] CcSortFieldsByDomOrder not loaded — skipping DOM order sort');
    }

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-strategy.js ==== */
/**
 * STRATEGY_REGISTRY + detectStrategy + verifyValue
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installStrategy = function (k) {
    const getEl = function () { return k.getEl.apply(k, arguments); };
  // ── detect-fill-strategy.js is the single source for strategy registry ────
  // Must be loaded before strategy.js (see build-executor-bundle.mjs ORDER).
  var _dfs = root.CcDetectFillStrategy || {};
  var STRATEGY_REGISTRY = _dfs.STRATEGY_REGISTRY || {};

  // Detect which strategy applies to a field (for ReplayRecord tagging)
  function detectStrategy(el, type) {
    if (_dfs.detectFillStrategy) return _dfs.detectFillStrategy(el, type);
    return type || 'unknown'; // safe fallback
  }

  // verify-fill-value.js is the single source for fill value verification.
  // Must be loaded before strategy.js (see build-executor-bundle.mjs ORDER).
  var _vfv = root.CcVerifyFillValue || {};
  var _resolveEl = root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector : function(sel) { return document.querySelector(sel); };
  async function verifyValue(selector, expected, settleMs) {
    if (_vfv.verifyFillValue) return _vfv.verifyFillValue(selector, expected, _resolveEl, settleMs);
    // Safe fallback: unknown result
    return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'verifier-not-loaded' };
  }

    k.STRATEGY_REGISTRY = STRATEGY_REGISTRY;
    k.detectStrategy = detectStrategy;
    k.verifyValue = verifyValue;

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-fill-one-ng-helpers.js ==== */
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

    // CcNgOptionScorer and CcNgSessionManager are guaranteed loaded before
    // this installer runs (see build-executor-bundle.mjs ORDER).
    var _nos = root.CcNgOptionScorer;
    var _nsm = root.CcNgSessionManager;

    k._ngIsVisible = function (node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible
        ? window.ccDomUtils.isVisible(node)
        : !!(node && node.offsetParent !== null);
    };

    k._ngScoreOption = function (optText, planned) {
      return _nos.scoreOption(optText, planned);
    };

    k._ngCancelSession = function (_label) {
      _nsm.cancelSession(_label, window._ccReplaySessions || null);
    };

    k._ngPickOption = function (opts, planned) {
      var wrapped = Array.from(opts).map(function (n) {
        return { text: (n.textContent || n.innerText || '').trim(), node: n };
      });
      var result = _nos.scoreAndPick(wrapped, planned, 30);
      return result ? result.node : null;
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-fill-one-ng.js ==== */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNg = function (k) {
    root.CcExecParts.installFillOneNgHelpers(k);
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters, filledBySource = b.filledBySource;
    const _replayResults = b._replayResults, _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION, _flushRecords = b._flushRecords;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fong = root.CcFillOneNg || {};
    k.fillOneHandlers.push({
      id: 'ng-dropdown',
      try(el, selector, value, type, elType) {
        if (_fong.fillNg) return _fong.fillNg(el, selector, value, type, elType, {
          portalAdapters, filledBySource, _replayResults, _ccRecords,
          RUNTIME_VERSION, _flushRecords,
        });
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
            if (session.resolved && result !== session._result) return;
            session.resolved = true;
            session._result = result;
            clearInterval(session.pollTimer);
            session.timeoutIds.forEach(id => clearTimeout(id));
            if (session.observer) { session.observer.disconnect(); session.observer = null; }
            window._ccReplaySessions.delete(_label);
            _replayResults[_label] = result;
            sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
            const _isOk = result === 'ok';
            _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b){return Object.assign({ts:Date.now(),rv:RUNTIME_VERSION,fillMode:'sequential'},b);})({ selector, value, type: 'ng-dropdown', result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result, strategy: 'ng-dropdown-click', durationMs: Date.now()-session.startedAt }, { rv: RUNTIME_VERSION }));
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
              var _nos = root.CcNgOptionScorer;
              let bestOpt = null, bestScore = 0;
              for (const o of opts) {
                const score = _nos.scoreOption(o.textContent.trim(), v);
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
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-fill-one-mat.js ==== */
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
    var _fom = root.CcFillOneMat || {};
    k.fillOneHandlers.push({
      id: 'mat',
      try(el, selector, value, type, elType) {
        if (_fom.fillMat) return _fom.fillMat(el, value, elType);
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

/* ==== capabilities/install-fill-one-radio-planned.js ==== */
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
    var _for2 = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: 'radio-planned',
      try(el, selector, value, type, elType) {
        if (_for2.fillRadio) return _for2.fillRadio(el, selector, value, type, elType, filledBySource);
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

/* ==== capabilities/install-fill-one-select.js ==== */
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
    var _fos = root.CcFillOneSelect || {};
    k.fillOneHandlers.push({
      id: 'select',
      try(el, selector, value, type, elType) {
        if (elType !== 'select') return null;
        if (_fos.fillSelect) return _fos.fillSelect(el, selector, value, mapping);
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

/* ==== capabilities/install-fill-one-choice-dom.js ==== */
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
    var _for = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: 'choice-dom',
      try(el, selector, value, type, elType) {
        if (_for.fillRadio) return _for.fillRadio(el, selector, value, type, elType, filledBySource);
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

/* ==== capabilities/install-fill-one-date.js ==== */
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
    var _fod = root.CcFillOneDate || {};
    k.fillOneHandlers.push({
      id: 'date',
      try(el, selector, value, type, elType) {
        if (_fod.fillDate) return _fod.fillDate(el, selector, value);
        if (el._flatpickr || el.classList.contains('flatpickr-input')) {
                // ── flatpickr datepicker ─────────────────────────────────────────────
                // flatpickr attaches _flatpickr instance to the input. Use its API.
                const fp = el._flatpickr;
                // parse-date-value.js is the single source for date string parsing.
                var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
                var dateObj = _parsed.dateObj;

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
                // parse-date-value.js is the single source for date string parsing.
                var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
                var dateObj = _parsed.dateObj;

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
                // parse-date-value.js provides ISO conversion for all date formats.
                var _parsed2 = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : null;
                // For datetime-local: preserve original if it already has a time component
                var isoValue;
                if (el.type === 'datetime-local' && String(value || '').includes('T')) {
                  isoValue = String(value); // already has datetime — pass through
                } else if (_parsed2 && _parsed2.isoDate) {
                  isoValue = (el.type === 'month') ? _parsed2.isoMonth : _parsed2.isoDate;
                } else {
                  isoValue = value; // fallback: pass through original
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

/* ==== capabilities/install-fill-one-text.js ==== */
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
    // fill-one-text.js capability is the single source for text fill logic.
    var _fot = root.CcFillOneText || {};
    k.fillOneHandlers.push({
      id: 'text',
      try(el, selector, value, type, elType) {
        if (_fot.fillText) return _fot.fillText(el, value);

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

/* ==== capabilities/install-fill-one.js ==== */
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

/* ==== capabilities/install-sequential.js ==== */
/**
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
    const _buildFillRecord = (root.CcBuildFillRecord && root.CcBuildFillRecord.buildFillRecord)
      || function(base) { return Object.assign({ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: 'sequential' }, base); };
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
                _ccRecords.push(_buildFillRecord({ selector, value, type: 'button', result: 'filled', strategy: 'plugin:button-click', plugin: 'button-click', role: fieldData.role || 'navigation', newFieldCount, transitionOutcome: newFieldCount > _preCount ? "transition_success" : newFieldCount === _preCount ? "transition_no_change" : "transition_partial", durationMs: Date.now()-_t0 }, { rv: RUNTIME_VERSION })); _flushRecords();
                console.debug('[CC][plugin] button-click', selector, 'newFields:', newFieldCount);
              } else {
                if (el) el.click();
                await waitForDOMQuiet(800);
              }
              await settleAfterAct('button');
            } else if (isNgDropdown) {
              if (!el) { _ccRecords.push(_buildFillRecord({ selector, value, type, result: 'skipped', failReason: 'no-element', strategy: 'ng-dropdown' }, { rv: RUNTIME_VERSION })); _flushRecords(); continue; }
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
                  _ccRecords.push(_buildFillRecord({ selector, value, type, result: _r ? 'filled' : 'skipped', failReason: _r ? null : _pResult.reason, strategy: 'plugin:' + _ngPlugin.id, plugin: _ngPlugin.id, durationMs: Date.now()-_t0 }, { rv: RUNTIME_VERSION })); _flushRecords();
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
                    _ccRecords.push(_buildFillRecord({
                      selector,
                      value,
                      type: 'file',
                      label: _fieldCtx.label,
                      result: 'filled',
                      strategy: 'file-url-fetch',
                      fileName,
                      fileSize: file.size,
                      durationMs: Date.now() - _t0,
                    }, { rv: RUNTIME_VERSION }));
                    _flushRecords();
                  } else {
                    _ccRecords.push(_buildFillRecord({
                      selector,
                      value,
                      type: 'file',
                      label: _fieldCtx.label,
                      result: 'waiting_human',
                      failReason: 'fetch-' + resp.status,
                      strategy: 'file-needs-human',
                      durationMs: Date.now() - _t0,
                    }, { rv: RUNTIME_VERSION }));
                    _flushRecords();
                  }
                } catch (e) {
                  _ccRecords.push(_buildFillRecord({
                    selector,
                    value,
                    type: 'file',
                    label: _fieldCtx.label,
                    result: 'waiting_human',
                    failReason: e.message || 'fetch-error',
                    strategy: 'file-needs-human',
                    durationMs: Date.now() - _t0,
                  }, { rv: RUNTIME_VERSION }));
                  _flushRecords();
                }
              } else {
                _ccRecords.push(_buildFillRecord({
                  selector,
                  value: value || null,
                  type: 'file',
                  label: _fieldCtx.label,
                  result: 'waiting_human',
                  failReason: value ? 'filename_only_no_url' : 'no_file_value',
                  strategy: 'file-needs-human',
                  durationMs: Date.now() - _t0,
                }, { rv: RUNTIME_VERSION }));
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
                const _recChoice = _buildFillRecord({
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
                  durationMs: Date.now() - _t0,
                }, { rv: RUNTIME_VERSION });
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
                _ccRecords.push(_buildFillRecord({
                  selector,
                  value,
                  type,
                  result: 'error',
                  error: e.message,
                }, { rv: RUNTIME_VERSION }));
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

/* ==== capabilities/install-post-fill-corrections.js ==== */
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

// CcPostFillCorrections is the single source for correction observer logic.
  var _pfc = root.CcPostFillCorrections || {};
  if (_pfc.installCorrectionsObserver) {
    _pfc.installCorrectionsObserver({
      entries: Array.from(entries),
      filledBySource: filledBySource,
      allFields: allFields,
      getEl: getEl,
      records: k.records || [],
      RUNTIME_VERSION: RUNTIME_VERSION,
    });
    return;
  }
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

/* ==== capabilities/install-post-fill-confirm.js ==== */
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
    // confirm-field-pattern.js is the single source of truth for confirm/retype detection.
    var _cfp = root.CcConfirmFieldPattern || {};
    var _isConfirmField = _cfp.isConfirmField || function() { return false; };
    var _getBaseId      = _cfp.getBaseId     || function(id) { return id; };
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number]'));
    allInputs.forEach(function(el) {
      if (!el.id && !el.name) return;
      var id = (el.id || el.name || '').toLowerCase();
      var label = (function() { if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)return l.textContent.toLowerCase();} return ''; })();
      var isConfirm = _isConfirmField(id, label);
      if (!isConfirm) return;
      if (el.value) return; // already filled, skip
      // Find primary field by stripping confirm prefix from ID
      var baseId = _getBaseId(id);
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
      _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b){return Object.assign({ts:Date.now(),rv:RUNTIME_VERSION,fillMode:'sequential'},b);})({ selector: '#'+(el.id||el.name), value: primary.value, type: 'text', result: 'filled', strategy: 'confirm-mirror', durationMs: 0 }, { rv: RUNTIME_VERSION }));
      _flushRecords();
    });
  }, 4000);

  
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/install-post-fill-mirror.js ==== */
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
    // confirm-field-pattern.js is the single source of truth for confirm/retype detection.
    var _cfp = root.CcConfirmFieldPattern || {};
    var _isConfirmField = _cfp.isConfirmField || function() { return false; };
    var _getBaseId      = _cfp.getBaseId     || function(id) { return id; };
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
        if (_isConfirmField(oid)) {
          var baseId = _getBaseId(oid);
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

/* ==== capabilities/install-post-fill.js ==== */
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
