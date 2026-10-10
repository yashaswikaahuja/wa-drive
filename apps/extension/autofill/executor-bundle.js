/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/executor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== parse-date-value.ts ==== */
(function(root2) {
  "use strict";
  function parseDateValue(value) {
    var empty = { dateObj: null, isoDate: "", isoMonth: "", isoDatetime: "" };
    if (value == null || value === "") return empty;
    var str = String(value).trim();
    if (!str) return empty;
    var dateObj = null;
    var ddmmyyyy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (ddmmyyyy) {
      dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
    }
    var yyyymmdd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!dateObj && yyyymmdd) {
      dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2] - 1, +yyyymmdd[3]);
    }
    if (!dateObj) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) dateObj = d;
    }
    if (!dateObj || isNaN(dateObj.getTime())) return empty;
    var year = dateObj.getFullYear();
    var month = String(dateObj.getMonth() + 1).padStart(2, "0");
    var day = String(dateObj.getDate()).padStart(2, "0");
    var isoDate = year + "-" + month + "-" + day;
    var isoMonth = year + "-" + month;
    var isoDatetime = isoDate + "T00:00";
    return { dateObj, isoDate, isoMonth, isoDatetime };
  }
  root2.CcParseDateValue = {
    parseDateValue
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcParseDateValue;

/* ==== cascade-field-level.ts ==== */
(function(root2) {
  "use strict";
  var CASCADE_PARENTS = {
    district: ["state"],
    sub_division: ["district", "state"],
    block: ["district", "sub_division", "state"],
    panchayat: ["block", "district"],
    village: ["block", "district"],
    police_station: ["district", "block"],
    post_office: ["block", "village", "district"]
  };
  function cascadeFieldLevel(label, profileKey, selector) {
    var s = ((profileKey || "") + " " + (label || "") + " " + (selector || "")).toLowerCase();
    if (/sub[_\s-]*div|अनुमंडल|subdivision/.test(s)) return "sub_division";
    if (/state|rajya|राज्य/.test(s) && !/sub/.test(s)) return "state";
    if (/district|jila|जिला/.test(s)) return "district";
    if (/block|prakhand|प्रखंड|tehsil|taluka/.test(s)) return "block";
    if (/panchayat|पंचायत/.test(s)) return "panchayat";
    if (/village|gram|ग्राम|mohalla|मोहल्ला/.test(s)) return "village";
    if (/police|thana|थाना/.test(s)) return "police_station";
    if (/post[_\s-]*office|डाक/.test(s)) return "post_office";
    if (/\bpin\b|pincode|pin[_\s-]*code|पिन/.test(s)) return "pin_code";
    return "";
  }
  root2.CcCascadeFieldLevel = {
    cascadeFieldLevel,
    CASCADE_PARENTS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcCascadeFieldLevel;

/* ==== select-option-state.ts ==== */
(function(root2) {
  "use strict";
  function isPlaceholderOption(o) {
    if (!o) return true;
    var v = String(o.value == null ? "" : o.value).trim();
    var t = String(o.text || "").trim().toLowerCase();
    if (!v || v === "0" || v === "-1" || v === "") return true;
    if (!t || t === "--" || t.includes("select") || t.includes("choose") || t.includes("loading")) return true;
    return false;
  }
  function realOptions(el) {
    if (!el || !el.options) return [];
    return Array.from(el.options).filter(function(o) {
      return !isPlaceholderOption(o);
    });
  }
  function sampleOptions(el, n) {
    n = n || 8;
    return realOptions(el).slice(0, n).map(function(o) {
      return {
        value: String(o.value || "").slice(0, 40),
        text: String(o.text || "").trim().slice(0, 60)
      };
    });
  }
  function readSelectActual(el) {
    if (!el || el.tagName !== "SELECT") return { actualValue: null, actualOptionValue: null };
    var opt = el.options && el.options[el.selectedIndex];
    if (!opt || isPlaceholderOption(opt)) {
      return { actualValue: "", actualOptionValue: opt ? String(opt.value || "") : "" };
    }
    return {
      actualValue: String(opt.text || "").trim(),
      actualOptionValue: String(opt.value || "")
    };
  }
  function selectLoadMode(el) {
    if (!el || el.tagName !== "SELECT") return "unknown";
    return realOptions(el).length > 0 ? "static" : "ajax";
  }
  function selectIsActive(el) {
    if (!el) return false;
    if (el.disabled) return false;
    try {
      if (el.offsetParent === null && el.getClientRects && el.getClientRects().length === 0) return false;
    } catch (e) {
    }
    return true;
  }
  function isPlaceholderPlanned(v) {
    var t = String(v == null ? "" : v).toLowerCase().trim();
    return !t || t === "--" || t === "0" || t.includes("please select") || t === "select" || t.startsWith("select ");
  }
  root2.CcSelectOptionState = {
    isPlaceholderOption,
    realOptions,
    sampleOptions,
    readSelectActual,
    selectLoadMode,
    selectIsActive,
    isPlaceholderPlanned
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcSelectOptionState;

/* ==== confirm-field-pattern.ts ==== */
(function(root2) {
  "use strict";
  var CONFIRM_PREFIX_PATTERN = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
  var CONFIRM_LABEL_PATTERN = /confirm|retype|re.type|re.enter|verify/i;
  function isConfirmField(id, label) {
    var idStr = String(id || "").toLowerCase();
    if (!idStr) return false;
    if (CONFIRM_PREFIX_PATTERN.test(idStr)) return true;
    if (label && CONFIRM_LABEL_PATTERN.test(String(label))) return true;
    return false;
  }
  function getBaseId(id) {
    return String(id || "").replace(/^c(?=[a-z])/, "").replace(/^confirm_?/i, "").replace(/^retype_?/i, "").replace(/^re_?type_?/i, "").replace(/^re_?enter_?/i, "").replace(/^verify_?/i, "");
  }
  root2.CcConfirmFieldPattern = {
    isConfirmField,
    getBaseId,
    CONFIRM_PREFIX_PATTERN,
    CONFIRM_LABEL_PATTERN
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcConfirmFieldPattern;

/* ==== ng-option-scorer.ts ==== */
(function(root2) {
  "use strict";
  function scoreOption(optText, planned) {
    var ot = String(optText || "").toLowerCase().trim();
    var v = String(planned || "").toLowerCase().trim();
    if (!ot || !v) return 0;
    if (ot === v) return 100;
    if (ot.includes(v)) return 80;
    if (v.includes(ot) && ot.length > 3) return 70;
    var vToks = v.split(/[\s()+,/\-]+/).filter(function(t) {
      return t.length > 2;
    });
    var oToks = ot.split(/[\s()+,/\-]+/).filter(function(t) {
      return t.length > 2;
    });
    var overlap = vToks.filter(function(t) {
      return oToks.some(function(o) {
        return o.includes(t) || t.includes(o);
      });
    }).length;
    if (overlap >= 2) return 60;
    if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
    var EDU_SYNONYMS = [
      ["intermediate", "higher secondary", "10+2", "12th", "hsc", "senior secondary"],
      ["matriculation", "10th", "sslc", "secondary", "high school", "class 10", "class x"],
      ["graduation", "graduate", "degree", "bachelor", "ug"],
      ["post graduation", "post graduate", "masters", "master", "pg", "m.a", "m.sc", "m.com"]
    ];
    for (var i = 0; i < EDU_SYNONYMS.length; i++) {
      var group = EDU_SYNONYMS[i];
      var vIn = group.some(function(s) {
        return v.includes(s);
      });
      var oIn = group.some(function(s) {
        return ot.includes(s);
      });
      if (vIn && oIn) return 55;
    }
    return 0;
  }
  function scoreAndPick(opts, planned, minScore) {
    minScore = typeof minScore === "number" ? minScore : 50;
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
  root2.CcNgOptionScorer = {
    scoreOption,
    scoreAndPick
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcNgOptionScorer;

/* ==== ng-session-manager.ts ==== */
(function(root2) {
  "use strict";
  function cancelSession(label, sessions) {
    if (!sessions || !sessions.has(label)) return;
    var old = sessions.get(label);
    old.cancelled = true;
    try {
      clearInterval(old.pollTimer);
    } catch (e) {
    }
    (old.timeoutIds || []).forEach(function(id) {
      try {
        clearTimeout(id);
      } catch (e) {
      }
    });
    if (old.observer) {
      try {
        old.observer.disconnect();
      } catch (e) {
      }
      old.observer = null;
    }
    sessions.delete(label);
  }
  function createSession(label, sessions) {
    var session = {
      id: Math.random().toString(36).slice(2, 8),
      fieldKey: label,
      resolved: false,
      cancelled: false,
      pollTimer: null,
      timeoutIds: [],
      observer: null,
      startedAt: Date.now()
    };
    sessions.set(label, session);
    return session;
  }
  function cleanupSession(session, sessions, label) {
    try {
      clearInterval(session.pollTimer);
    } catch (e) {
    }
    (session.timeoutIds || []).forEach(function(id) {
      try {
        clearTimeout(id);
      } catch (e) {
      }
    });
    if (session.observer) {
      try {
        session.observer.disconnect();
      } catch (e) {
      }
      session.observer = null;
    }
    if (sessions && label !== void 0) sessions.delete(label);
  }
  root2.CcNgSessionManager = {
    cancelSession,
    createSession,
    cleanupSession
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcNgSessionManager;

/* ==== build-fill-record.ts ==== */
(function(root2) {
  "use strict";
  function buildFillRecord(base, opts) {
    opts = opts || {};
    var rv = opts.rv !== void 0 ? opts.rv : "";
    var fillMode = opts.fillMode !== void 0 ? opts.fillMode : "sequential";
    var now = typeof opts.now === "function" ? opts.now : Date.now;
    return Object.assign(
      { ts: now(), rv, fillMode },
      base
    );
  }
  root2.CcBuildFillRecord = {
    buildFillRecord
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcBuildFillRecord;

/* ==== fill-debug-emitter.ts ==== */
(function(root2) {
  "use strict";
  function createEmitter(opts) {
    opts = opts || {};
    var getRunId = opts.getRunId || function() {
      return "";
    };
    var getRv = opts.getRv || function() {
      return "";
    };
    var getHostname = opts.getHostname || function() {
      return typeof location !== "undefined" ? location.hostname : "";
    };
    var send = opts.send || function() {
    };
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
      _timer = setTimeout(function() {
        _timer = null;
        _flush();
      }, 40);
    }
    function emit(event, payload) {
      var evt = Object.assign(
        {
          event,
          fillRunId: getRunId(),
          hostname: getHostname(),
          ts: Date.now(),
          rv: getRv()
        },
        payload || {}
      );
      if (evt.type && evt.type !== "FILL_DEBUG") {
        evt.fieldType = evt.type;
        delete evt.type;
      }
      _queue.push(evt);
      var immediate = event === "fill.start" || event === "fill.end" || _queue.length >= 6;
      if (immediate) {
        if (_timer) {
          clearTimeout(_timer);
          _timer = null;
        }
        _flush();
      } else {
        _schedule();
      }
    }
    function flush() {
      if (_timer) {
        clearTimeout(_timer);
        _timer = null;
      }
      _flush();
    }
    return {
      emit,
      flush,
      get queue() {
        return _queue;
      }
    };
  }
  root2.CcFillDebugEmitter = {
    createEmitter
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillDebugEmitter;

/* ==== wait-for-options.ts ==== */
(function(root2) {
  "use strict";
  function waitForOptions(selector, minCount, timeout, qs, observeTarget) {
    minCount = minCount || 1;
    timeout = timeout || 8e3;
    qs = qs || (typeof document !== "undefined" ? document.querySelector.bind(document) : function() {
      return null;
    });
    observeTarget = observeTarget || (typeof document !== "undefined" ? document.body : null);
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
      function isRealOption(o) {
        return o.value && o.value !== "0" && o.value !== "" && o.value !== "-1";
      }
      function check() {
        if (resolved) return;
        var el = qs(selector);
        var real = Array.from(el ? el.options || [] : []).filter(isRealOption);
        if (real.length >= minCount) {
          cleanup(el);
          return;
        }
        if (Date.now() > deadline) {
          cleanup(null);
          return;
        }
      }
      if (observeTarget) {
        mo = new MutationObserver(check);
        mo.observe(observeTarget, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["disabled", "class"]
        });
      }
      check();
      poll = setInterval(function() {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
  }
  root2.CcWaitForOptions = {
    waitForOptions
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcWaitForOptions;

/* ==== settle-after-act.ts ==== */
(function(root2) {
  "use strict";
  function createSettleEngine(opts) {
    opts = opts || {};
    var waitForNetworkIdle = opts.waitForNetworkIdle || function(q, m) {
      return Promise.resolve({ idle: true, waitedMs: 0 });
    };
    var waitForOptions = opts.waitForOptions || function() {
      return Promise.resolve(null);
    };
    var getBudget = opts.getBudget || function() {
      return 0;
    };
    var setBudget = opts.setBudget || function() {
    };
    async function settleAfterAct(kind, actOpts) {
      actOpts = actOpts || {};
      var budget = typeof actOpts.budgetMs === "number" ? actOpts.budgetMs : getBudget();
      if (kind === "text") {
        await new Promise(function(r) {
          setTimeout(r, 100);
        });
        return { idle: true, waitedMs: 100, kind: "text" };
      }
      var kick = kind === "button" ? 300 : 200;
      await new Promise(function(r) {
        setTimeout(r, kick);
      });
      var maxNet = kind === "button" ? 5e3 : kind === "select" ? 4500 : 3500;
      maxNet = Math.min(maxNet, Math.max(300, budget > 0 ? budget : 400));
      var quiet = kind === "select" ? 150 : 120;
      var t0 = Date.now();
      var net = await waitForNetworkIdle(quiet, maxNet);
      var used = Date.now() - t0;
      setBudget(Math.max(0, getBudget() - used));
      return Object.assign({ kind }, net);
    }
    async function waitForSelectOptionsSequential(selector, maxMs) {
      maxMs = Math.min(maxMs || 6e3, Math.max(400, getBudget() || 400));
      var t0 = Date.now();
      await settleAfterAct("choice", { budgetMs: Math.min(2e3, maxMs) });
      var left = Math.max(300, maxMs - (Date.now() - t0));
      var el = await waitForOptions(selector, 1, left);
      setBudget(Math.max(0, getBudget() - (Date.now() - t0)));
      return el;
    }
    return {
      settleAfterAct,
      waitForSelectOptionsSequential
    };
  }
  root2.CcSettleAfterAct = {
    createSettleEngine
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcSettleAfterAct;

/* ==== resolve-cc-selector.ts ==== */
(function(root2) {
  "use strict";
  var FORM_FIELD_QUERY = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="date"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    "input:not([type])",
    "textarea",
    "select"
  ].join(",");
  function resolveCcSelector(selector, doc) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return null;
    if (selector.startsWith("form-field-")) {
      var idx = parseInt(selector.slice("form-field-".length), 10);
      var all = d.querySelectorAll(FORM_FIELD_QUERY);
      return all[idx] || null;
    }
    if (selector.startsWith("ng-dropdown-")) {
      var ngIdx = parseInt(selector.slice("ng-dropdown-".length), 10);
      var dropdowns = d.querySelectorAll("div.ng-dropdown");
      return dropdowns[ngIdx] || null;
    }
    return d.querySelector(selector);
  }
  root2.CcResolveCcSelector = {
    resolveCcSelector,
    /** Exposed for consumers that need to build compatible form-field selectors. */
    FORM_FIELD_QUERY
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcResolveCcSelector;

/* ==== sort-fields-by-dom-order.ts ==== */
(function(root2) {
  "use strict";
  function sortFieldsByDomOrder(entries, resolveEl) {
    if (!Array.isArray(entries) || entries.length < 2) return entries;
    var FOLLOWING = typeof Node !== "undefined" && Node.DOCUMENT_POSITION_FOLLOWING || 4;
    entries.sort(function(pairA, pairB) {
      var a = resolveEl(pairA[0]);
      var b = resolveEl(pairB[0]);
      if (!a || !b) return 0;
      if (a === b) return 0;
      if (typeof a.compareDocumentPosition !== "function") return 0;
      return a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1;
    });
    return entries;
  }
  root2.CcSortFieldsByDomOrder = {
    sortFieldsByDomOrder
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcSortFieldsByDomOrder;

/* ==== verify-fill-value.ts ==== */
(function(root2) {
  "use strict";
  async function verifyFillValue(selector, expected, resolveEl, settleMs) {
    settleMs = typeof settleMs === "number" ? settleMs : 150;
    if (settleMs > 0) await new Promise(function(r) {
      setTimeout(r, settleMs);
    });
    var liveEl;
    if (selector && selector.startsWith && selector.startsWith("ng-dropdown-")) {
      liveEl = null;
    } else {
      liveEl = resolveEl(selector);
    }
    if (!liveEl) {
      return { ok: false, actualValue: "", normExpected: "", normActual: "", reason: "no-element-on-verify" };
    }
    var tag = (liveEl.tagName || "").toLowerCase();
    if (liveEl.type === "checkbox") {
      return {
        ok: !!liveEl.checked,
        actualValue: liveEl.checked ? "true" : "false",
        normExpected: String(expected || ""),
        normActual: liveEl.checked ? "true" : "false"
      };
    }
    if (liveEl.type === "radio") {
      var groupName = liveEl.name;
      var selected = liveEl.checked ? liveEl : null;
      if (groupName) {
        var checked = document.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
        if (checked) selected = checked;
      }
      if (!selected) {
        return { ok: false, actualValue: "", normExpected: String(expected || ""), normActual: "", reason: "radio-none-checked" };
      }
      var lbl = selected.id ? document.querySelector('label[for="' + selected.id + '"]') : null;
      var actualLabel = lbl && lbl.textContent.trim() || selected.value || "true";
      var normFn = function(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      };
      var normExp0 = normFn(expected);
      var normAct0 = normFn(actualLabel);
      var ok0 = !expected || normAct0.includes(normExp0.slice(0, 4)) || normExp0.includes(normAct0.slice(0, 4)) || selected.checked;
      return { ok: !!ok0, actualValue: actualLabel, normExpected: normExp0, normActual: normAct0 };
    }
    if (tag === "select") {
      var opt = liveEl.options[liveEl.selectedIndex];
      var actualVal = (opt ? opt.text || opt.value : "") || "";
      var normExpS = String(expected || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      var normActS = actualVal.toLowerCase().replace(/[^a-z0-9]/g, "");
      var okS = normExpS.length > 0 && (normActS === normExpS || normActS.includes(normExpS) || normExpS.includes(normActS));
      return { ok: okS, actualValue: actualVal, normExpected: normExpS, normActual: normActS };
    }
    var actual = liveEl.value || "";
    var expStr = String(expected || "");
    if (!expStr) {
      return { ok: false, actualValue: actual, normExpected: "", normActual: actual, reason: "empty-expected" };
    }
    var normExp = expStr.toLowerCase().replace(/[^a-z0-9]/g, "");
    var normAct = actual.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normExp === normAct) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct };
    }
    if (normAct.length > 0 && (normAct.startsWith(normExp.slice(0, Math.max(8, normExp.length - 2))) || normExp.startsWith(normAct.slice(0, 8)))) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, partial: true };
    }
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
      reason: actual === "" ? "value-rejected-empty" : "value-mismatch"
    };
  }
  root2.CcVerifyFillValue = {
    verifyFillValue
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcVerifyFillValue;

/* ==== detect-fill-strategy.ts ==== */
(function(root2) {
  "use strict";
  var STRATEGY_REGISTRY = {
    "ng-dropdown-click": {
      name: "ng-dropdown-click",
      description: "Angular custom ng-dropdown: click trigger, wait for li options, click match",
      applies: function(el, type) {
        return type === "ng-dropdown" || el && el.classList && el.classList.contains("ng-dropdown");
      },
      verify: {
        method: "visual_text",
        check: function(el, expected) {
          var displayed = el.querySelector(".select-type,.value-area,.ng-value-label");
          return displayed ? displayed.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0, 6)) : false;
        },
        timeout: 1e3
      }
    },
    "mat-select-click": {
      name: "mat-select-click",
      description: "Angular Material mat-select: click trigger, wait for panel, click option",
      applies: function(el, type) {
        return type === "mat-select" || el && el.tagName === "MAT-SELECT";
      },
      verify: {
        method: "visual_text",
        check: function(el, expected) {
          var v = el.querySelector(".mat-select-value-text,.mat-mdc-select-value-text");
          return v ? v.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0, 4)) : false;
        },
        timeout: 500
      }
    },
    "native-select": {
      name: "native-select",
      description: "Native <select>: set value via nativeSetter, dispatch change",
      applies: function(el, type) {
        return type === "select" || el && el.tagName === "SELECT";
      },
      verify: {
        method: "dom_value",
        check: function(el, expected) {
          var norm = function(s) {
            return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
          };
          return norm(el.value) === norm(expected) || norm(el.options && el.options[el.selectedIndex] && el.options[el.selectedIndex].text || "").includes(norm(expected).slice(0, 6));
        },
        timeout: 300
      }
    },
    "dwr-cascade-select": {
      name: "dwr-cascade-select",
      description: "ServicePlus DWR cascade: waitForOptions then set value, re-apply after DWR reset",
      applies: function(el, type) {
        return type === "select" && el && el.getAttribute && el.getAttribute("data-datatype") === "custLGDHierarchy";
      },
      verify: {
        method: "dom_value",
        check: function(el, expected) {
          var norm = function(s) {
            return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
          };
          return norm(el.options && el.options[el.selectedIndex] && el.options[el.selectedIndex].text || "").includes(norm(expected).slice(0, 4));
        },
        timeout: 500
      }
    },
    "text-input": {
      name: "text-input",
      description: "Text/email/tel input: nativeInputValueSetter + input/change events",
      applies: function(el, type) {
        var EXCLUDED = [
          "select",
          "ng-dropdown",
          "mat-select",
          "mat-radio",
          "mat-checkbox",
          "radio",
          "checkbox",
          "radio-group",
          "radio-click",
          "checkbox-group",
          "checkbox-agreement"
        ];
        return EXCLUDED.indexOf(type) === -1;
      },
      verify: {
        method: "dom_value",
        check: function(el, expected) {
          return el.value === expected || el.value.includes(expected.slice(0, 8));
        },
        timeout: 200
      }
    },
    "radio-click": {
      name: "radio-click",
      description: "Click a specific radio option (resolved by planner)",
      applies: function(el, type) {
        return type === "radio-click" || type === "radio" || type === "radio-group" || el && el.type === "radio";
      },
      verify: {
        method: "dom_value",
        check: function(el) {
          return !!(el && (el.checked || el.querySelector && el.querySelector("input[type=radio]:checked")));
        },
        timeout: 200
      }
    }
  };
  function detectFillStrategy(el, type) {
    var keys = Object.keys(STRATEGY_REGISTRY);
    for (var i = 0; i < keys.length; i++) {
      try {
        if (STRATEGY_REGISTRY[keys[i]].applies(el, type)) return keys[i];
      } catch (e) {
      }
    }
    return type || "unknown";
  }
  root2.CcDetectFillStrategy = {
    detectFillStrategy,
    STRATEGY_REGISTRY
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcDetectFillStrategy;

/* ==== post-fill-corrections.ts ==== */
(function(root2) {
  "use strict";
  function readFieldValue(el) {
    if (!el) return "";
    if (el.tagName === "SELECT") {
      var opt = el.options && el.options[el.selectedIndex];
      return (opt ? opt.text || opt.value : "") || "";
    }
    if (el.classList && el.classList.contains("ng-dropdown")) {
      var vEl = el.querySelector(".value-area .value,.select-type,.ng-value-label");
      return vEl && vEl.textContent.trim() || "";
    }
    return el.value || "";
  }
  function installCorrectionsObserver(opts) {
    opts = opts || {};
    var entries = opts.entries || [];
    var filledBySource = opts.filledBySource || {};
    var allFields = opts.allFields || [];
    var getEl = opts.getEl || function(s) {
      return document.querySelector(s);
    };
    var records = opts.records || [];
    var settleDelayMs = typeof opts.settleDelayMs === "number" ? opts.settleDelayMs : 1e4;
    setTimeout(function() {
      var _ccBackendUrl = document.body.getAttribute("data-cc-backend") || "";
      var _ccFormKey = document.body.getAttribute("data-cc-formkey") || "";
      var snapshot = {}, fieldMeta = {};
      for (var i = 0; i < entries.length; i++) {
        var sel = entries[i][0], fd = entries[i][1];
        var el = getEl(sel);
        if (!el) continue;
        snapshot[sel] = readFieldValue(el);
        var rec = records.find(function(r) {
          return r.selector === sel;
        });
        fieldMeta[sel] = {
          label: filledBySource[sel] && filledBySource[sel].label || sel,
          semanticKey: filledBySource[sel] && filledBySource[sel].semanticKey || "",
          profileKey: filledBySource[sel] && filledBySource[sel].profileKey || "",
          plugin: rec && rec.plugin || null,
          strategy: rec && rec.strategy || "",
          originalResult: rec && rec.result || "unknown",
          autofilledValue: fd.value
        };
      }
      if (Array.isArray(allFields)) {
        for (var j = 0; j < allFields.length; j++) {
          var f = allFields[j];
          if (snapshot[f.selector] !== void 0) continue;
          var el2 = getEl(f.selector);
          if (!el2) continue;
          snapshot[f.selector] = readFieldValue(el2);
          fieldMeta[f.selector] = {
            label: f.label || f.selector,
            semanticKey: "",
            profileKey: "",
            plugin: null,
            strategy: "unmapped",
            originalResult: "unmapped",
            autofilledValue: ""
          };
        }
      }
      function captureCorrections(trigger) {
        var out = [];
        Object.keys(snapshot).forEach(function(s) {
          var el3 = getEl(s);
          if (!el3) return;
          var cur = readFieldValue(el3);
          if (cur !== snapshot[s] && cur !== "") {
            var m = fieldMeta[s] || {};
            out.push({
              selector: s,
              field: m.label,
              semanticKey: m.semanticKey,
              profileKey: m.profileKey,
              autofilledValue: m.autofilledValue,
              snapshotValue: snapshot[s],
              finalOperatorValue: cur,
              correctionType: !snapshot[s] || snapshot[s] === "" ? "completion" : "override",
              originalResult: m.originalResult,
              plugin: m.plugin,
              strategy: m.strategy,
              trigger,
              ts: Date.now()
            });
          }
        });
        return out;
      }
      function postCorrections(trigger) {
        var corrections = captureCorrections(trigger);
        if (!corrections.length) return;
        try {
          document.body.setAttribute("data-cc-corrections", JSON.stringify(corrections));
        } catch (e) {
        }
        if (_ccBackendUrl) {
          var tok = document.body.getAttribute("data-cc-token") || "";
          var pid = document.body.getAttribute("data-cc-profile-id") || "";
          var hdrs = { "Content-Type": "application/json" };
          if (tok) hdrs["Authorization"] = "Bearer " + tok;
          fetch(_ccBackendUrl + "/corrections", {
            method: "POST",
            headers: hdrs,
            body: JSON.stringify({
              hostname: location.hostname,
              semanticFormKey: _ccFormKey,
              profileId: pid,
              trigger,
              corrections
            })
          }).catch(function() {
          });
        }
      }
      document.addEventListener("click", function(e) {
        var btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
        if (!btn) return;
        var txt = (btn.textContent || btn.value || "").toLowerCase();
        if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === "submit") {
          postCorrections("submit");
        }
      }, true);
      window.addEventListener("beforeunload", function() {
        postCorrections("unload");
      });
    }, settleDelayMs);
  }
  root2.CcPostFillCorrections = { installCorrectionsObserver };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcPostFillCorrections;

/* ==== fill-one-ng.ts ==== */
(function(root2) {
  "use strict";
  function fillNg(el, selector, value, type, elType, ctx) {
    if (!(elType === "ng-dropdown" || type === "ng-dropdown")) return null;
    var portalAdapters = ctx.portalAdapters || {};
    var filledBySource = ctx.filledBySource || {};
    var _replayResults = ctx._replayResults || {};
    var _ccRecords = ctx._ccRecords || [];
    var RUNTIME_VERSION = ctx.RUNTIME_VERSION || "";
    var _flushRecords = ctx._flushRecords || function() {
    };
    var _nos = root2.CcNgOptionScorer || {};
    var _nsm = root2.CcNgSessionManager || {};
    var _bfr = root2.CcBuildFillRecord || {};
    var rootClass = el.className ? el.className.trim().split(/\s+/)[0] : "ng-dropdown";
    var adapter = portalAdapters[rootClass] || portalAdapters["ng-dropdown"];
    if (!adapter) {
      var _noAdapterLabel = filledBySource[selector] && filledBySource[selector].label || selector;
      _replayResults[_noAdapterLabel] = "no-adapter";
      try {
        sessionStorage.setItem("_cc_replay_results", JSON.stringify(_replayResults));
      } catch (e) {
      }
      return 0;
    }
    var _label = filledBySource[selector] && filledBySource[selector].label || selector;
    var trigger = el.querySelector(adapter.triggerSelector) || el;
    if (!window._ccReplaySessions) window._ccReplaySessions = /* @__PURE__ */ new Map();
    if (_nsm.cancelSession) _nsm.cancelSession(_label, window._ccReplaySessions);
    var session = _nsm.createSession ? _nsm.createSession(_label, window._ccReplaySessions) : {
      id: Math.random().toString(36).slice(2, 8),
      fieldKey: _label,
      resolved: false,
      cancelled: false,
      pollTimer: null,
      timeoutIds: [],
      observer: null,
      startedAt: Date.now()
    };
    if (!_nsm.createSession) window._ccReplaySessions.set(_label, session);
    function isVisible(node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible ? window.ccDomUtils.isVisible(node) : !!(node && node.offsetParent !== null);
    }
    function cleanupAndRecord(result) {
      if (session.resolved && result !== session._result) return;
      session.resolved = true;
      session._result = result;
      if (_nsm.cleanupSession) {
        _nsm.cleanupSession(session, window._ccReplaySessions, _label);
      } else {
        try {
          clearInterval(session.pollTimer);
        } catch (e) {
        }
        (session.timeoutIds || []).forEach(function(id) {
          try {
            clearTimeout(id);
          } catch (e) {
          }
        });
        if (session.observer) {
          session.observer.disconnect();
          session.observer = null;
        }
        window._ccReplaySessions.delete(_label);
      }
      _replayResults[_label] = result;
      try {
        sessionStorage.setItem("_cc_replay_results", JSON.stringify(_replayResults));
      } catch (e) {
      }
      var _isOk = result === "ok";
      var rec = _bfr.buildFillRecord ? _bfr.buildFillRecord(
        {
          selector,
          value,
          type: "ng-dropdown",
          result: _isOk ? "filled" : "skipped",
          failReason: _isOk ? null : result,
          strategy: "ng-dropdown-click",
          durationMs: Date.now() - session.startedAt
        },
        { rv: RUNTIME_VERSION }
      ) : {
        selector,
        value,
        type: "ng-dropdown",
        result: _isOk ? "filled" : "skipped",
        failReason: _isOk ? null : result,
        strategy: "ng-dropdown-click",
        durationMs: Date.now() - session.startedAt,
        ts: Date.now(),
        rv: RUNTIME_VERSION,
        fillMode: "sequential"
      };
      _ccRecords.push(rec);
      _flushRecords();
    }
    var OVERLAY_TAGS = [
      "app-dropdown",
      "ul",
      "ng-dropdown-panel",
      "cdk-overlay-container",
      ".dropdown-options",
      ".options-list",
      ".dropdown-menu",
      ".ng-dropdown-panel"
    ];
    var addedNodes = [];
    var _trace = {
      triggerLabel: _label,
      overlayFound: false,
      overlayTag: "",
      mutationCount: 0,
      optionCount: 0,
      matchedOption: "",
      clicked: false,
      verifyStatus: "",
      durationMs: 0
    };
    trigger.click();
    var mo = new MutationObserver(function(mutations) {
      if (session.cancelled || session.resolved) return;
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === 1) addedNodes.push(n);
        });
      });
    });
    session.observer = mo;
    mo.observe(document.body, { childList: true, subtree: true });
    var _lastMutation = Date.now();
    var _stabilizeMo = new MutationObserver(function() {
      _lastMutation = Date.now();
    });
    _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });
    function waitStable(cb) {
      var check = setInterval(function() {
        if (session.cancelled) {
          clearInterval(check);
          _stabilizeMo.disconnect();
          return;
        }
        if (Date.now() - _lastMutation >= 150) {
          clearInterval(check);
          _stabilizeMo.disconnect();
          cb();
        }
      }, 50);
      var capId = setTimeout(function() {
        clearInterval(check);
        _stabilizeMo.disconnect();
        if (!session.cancelled) cb();
      }, 1200);
      session.timeoutIds.push(capId);
    }
    waitStable(function() {
      if (session.cancelled || session.resolved) return;
      mo.disconnect();
      session.observer = null;
      _trace.mutationCount = addedNodes.length;
      var _optQ = adapter.optionSelector || "li,.ng-option,mat-option,.dropdown-item";
      var activeOverlayRoot = null;
      var trigRect = trigger.getBoundingClientRect();
      for (var i = 0; i < addedNodes.length; i++) {
        var node = addedNodes[i];
        if (!isVisible(node)) continue;
        var lis = Array.from(node.querySelectorAll(_optQ)).filter(function(o) {
          return isVisible(o);
        });
        if (lis.length > 0) {
          activeOverlayRoot = node;
          break;
        }
      }
      if (!activeOverlayRoot) {
        var bestDist = Infinity;
        OVERLAY_TAGS.forEach(function(sel) {
          try {
            document.querySelectorAll(sel).forEach(function(node2) {
              var lis2 = Array.from(node2.querySelectorAll(_optQ)).filter(function(o) {
                return isVisible(o);
              });
              if (lis2.length === 0) return;
              var r = node2.getBoundingClientRect();
              var dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
              if (dist < bestDist) {
                bestDist = dist;
                activeOverlayRoot = node2;
              }
            });
          } catch (e) {
          }
        });
      }
      if (!activeOverlayRoot && adapter.optionsContainer) {
        activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
      }
      _trace.overlayFound = !!activeOverlayRoot;
      _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + "." + activeOverlayRoot.className.slice(0, 40) : "NONE";
      var attempts = 0;
      session.pollTimer = setInterval(function() {
        if (session.cancelled || session.resolved) {
          clearInterval(session.pollTimer);
          return;
        }
        attempts++;
        var searchRoot = activeOverlayRoot || document.body;
        var opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(function(o) {
          return isVisible(o);
        });
        if (opts.length === 0 && searchRoot !== document) {
          opts = Array.from(document.querySelectorAll(_optQ)).filter(function(o) {
            return isVisible(o) && !el.contains(o) && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]');
          });
        }
        var v = value.toLowerCase().trim();
        _trace.optionCount = opts.length;
        var scoreOption = _nos.scoreOption || function(ot) {
          ot = String(ot || "").toLowerCase().trim();
          if (ot === v) return 100;
          if (ot.includes(v)) return 80;
          if (v.includes(ot) && ot.length > 3) return 70;
          return 0;
        };
        var bestOpt = null, bestScore = 0;
        opts.forEach(function(o) {
          var score = scoreOption(o.textContent.trim(), v);
          if (score > bestScore) {
            bestScore = score;
            bestOpt = o;
          }
        });
        var opt = bestScore >= 50 ? bestOpt : null;
        if (opt) {
          clearInterval(session.pollTimer);
          if (session.cancelled || session.resolved) return;
          _trace.matchedOption = opt.textContent.trim();
          _trace.clicked = true;
          ["pointerdown", "mousedown", "mouseup", "click"].forEach(function(ev) {
            opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
          });
          var verifyStart = Date.now();
          var triggerInitialText = trigger.textContent.trim();
          var verifyPoll = setInterval(function() {
            if (session.cancelled || session.resolved) {
              clearInterval(verifyPoll);
              return;
            }
            var verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
            var displayed = verifyEl ? verifyEl.textContent.trim() : "";
            var overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
            var triggerChanged = trigger.textContent.trim() !== triggerInitialText;
            var ariaSelected = opt.getAttribute("aria-selected") === "true";
            var ok = displayed && !/^(select|choose|--)$/i.test(displayed) || overlayGone || triggerChanged || ariaSelected;
            if (ok || Date.now() - verifyStart >= 3e3) {
              clearInterval(verifyPoll);
              if (session.resolved) return;
              _trace.verifyStatus = ok ? "ok" : "verify-fail";
              _trace.durationMs = Date.now() - session.startedAt;
              cleanupAndRecord(_trace.verifyStatus);
            }
          }, 200);
        } else if (attempts >= 10) {
          clearInterval(session.pollTimer);
          if (session.resolved) return;
          document.body.click();
          _trace.durationMs = Date.now() - session.startedAt;
          cleanupAndRecord("no-option");
        }
      }, 300);
    });
    return 1;
  }
  root2.CcFillOneNg = {
    fillNg
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneNg;

/* ==== fill-one-select.ts ==== */
(function(root2) {
  "use strict";
  function fillSelect(el, selector, value, mapping) {
    if ((el.tagName || "").toLowerCase() !== "select") return null;
    var norm = function(s) {
      return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    };
    var v = norm(value);
    var extraValues = [];
    var mapEntry = mapping && mapping[selector];
    if (mapEntry && mapEntry.monthNum) {
      extraValues.push(mapEntry.monthNum.toString());
      if (mapEntry.monthShort) extraValues.push(mapEntry.monthShort.toLowerCase());
    }
    function findOpt(options) {
      return window.ccMatchOption ? window.ccMatchOption(value, options, { extraValues }) : null;
    }
    function applySelect(el2, opt2) {
      el2.focus();
      el2.dispatchEvent(new Event("focus", { bubbles: true }));
      Array.from(el2.options).forEach(function(o) {
        o.selected = false;
      });
      opt2.selected = true;
      el2.selectedIndex = opt2.index;
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
      if (nativeSetter) nativeSetter.set.call(el2, opt2.value);
      else el2.value = opt2.value;
      ["mousedown", "mouseup", "click", "input", "change"].forEach(function(ev) {
        el2.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      if (typeof el2.onchange === "function") {
        try {
          el2.onchange.call(el2, new Event("change"));
        } catch (e) {
        }
      }
      if (typeof $ !== "undefined") {
        try {
          $(el2).trigger("change");
        } catch (e) {
        }
      }
      try {
        el2.dispatchEvent(new Event("propertychange", { bubbles: true }));
      } catch (e) {
      }
      el2.dispatchEvent(new Event("blur", { bubbles: true }));
      var _rv = opt2.value, _ri = opt2.index;
      setTimeout(function() {
        if (el2.value !== _rv || el2.selectedIndex !== _ri) {
          opt2.selected = true;
          el2.selectedIndex = _ri;
          if (nativeSetter) nativeSetter.set.call(el2, _rv);
          else el2.value = _rv;
          el2.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 300);
      setTimeout(function() {
        el2.dispatchEvent(new Event("change", { bubbles: true }));
      }, 700);
      setTimeout(function() {
        if (el2.value !== _rv) {
          el2.selectedIndex = _ri;
          el2.value = _rv;
          el2.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 3500);
      return 1;
    }
    var allOptions = Array.from(el.options);
    var opt = findOpt(allOptions);
    if (opt) return applySelect(el, opt);
    var attempts = 0;
    var interval = setInterval(function() {
      var allOpts = Array.from(el.options);
      var realOpts = allOpts.filter(function(o) {
        if (!o.value || o.value === "0" || o.value === "-1" || o.value === "") return false;
        var txt = o.text.toLowerCase();
        return !txt.includes("select") && !txt.includes("choose") && !txt.includes("loading") && txt !== "--";
      });
      if (realOpts.length === 0 && attempts < 10) {
        attempts++;
        return;
      }
      var opt2 = findOpt(allOpts);
      if (opt2) {
        clearInterval(interval);
        applySelect(el, opt2);
        return;
      }
      if (++attempts >= 15) {
        clearInterval(interval);
        var llmKey = window._cc_llm_key || (document.body.getAttribute("data-cc-llm-key") || "");
        if (llmKey && realOpts.length > 0) {
          var optTexts = realOpts.map(function(o) {
            return o.text.trim();
          }).join("\n");
          window.ccLLM && window.ccLLM.call({
            apiKey: llmKey,
            baseUrl: document.body.getAttribute("data-cc-llm-url") || void 0,
            model: document.body.getAttribute("data-cc-llm-model") || void 0,
            userPrompt: 'From these dropdown options, which best matches "' + value + '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
            maxTokens: 50
          }).then(function(result) {
            var aiText = (result.text || "").trim();
            if (aiText) {
              var aiOpt = realOpts.find(function(o) {
                return o.text.trim() === aiText;
              }) || realOpts.find(function(o) {
                return o.text.trim().toLowerCase().includes(aiText.toLowerCase());
              });
              if (aiOpt) applySelect(el, aiOpt);
            }
          }).catch(function() {
          });
        }
      }
    }, 200);
    return 1;
  }
  root2.CcFillOneSelect = {
    fillSelect
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneSelect;

/* ==== fill-one-date.ts ==== */
(function(root2) {
  "use strict";
  function fillDate(el, selector, value) {
    var _pdv = root2.CcParseDateValue || {};
    var parseDateValue = _pdv.parseDateValue || function(v) {
      return { dateObj: new Date(v) };
    };
    if (el._flatpickr || el.classList.contains("flatpickr-input")) {
      var fp = el._flatpickr;
      var parsed = parseDateValue(value);
      var dateObj = parsed.dateObj;
      if (fp && !isNaN(dateObj)) {
        fp.setDate(dateObj, true);
      } else {
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        el.focus();
        if (niv) niv.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.blur();
      }
      return el.value ? 1 : 0;
    }
    if (el.classList.contains("hasDatepicker") || typeof $ !== "undefined" && typeof $.fn !== "undefined" && typeof $.fn.datepicker !== "undefined" && $(el).data("datepicker")) {
      var parsed2 = parseDateValue(value);
      var dateObj2 = parsed2.dateObj;
      if (!isNaN(dateObj2)) {
        $(el).datepicker("setDate", dateObj2);
      } else {
        var niv2 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        el.focus();
        if (niv2) niv2.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return el.value ? 1 : 0;
    }
    if (el.getAttribute("matdatepicker") !== null || el.getAttribute("matInput") !== null && el.closest("mat-datepicker-toggle,mat-form-field") && (el.type === "text" || el.type === "date")) {
      var niv3 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      el.focus();
      if (niv3) niv3.set.call(el, value);
      else el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new CustomEvent("dateChange", { bubbles: true, detail: { value } }));
      el.dispatchEvent(new CustomEvent("dateInput", { bubbles: true, detail: { value } }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) || "Enter" }));
      el.blur();
      return 1;
    }
    if (el.type === "date" || el.type === "datetime-local" || el.type === "month" || el.type === "week") {
      var parsed3 = parseDateValue(value);
      var isoValue;
      if (el.type === "datetime-local" && String(value || "").includes("T")) {
        isoValue = String(value);
      } else if (parsed3 && parsed3.isoDate) {
        isoValue = el.type === "month" ? parsed3.isoMonth : parsed3.isoDate;
      } else {
        isoValue = value;
      }
      if (el.type === "datetime-local" && !isoValue.includes("T")) {
        isoValue += "T00:00";
      }
      var niv4 = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      el.focus();
      if (niv4) niv4.set.call(el, isoValue);
      else el.value = isoValue;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.blur();
      return el.value ? 1 : 0;
    }
    return null;
  }
  root2.CcFillOneDate = {
    fillDate
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneDate;

/* ==== fill-one-radio.ts ==== */
(function(root2) {
  "use strict";
  var NORM = function(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  };
  function fillRadio(el, selector, value, type, elType, filledBySource) {
    if (type === "radio-click") {
      var target = el.type === "radio" ? el : el.querySelector && el.querySelector('input[type="radio"]') || el;
      target.focus();
      target.checked = true;
      ["click", "change"].forEach(function(ev) {
        target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
      });
      return 1;
    }
    if (type === "radio-group" && elType === "radio" && el.name) {
      var vR0 = NORM(value);
      var radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var match = Array.from(radios).find(function(r) {
        if (NORM(r.value) === vR0) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : "";
        if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
        var wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
        var wantMale = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
        if (wantFemale && /female|महिला|स्त्री/.test(lbl && lbl.textContent || r.value)) return true;
        if (wantMale && /male|पुरुष/.test(lbl && lbl.textContent || r.value) && !/female/.test(lbl && lbl.textContent || "")) return true;
        return false;
      });
      if (match) {
        match.focus();
        match.checked = true;
        ["click", "change"].forEach(function(ev) {
          match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        return 1;
      }
      return 0;
    }
    if (elType === "radio") {
      var vR = NORM(value);
      var radiosDOM = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
      var matchDOM = Array.from(radiosDOM).find(function(r) {
        if (NORM(r.value) === vR) return true;
        var lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
        var lblText = lbl ? NORM(lbl.textContent) : "";
        return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
      });
      if (matchDOM) {
        matchDOM.focus();
        matchDOM.checked = true;
        ["click", "change"].forEach(function(ev) {
          matchDOM.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
        });
        matchDOM.dispatchEvent(new Event("blur", { bubbles: true }));
        return 1;
      }
      return null;
    }
    if (elType === "checkbox") {
      var booleanLike = ["yes", "true", "1", "checked", "on", "no", "false", "0", "off", "unchecked"];
      if (!booleanLike.includes(value.toLowerCase())) return 0;
      var truthy = ["yes", "true", "1", "checked", "on"].includes(value.toLowerCase());
      if (truthy !== el.checked) {
        el.checked = truthy;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return 1;
      }
      return 1;
    }
    if (el.type === "file") {
      if (!value) return 0;
      if (value.startsWith("data:")) {
        try {
          var parts = value.split(",");
          var meta = parts[0];
          var b64 = parts[1];
          var mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
          var ext = mime.split("/")[1] || "bin";
          var fBys = filledBySource || {};
          var label = fBys[selector] && fBys[selector].label || "file";
          var fileName = label.replace(/[^a-z0-9]/gi, "_") + "." + ext;
          var binary = atob(b64);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          var file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
          var dt = new DataTransfer();
          dt.items.add(file);
          el.files = dt.files;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return 1;
        } catch (e) {
          return 0;
        }
      }
      if (value.startsWith("http://") || value.startsWith("https://")) return 0;
      return 0;
    }
    return null;
  }
  root2.CcFillOneRadio = {
    fillRadio
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneRadio;

/* ==== fill-one-mat.ts ==== */
(function(root2) {
  "use strict";
  function fillMat(el, value, elType) {
    if (elType !== "mat-select" && elType !== "mat-checkbox" && elType !== "mat-radio") {
      return null;
    }
    if (elType === "mat-select") {
      var trigger = el.querySelector(".mat-select-trigger,.mat-mdc-select-trigger") || el;
      trigger.click();
      setTimeout(function() {
        var v = value.toLowerCase().trim();
        var opts = Array.from(document.querySelectorAll("mat-option,.mat-option,.mat-mdc-option"));
        var opt = opts.find(function(o) {
          return o.textContent.trim().toLowerCase() === v;
        }) || opts.find(function(o) {
          return o.textContent.trim().toLowerCase().startsWith(v);
        }) || opts.find(function(o) {
          return v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2;
        }) || opts.find(function(o) {
          return o.textContent.trim().toLowerCase().includes(v);
        });
        if (opt) opt.click();
        else document.body.click();
      }, 400);
      return 1;
    }
    if (elType === "mat-checkbox") {
      var shouldCheck = /yes|true|1|on|checked/i.test(value);
      var input = el.querySelector('input[type="checkbox"]');
      var isChecked = input ? input.checked : el.classList.contains("mat-checkbox-checked");
      if (shouldCheck !== isChecked) {
        (input || el).click();
      }
      return 1;
    }
    if (elType === "mat-radio") {
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
  root2.CcFillOneMat = {
    fillMat
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneMat;

/* ==== fill-one-text.ts ==== */
(function(root2) {
  "use strict";
  function fillText(el, value) {
    var isTextarea = el.tagName === "TEXTAREA";
    var niv = isTextarea ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (typeof window.keystrokeFillSync === "function") {
      var ok = window.keystrokeFillSync(el, value);
      if (el.getAttribute && el.getAttribute("data-type") === "fullName") {
        var allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
        var idx = allInputs.indexOf(el);
        var next = allInputs[idx + 1];
        if (next && next.getAttribute("data-type") === "text") {
          setTimeout(function() {
            if (next.value && next.value.length > 0) return;
            var fillHindi = function(hindiVal) {
              if (typeof window.keystrokeFillSync === "function") window.keystrokeFillSync(next, hindiVal);
            };
            fetch("https://inputtools.google.com/request?text=" + encodeURIComponent(value) + "&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8").then(function(r) {
              return r.json();
            }).then(function(d) {
              var hindi = d && d[1] && d[1][0] && d[1][0][1] && d[1][0][1][0];
              fillHindi(hindi || value);
            }).catch(function() {
              fillHindi(value);
            });
          }, 500);
        }
      }
      return ok ? 1 : 0;
    }
    el.focus();
    if (niv) niv.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) }));
    return 1;
  }
  root2.CcFillOneText = {
    fillText
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFillOneText;

/* ==== install-kernel-bind.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
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
      getEl: function() {
        return k.getEl.apply(k, arguments);
      },
      _emitFillDebug: function() {
        return k.emitFillDebug.apply(k, arguments);
      },
      _flushRecords: function() {
        return k.flushRecords();
      },
      _pushSelectRecord: function() {
        return k.pushSelectRecord.apply(k, arguments);
      },
      settleAfterAct: function() {
        if (typeof k.settleAfterAct !== "function") {
          return Promise.resolve({ idle: true, waitedMs: 0, kind: "text" });
        }
        return k.settleAfterAct.apply(k, arguments);
      },
      waitForSelectOptionsSequential: function() {
        if (typeof k.waitForSelectOptionsSequential !== "function") {
          return Promise.resolve(null);
        }
        return k.waitForSelectOptionsSequential.apply(k, arguments);
      },
      waitForOptions: function() {
        if (typeof k.waitForOptions !== "function") return Promise.resolve(null);
        return k.waitForOptions.apply(k, arguments);
      },
      waitForDOMQuiet: function(ms) {
        if (typeof k.waitForDOMQuiet === "function") {
          return k.waitForDOMQuiet.apply(k, arguments);
        }
        return new Promise(function(r) {
          setTimeout(r, ms || 300);
        });
      },
      waitForNetworkIdle: function(q, m) {
        if (typeof k.waitForNetworkIdle === "function") {
          return k.waitForNetworkIdle.apply(k, arguments);
        }
        if (typeof window !== "undefined" && window.ccWaitForNetworkIdle) {
          return window.ccWaitForNetworkIdle(q || 200, m || 8e3);
        }
        return Promise.resolve({ idle: true, waitedMs: 0 });
      },
      detectStrategy: function() {
        if (typeof k.detectStrategy !== "function") return "unknown";
        return k.detectStrategy.apply(k, arguments);
      },
      verifyValue: function() {
        if (typeof k.verifyValue !== "function") {
          return Promise.resolve({ ok: false, actualValue: "", reason: "no-verify" });
        }
        return k.verifyValue.apply(k, arguments);
      },
      _isPlaceholderOption: function() {
        return typeof k.isPlaceholderOption === "function" ? k.isPlaceholderOption.apply(k, arguments) : false;
      },
      _realOptions: function() {
        return typeof k.realOptions === "function" ? k.realOptions.apply(k, arguments) : [];
      },
      _sampleOptions: function() {
        return typeof k.sampleOptions === "function" ? k.sampleOptions.apply(k, arguments) : [];
      },
      _readSelectActual: function() {
        return typeof k.readSelectActual === "function" ? k.readSelectActual.apply(k, arguments) : { actualValue: null, actualOptionValue: null };
      },
      _selectLoadMode: function() {
        return typeof k.selectLoadMode === "function" ? k.selectLoadMode.apply(k, arguments) : "unknown";
      },
      _cascadeSemanticKey: function() {
        return typeof k.cascadeSemanticKey === "function" ? k.cascadeSemanticKey.apply(k, arguments) : "";
      },
      _CASCADE_PARENTS: k.CASCADE_PARENTS,
      _cascadeSettled: k.cascadeSettled,
      _isPlaceholderPlanned: function() {
        return typeof k.isPlaceholderPlanned === "function" ? k.isPlaceholderPlanned.apply(k, arguments) : false;
      },
      _selectIsActive: function() {
        return typeof k.selectIsActive === "function" ? k.selectIsActive.apply(k, arguments) : true;
      },
      fillOne: function() {
        if (typeof k.fillOne !== "function") return 0;
        return k.fillOne.apply(k, arguments);
      },
      k
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-debug.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDebug = function(k) {
    k._debugPort = null;
    k._debugQueue = [];
    k._debugFlushTimer = null;
    var _fde = root.CcFillDebugEmitter || {};
    function ensureDebugPort() {
      if (k._debugPort) return k._debugPort;
      try {
        if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.connect) return null;
        k._debugPort = chrome.runtime.connect({ name: "cc_fill_debug" });
        k._debugPort.onDisconnect.addListener(function() {
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
          port.postMessage({ type: "FILL_DEBUG_BATCH", events: batch });
          return;
        }
      } catch (e) {
        k._debugPort = null;
      }
      for (var i = 0; i < batch.length; i++) {
        try {
          chrome.runtime.sendMessage(Object.assign({ type: "FILL_DEBUG" }, batch[i]), function() {
            void chrome.runtime.lastError;
          });
        } catch (e2) {
        }
      }
    }
    var _emitter;
    if (_fde.createEmitter) {
      _emitter = _fde.createEmitter({
        getRunId: function() {
          return k.fillRunId || "";
        },
        getRv: function() {
          return k.RUNTIME_VERSION || "";
        },
        send: chromeSend
      });
    }
    function emitFillDebug(event, payload) {
      if (_emitter) {
        _emitter.emit(event, payload);
        return;
      }
      console.warn("[CC] fill-debug-emitter not loaded, event dropped:", event);
    }
    function flushDebugQueue() {
      if (_emitter) _emitter.flush();
    }
    k.emitFillDebug = emitFillDebug;
    k.flushDebugQueue = flushDebugQueue;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-select-helpers.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSelectHelpers = function(k) {
    var _sos = root.CcSelectOptionState || {};
    var isPlaceholderOption = _sos.isPlaceholderOption || function() {
      return true;
    };
    var realOptions = _sos.realOptions || function() {
      return [];
    };
    var sampleOptions = _sos.sampleOptions || function() {
      return [];
    };
    var readSelectActual = _sos.readSelectActual || function() {
      return { actualValue: null, actualOptionValue: null };
    };
    var selectLoadMode = _sos.selectLoadMode || function() {
      return "unknown";
    };
    var selectIsActive = _sos.selectIsActive || function() {
      return false;
    };
    var isPlaceholderPlanned = _sos.isPlaceholderPlanned || function() {
      return true;
    };
    var _bfr = root.CcBuildFillRecord || {};
    var _buildFillRecord = _bfr.buildFillRecord || function(base) {
      return Object.assign({ ts: Date.now(), rv: k.RUNTIME_VERSION, fillMode: "sequential" }, base);
    };
    var _cascadeGeo = root.CcCascadeFieldLevel;
    function cascadeSemanticKey(label, profileKey, selector) {
      return _cascadeGeo ? _cascadeGeo.cascadeFieldLevel(label, profileKey, selector) : "";
    }
    k.CASCADE_PARENTS = _cascadeGeo ? _cascadeGeo.CASCADE_PARENTS : {};
    function pushSelectRecord(base) {
      const rec = _buildFillRecord(base, { rv: k.RUNTIME_VERSION });
      k.records.push(rec);
      k.flushRecords();
      const result = String(rec.result || "");
      if (result === "filled" || result === "succeeded") {
        k.emitFillDebug("field.done", {
          selector: rec.selector,
          label: rec.label,
          type: rec.type,
          planned: rec.value,
          actual: rec.actualValue,
          strategy: rec.strategy
        });
      } else if (result === "skipped" || result === "failed" || result === "error" || result === "waiting_human") {
        k.emitFillDebug(result === "waiting_human" ? "field.wait" : "field.fail", {
          selector: rec.selector,
          label: rec.label,
          type: rec.type,
          planned: rec.value,
          actual: rec.actualValue,
          failReason: rec.failReason || rec.error || result,
          strategy: rec.strategy
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
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-settle.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSettle = function(k) {
    var _saa = root.CcSettleAfterAct;
    var _wfo = root.CcWaitForOptions;
    function waitForNetworkIdle(quietMs, maxMs) {
      if (typeof window !== "undefined" && typeof window.ccWaitForNetworkIdle === "function") {
        return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8e3);
      }
      return new Promise(function(r) {
        setTimeout(r, quietMs || 200, { idle: true, waitedMs: quietMs || 200 });
      });
    }
    function waitForOptions(selector, minCount, timeout) {
      return _wfo.waitForOptions(
        selector,
        minCount,
        timeout,
        document.querySelector.bind(document),
        document.body
      );
    }
    var _settleEngine = _saa.createSettleEngine({
      waitForNetworkIdle,
      waitForOptions,
      getBudget: function() {
        return k.ajaxWaitBudgetMs;
      },
      setBudget: function(n) {
        k.ajaxWaitBudgetMs = n;
      }
    });
    function waitForDOMQuiet(ms) {
      ms = ms || 300;
      return new Promise(function(resolve) {
        var last = Date.now();
        var mo = new MutationObserver(function() {
          last = Date.now();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        var check = setInterval(function() {
          if (Date.now() - last >= ms) {
            clearInterval(check);
            mo.disconnect();
            resolve();
          }
        }, 50);
        setTimeout(function() {
          clearInterval(check);
          mo.disconnect();
          resolve();
        }, 5e3);
      });
    }
    k.settleAfterAct = function(kind, opts) {
      return _settleEngine.settleAfterAct(kind, opts);
    };
    k.waitForSelectOptionsSequential = function(sel, maxMs) {
      return _settleEngine.waitForSelectOptionsSequential(sel, maxMs);
    };
    k.waitForOptions = waitForOptions;
    k.waitForDOMQuiet = waitForDOMQuiet;
    k.waitForNetworkIdle = waitForNetworkIdle;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-dom-order.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDomOrder = function(k) {
    var _resolve = root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector : function(sel) {
      return document.querySelector(sel);
    };
    function getEl(sel) {
      return _resolve(sel);
    }
    k.getEl = getEl;
    k.PRIORITY_KEYS = [
      "state",
      "rajya",
      "\u0930\u093E\u091C\u094D\u092F",
      "district",
      "jila",
      "\u091C\u093F\u0932\u093E",
      "sub_division",
      "subdivision",
      "sub-division",
      "\u0905\u0928\u0941\u092E\u0902\u0921\u0932",
      "block",
      "prakhand",
      "\u092A\u094D\u0930\u0916\u0902\u0921",
      "panchayat",
      "village_panchayat",
      "\u092A\u0902\u091A\u093E\u092F\u0924",
      "village",
      "gram",
      "\u0917\u094D\u0930\u093E\u092E",
      "mohalla",
      "\u092E\u094B\u0939\u0932\u094D\u0932\u093E",
      "tehsil",
      "taluka",
      "\u0924\u0939\u0938\u0940\u0932",
      "police_station",
      "police-station",
      "thana",
      "\u0925\u093E\u0928\u093E",
      "post_office",
      "post-office",
      "\u0921\u093E\u0915 \u0918\u0930",
      "pin_code",
      "pincode",
      "\u092A\u093F\u0928",
      "municipal",
      "\u0928\u0917\u0930"
    ];
    k.entries = Object.entries(k.mapping || {});
    var _sort = root.CcSortFieldsByDomOrder;
    if (_sort) {
      _sort.sortFieldsByDomOrder(k.entries, _resolve);
    } else {
      console.warn("[CC] CcSortFieldsByDomOrder not loaded \u2014 skipping DOM order sort");
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-strategy.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installStrategy = function(k) {
    const getEl = function() {
      return k.getEl.apply(k, arguments);
    };
    var _dfs = root.CcDetectFillStrategy || {};
    var STRATEGY_REGISTRY = _dfs.STRATEGY_REGISTRY || {};
    function detectStrategy(el, type) {
      if (_dfs.detectFillStrategy) return _dfs.detectFillStrategy(el, type);
      return type || "unknown";
    }
    var _vfv = root.CcVerifyFillValue || {};
    var _resolveEl = root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector : function(sel) {
      return document.querySelector(sel);
    };
    async function verifyValue(selector, expected, settleMs) {
      if (_vfv.verifyFillValue) return _vfv.verifyFillValue(selector, expected, _resolveEl, settleMs);
      return { ok: false, actualValue: "", normExpected: "", normActual: "", reason: "verifier-not-loaded" };
    }
    k.STRATEGY_REGISTRY = STRATEGY_REGISTRY;
    k.detectStrategy = detectStrategy;
    k.verifyValue = verifyValue;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-ng-helpers.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNgHelpers = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    var _nos = root.CcNgOptionScorer;
    var _nsm = root.CcNgSessionManager;
    k._ngIsVisible = function(node) {
      return window.ccDomUtils && window.ccDomUtils.isVisible ? window.ccDomUtils.isVisible(node) : !!(node && node.offsetParent !== null);
    };
    k._ngScoreOption = function(optText, planned) {
      return _nos.scoreOption(optText, planned);
    };
    k._ngCancelSession = function(_label) {
      _nsm.cancelSession(_label, window._ccReplaySessions || null);
    };
    k._ngPickOption = function(opts, planned) {
      var wrapped = Array.from(opts).map(function(n) {
        return { text: (n.textContent || n.innerText || "").trim(), node: n };
      });
      var result = _nos.scoreAndPick(wrapped, planned, 30);
      return result ? result.node : null;
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-ng.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneNg = function(k) {
    root.CcExecParts.installFillOneNgHelpers(k);
    const b = root.CcExecParts.bindKernelLocals(k);
    const portalAdapters = b.portalAdapters, filledBySource = b.filledBySource;
    const _replayResults = b._replayResults, _ccRecords = b._ccRecords;
    const RUNTIME_VERSION = b.RUNTIME_VERSION, _flushRecords = b._flushRecords;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fong = root.CcFillOneNg || {};
    k.fillOneHandlers.push({
      id: "ng-dropdown",
      try(el, selector, value, type, elType) {
        var _a, _b;
        if (_fong.fillNg) return _fong.fillNg(el, selector, value, type, elType, {
          portalAdapters,
          filledBySource,
          _replayResults,
          _ccRecords,
          RUNTIME_VERSION,
          _flushRecords
        });
        if (!(elType === "ng-dropdown" || type === "ng-dropdown")) return null;
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : "ng-dropdown";
        const adapter = portalAdapters[rootClass] || portalAdapters["ng-dropdown"];
        if (adapter) {
          let isVisible = function(node) {
            return window.ccDomUtils.isVisible(node);
          }, cleanupSession = function(result) {
            if (session.resolved && result !== session._result) return;
            session.resolved = true;
            session._result = result;
            clearInterval(session.pollTimer);
            session.timeoutIds.forEach((id) => clearTimeout(id));
            if (session.observer) {
              session.observer.disconnect();
              session.observer = null;
            }
            window._ccReplaySessions.delete(_label);
            _replayResults[_label] = result;
            sessionStorage.setItem("_cc_replay_results", JSON.stringify(_replayResults));
            const _isOk = result === "ok";
            _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b2) {
              return Object.assign({ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: "sequential" }, b2);
            })({ selector, value, type: "ng-dropdown", result: _isOk ? "filled" : "skipped", failReason: _isOk ? null : result, strategy: "ng-dropdown-click", durationMs: Date.now() - session.startedAt }, { rv: RUNTIME_VERSION }));
            _flushRecords();
          }, waitStable = function(cb) {
            const check = setInterval(() => {
              if (session.cancelled) {
                clearInterval(check);
                _stabilizeMo.disconnect();
                return;
              }
              if (Date.now() - _lastMutation >= 150) {
                clearInterval(check);
                _stabilizeMo.disconnect();
                cb();
              }
            }, 50);
            const capId = setTimeout(() => {
              clearInterval(check);
              _stabilizeMo.disconnect();
              if (!session.cancelled) cb();
            }, 1200);
            session.timeoutIds.push(capId);
          };
          const _label = ((_a = filledBySource[selector]) == null ? void 0 : _a.label) || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;
          if (!window._ccReplaySessions) window._ccReplaySessions = /* @__PURE__ */ new Map();
          k._ngCancelSession && k._ngCancelSession(_label);
          const session = { id: Math.random().toString(36).slice(2, 8), fieldKey: _label, resolved: false, cancelled: false, pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
          window._ccReplaySessions.set(_label, session);
          const OVERLAY_TAGS = [
            "app-dropdown",
            "ul",
            "ng-dropdown-panel",
            "cdk-overlay-container",
            ".dropdown-options",
            ".options-list",
            ".dropdown-menu",
            ".ng-dropdown-panel"
          ];
          const addedNodes = [];
          const _trace = { triggerLabel: _label, overlayFound: false, overlayTag: "", mutationCount: 0, optionCount: 0, matchedOption: "", clicked: false, verifyStatus: "", durationMs: 0 };
          trigger.click();
          const mo = new MutationObserver((mutations) => {
            if (session.cancelled || session.resolved) return;
            for (const m of mutations) {
              m.addedNodes.forEach((n) => {
                if (n.nodeType === 1) addedNodes.push(n);
              });
            }
          });
          session.observer = mo;
          mo.observe(document.body, { childList: true, subtree: true });
          let _lastMutation = Date.now();
          const _stabilizeMo = new MutationObserver(() => {
            _lastMutation = Date.now();
          });
          _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });
          waitStable(() => {
            if (session.cancelled || session.resolved) return;
            mo.disconnect();
            session.observer = null;
            _trace.mutationCount = addedNodes.length;
            let activeOverlayRoot = null;
            const trigRect = trigger.getBoundingClientRect();
            for (const node of addedNodes) {
              if (!isVisible(node)) continue;
              const _optQ2 = adapter.optionSelector || "li,.ng-option,mat-option,.dropdown-item";
              const lis = Array.from(node.querySelectorAll(_optQ2)).filter((o) => isVisible(o));
              if (lis.length > 0) {
                activeOverlayRoot = node;
                break;
              }
            }
            if (!activeOverlayRoot) {
              let bestDist = Infinity;
              OVERLAY_TAGS.forEach((sel) => {
                try {
                  document.querySelectorAll(sel).forEach((node) => {
                    const lis = Array.from(node.querySelectorAll(_optQ)).filter((o) => isVisible(o));
                    if (lis.length === 0) return;
                    const r = node.getBoundingClientRect();
                    const dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
                    if (dist < bestDist) {
                      bestDist = dist;
                      activeOverlayRoot = node;
                    }
                  });
                } catch (e) {
                }
              });
            }
            if (!activeOverlayRoot && adapter.optionsContainer) {
              activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
            }
            if (!activeOverlayRoot) {
              const rootLis = Array.from(root.querySelectorAll(_optQ)).filter((o) => isVisible(o));
              if (rootLis.length > 0) activeOverlayRoot = root;
            }
            _trace.overlayFound = !!activeOverlayRoot;
            _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + "." + activeOverlayRoot.className.slice(0, 40) : "NONE";
            let attempts = 0;
            session.pollTimer = setInterval(() => {
              if (session.cancelled || session.resolved) {
                clearInterval(session.pollTimer);
                return;
              }
              attempts++;
              const searchRoot = activeOverlayRoot || root;
              let opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter((o) => isVisible(o));
              if (opts.length === 0 && searchRoot !== document) {
                opts = Array.from(document.querySelectorAll(_optQ)).filter((o) => isVisible(o) && root.contains(o) === false && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]'));
              }
              const v = value.toLowerCase().trim();
              _trace.optionCount = opts.length;
              var _nos = root.CcNgOptionScorer;
              let bestOpt = null, bestScore = 0;
              for (const o of opts) {
                const score = _nos.scoreOption(o.textContent.trim(), v);
                if (score > bestScore) {
                  bestScore = score;
                  bestOpt = o;
                }
              }
              const opt = bestScore >= 50 ? bestOpt : null;
              if (opt) {
                clearInterval(session.pollTimer);
                if (session.cancelled || session.resolved) return;
                _trace.matchedOption = opt.textContent.trim();
                _trace.clicked = true;
                ["pointerdown", "mousedown", "mouseup", "click"].forEach(
                  (ev) => opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
                );
                const verifyStart = Date.now();
                const triggerInitialText = trigger.textContent.trim();
                const verifyPoll = setInterval(() => {
                  if (session.cancelled || session.resolved) {
                    clearInterval(verifyPoll);
                    return;
                  }
                  const verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
                  const displayed = verifyEl ? verifyEl.textContent.trim() : "";
                  const overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
                  const triggerChanged = trigger.textContent.trim() !== triggerInitialText;
                  const ariaSelected = opt.getAttribute("aria-selected") === "true";
                  const ok = displayed && !/^(select|choose|--)$/i.test(displayed) || overlayGone || triggerChanged || ariaSelected;
                  if (ok || Date.now() - verifyStart >= 3e3) {
                    clearInterval(verifyPoll);
                    if (session.resolved) return;
                    _trace.verifyStatus = ok ? "ok" : "verify-fail";
                    _trace.durationMs = Date.now() - session.startedAt;
                    cleanupSession(_trace.verifyStatus);
                  }
                }, 200);
              } else if (attempts >= 10) {
                clearInterval(session.pollTimer);
                if (session.resolved) return;
                document.body.click();
                _trace.durationMs = Date.now() - session.startedAt;
                cleanupSession("no-option");
              }
            }, 300);
          });
          return 1;
        }
        const _noAdapterLabel = ((_b = filledBySource[selector]) == null ? void 0 : _b.label) || selector;
        _replayResults[_noAdapterLabel] = "no-adapter";
        sessionStorage.setItem("_cc_replay_results", JSON.stringify(_replayResults));
        return 0;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-mat.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneMat = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fom = root.CcFillOneMat || {};
    k.fillOneHandlers.push({
      id: "mat",
      try(el, selector, value, type, elType) {
        if (_fom.fillMat) return _fom.fillMat(el, value, elType);
        if (elType !== "mat-select" && elType !== "mat-checkbox" && elType !== "mat-radio") return null;
        if (elType === "mat-select") {
          const trigger = el.querySelector(".mat-select-trigger,.mat-mdc-select-trigger") || el;
          trigger.click();
          setTimeout(() => {
            const v = value.toLowerCase().trim();
            const opts = Array.from(document.querySelectorAll("mat-option,.mat-option,.mat-mdc-option"));
            const opt = opts.find((o) => o.textContent.trim().toLowerCase() === v) || opts.find((o) => o.textContent.trim().toLowerCase().startsWith(v)) || opts.find((o) => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) || opts.find((o) => o.textContent.trim().toLowerCase().includes(v));
            if (opt) opt.click();
            else document.body.click();
          }, 400);
          return 1;
        }
        if (elType === "mat-checkbox") {
          const shouldCheck = /yes|true|1|on|checked/i.test(value);
          const input = el.querySelector('input[type="checkbox"]');
          const isChecked = input ? input.checked : el.classList.contains("mat-checkbox-checked");
          if (shouldCheck !== isChecked) {
            (input || el).click();
          }
          return 1;
        }
        if (elType === "mat-radio") {
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
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-radio-planned.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneRadioPlanned = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _for2 = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: "radio-planned",
      try(el, selector, value, type, elType) {
        if (_for2.fillRadio) return _for2.fillRadio(el, selector, value, type, elType, filledBySource);
        if (type === "radio-click") {
          const target = el.type === "radio" ? el : el.querySelector && el.querySelector('input[type="radio"]') || el;
          target.focus();
          target.checked = true;
          ["click", "change"].forEach((ev) => target.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
          return 1;
        }
        if (type === "radio-group" && elType === "radio" && el.name) {
          const normR0 = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
          const vR0 = normR0(value);
          const radios0 = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
          const match0 = Array.from(radios0).find((r) => {
            if (normR0(r.value) === vR0) return true;
            const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
            const lblText = lbl ? normR0(lbl.textContent) : "";
            if (lblText && (lblText === vR0 || lblText.startsWith(vR0) || vR0.startsWith(lblText))) return true;
            const wantFemale = /female|महिला|स्त्री/.test(String(value).toLowerCase());
            const wantMale = /male|पुरुष/.test(String(value).toLowerCase()) && !wantFemale;
            if (wantFemale && /female|महिला|स्त्री/.test(lbl && lbl.textContent || r.value)) return true;
            if (wantMale && /male|पुरुष/.test(lbl && lbl.textContent || r.value) && !/female/.test(lbl && lbl.textContent || "")) return true;
            return false;
          });
          if (match0) {
            match0.focus();
            match0.checked = true;
            ["click", "change"].forEach((ev) => match0.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
            return 1;
          }
          console.debug("[CC] radio-group no option match:", selector, value);
          return 0;
        }
        return null;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-select.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneSelect = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fos = root.CcFillOneSelect || {};
    k.fillOneHandlers.push({
      id: "select",
      try(el, selector, value, type, elType) {
        var _a;
        if (elType !== "select") return null;
        if (_fos.fillSelect) return _fos.fillSelect(el, selector, value, mapping);
        if (elType === "select") {
          let findOpt = function(options) {
            return window.ccMatchOption(value, options, { extraValues });
          }, applySelect = function(el2, opt2) {
            el2.focus();
            el2.dispatchEvent(new Event("focus", { bubbles: true }));
            Array.from(el2.options).forEach((o) => {
              o.selected = false;
            });
            opt2.selected = true;
            el2.selectedIndex = opt2.index;
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
            if (nativeSetter) nativeSetter.set.call(el2, opt2.value);
            else el2.value = opt2.value;
            ["mousedown", "mouseup", "click", "input", "change"].forEach(
              (ev) => el2.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
            );
            if (typeof el2.onchange === "function") {
              try {
                el2.onchange.call(el2, new Event("change"));
              } catch (e) {
                console.debug("[CC] onchange handler error:", e.message);
              }
            }
            if (typeof $ !== "undefined") {
              try {
                $(el2).trigger("change");
              } catch (e) {
              }
            }
            try {
              el2.dispatchEvent(new Event("propertychange", { bubbles: true }));
            } catch (e) {
            }
            el2.dispatchEvent(new Event("blur", { bubbles: true }));
            setTimeout(() => {
              if (el2.value !== opt2.value || el2.selectedIndex !== opt2.index) {
                console.debug("[CC] select reset by framework, re-applying:", selector, opt2.value);
                opt2.selected = true;
                el2.selectedIndex = opt2.index;
                if (nativeSetter) nativeSetter.set.call(el2, opt2.value);
                else el2.value = opt2.value;
                el2.dispatchEvent(new Event("change", { bubbles: true }));
              }
              console.debug("[CC] select verify:", selector, "value:", el2.value, "selectedIndex:", el2.selectedIndex, "expected:", opt2.value, opt2.index);
            }, 300);
            setTimeout(() => el2.dispatchEvent(new Event("change", { bubbles: true })), 700);
            const _reapplyVal = opt2.value;
            const _reapplyIdx = opt2.index;
            setTimeout(() => {
              if (el2.value !== _reapplyVal) {
                el2.selectedIndex = _reapplyIdx;
                el2.value = _reapplyVal;
                el2.dispatchEvent(new Event("change", { bubbles: true }));
                console.debug("[CC] re-applied after DWR reset:", selector, _reapplyVal);
              }
            }, 3500);
            console.debug("[CC] select applied:", selector, "->", opt2.text.trim(), "(value:", opt2.value, "index:", opt2.index, ")");
            return 1;
          };
          const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
          const v = norm(value);
          const vWords = v.split(" ").filter((w) => w.length > 1);
          const extraValues = [];
          if ((_a = mapping[selector]) == null ? void 0 : _a.monthNum) {
            extraValues.push(mapping[selector].monthNum.toString());
            if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase());
          }
          const allOptions = Array.from(el.options);
          const opt = findOpt(allOptions);
          console.debug("[CC] select attempt:", selector, "value:", value, "total opts:", allOptions.length, "matched:", opt ? opt.text.trim() : "NONE", "sample:", allOptions.slice(0, 3).map((o) => o.value + "=" + o.text.trim()));
          if (opt) return applySelect(el, opt);
          let attempts = 0;
          const interval = setInterval(() => {
            const allOpts = Array.from(el.options);
            const realOpts = allOpts.filter((o) => {
              if (!o.value || o.value === "0" || o.value === "-1" || o.value === "") return false;
              const txt = o.text.toLowerCase();
              return !txt.includes("select") && !txt.includes("choose") && !txt.includes("loading") && txt !== "--";
            });
            if (realOpts.length === 0 && attempts < 10) {
              attempts++;
              return;
            }
            const opt2 = findOpt(allOpts);
            if (opt2) {
              clearInterval(interval);
              applySelect(el, opt2);
              return;
            }
            if (++attempts >= 15) {
              clearInterval(interval);
              const llmKey = window._cc_llm_key || (document.body.getAttribute("data-cc-llm-key") || "");
              if (llmKey && realOpts.length > 0) {
                const optTexts = realOpts.map((o) => o.text.trim()).join("\n");
                window.ccLLM.call({
                  apiKey: llmKey,
                  baseUrl: document.body.getAttribute("data-cc-llm-url") || void 0,
                  model: document.body.getAttribute("data-cc-llm-model") || void 0,
                  userPrompt: 'From these dropdown options, which best matches "' + value + '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
                  maxTokens: 50
                }).then((result) => {
                  const aiText = (result.text || "").trim();
                  if (aiText) {
                    const aiOpt = realOpts.find((o) => o.text.trim() === aiText) || realOpts.find((o) => o.text.trim().toLowerCase().includes(aiText.toLowerCase()));
                    if (aiOpt) {
                      console.debug("[CC] AI matched:", aiText, "->", aiOpt.text);
                      applySelect(el, aiOpt);
                    }
                  }
                }).catch(() => {
                });
              }
              console.debug("[CC] select no match after wait:", selector, "value:", value, "opts:", realOpts.slice(0, 5).map((o) => o.text.trim()));
            }
          }, 200);
          return 1;
        }
        return null;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-choice-dom.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneChoiceDom = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _for = root.CcFillOneRadio || {};
    k.fillOneHandlers.push({
      id: "choice-dom",
      try(el, selector, value, type, elType) {
        var _a, _b;
        if (_for.fillRadio) return _for.fillRadio(el, selector, value, type, elType, filledBySource);
        if (elType === "radio") {
          const normR = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
          const vR = normR(value);
          const radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
          const match = Array.from(radios).find((r) => {
            if (normR(r.value) === vR) return true;
            const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
            const lblText = lbl ? normR(lbl.textContent) : "";
            return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
          });
          if (match) {
            match.focus();
            match.checked = true;
            ["click", "change"].forEach((ev) => match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
            match.dispatchEvent(new Event("blur", { bubbles: true }));
            return 1;
          }
        } else if (elType === "checkbox") {
          const booleanLike = ["yes", "true", "1", "checked", "on", "no", "false", "0", "off", "unchecked"];
          if (!booleanLike.includes(value.toLowerCase())) {
            console.debug("[CC] skipped checkbox with non-boolean value:", value);
            return 0;
          }
          const truthy = ["yes", "true", "1", "checked", "on"].includes(value.toLowerCase());
          if (truthy !== el.checked) {
            el.checked = truthy;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return 1;
          }
        } else if (el.type === "file") {
          if (!value) {
            console.debug("[CC] file: no value \u2014 waiting_human (no dialog):", selector);
            return 0;
          }
          if (value.startsWith("data:")) {
            try {
              const [meta, b64] = value.split(",");
              const mime = ((_a = meta.match(/data:([^;]+)/)) == null ? void 0 : _a[1]) || "application/octet-stream";
              const ext = mime.split("/")[1] || "bin";
              const fileName = (((_b = filledBySource[selector]) == null ? void 0 : _b.label) || "file").replace(/[^a-z0-9]/gi, "_") + "." + ext;
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
              const dt = new DataTransfer();
              dt.items.add(file);
              el.files = dt.files;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              console.debug("[CC] file assigned (base64):", selector, fileName, file.size, "bytes");
              return 1;
            } catch (e) {
              console.debug("[CC] file base64 error:", e.message, "\u2014 waiting_human (no dialog)");
              return 0;
            }
          }
          if (value.startsWith("http://") || value.startsWith("https://")) {
            console.debug("[CC] file URL deferred to sequential loop:", selector);
            return 0;
          }
          console.debug("[CC] file: filename hint only \u2014 waiting_human (no dialog):", selector, value);
          return 0;
        }
        return null;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-date.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneDate = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fod = root.CcFillOneDate || {};
    k.fillOneHandlers.push({
      id: "date",
      try(el, selector, value, type, elType) {
        if (_fod.fillDate) return _fod.fillDate(el, selector, value);
        if (el._flatpickr || el.classList.contains("flatpickr-input")) {
          const fp = el._flatpickr;
          var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
          var dateObj = _parsed.dateObj;
          if (fp && !isNaN(dateObj)) {
            fp.setDate(dateObj, true);
          } else {
            const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
            el.focus();
            if (niv) niv.set.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.blur();
          }
          console.debug("[CC] flatpickr fill:", selector, "value:", value, "result:", el.value);
          return el.value ? 1 : 0;
        } else if (el.classList.contains("hasDatepicker") || typeof $ !== "undefined" && typeof $.fn !== "undefined" && typeof $.fn.datepicker !== "undefined" && $(el).data("datepicker")) {
          var _parsed = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : { dateObj: new Date(value) };
          var dateObj = _parsed.dateObj;
          if (!isNaN(dateObj)) {
            $(el).datepicker("setDate", dateObj);
          } else {
            const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
            el.focus();
            if (niv) niv.set.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          console.debug("[CC] jQuery datepicker fill:", selector, "value:", value, "result:", el.value);
          return el.value ? 1 : 0;
        } else if (el.getAttribute("matdatepicker") !== null || el.getAttribute("matInput") !== null && el.closest("mat-datepicker-toggle,mat-form-field") && (el.type === "text" || el.type === "date")) {
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          el.focus();
          if (niv) niv.set.call(el, value);
          else el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.dispatchEvent(new CustomEvent("dateChange", { bubbles: true, detail: { value } }));
          el.dispatchEvent(new CustomEvent("dateInput", { bubbles: true, detail: { value } }));
          el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) || "Enter" }));
          el.blur();
          return 1;
        } else if (el.type === "date" || el.type === "datetime-local" || el.type === "month" || el.type === "week") {
          var _parsed2 = (root.CcParseDateValue || {}).parseDateValue ? root.CcParseDateValue.parseDateValue(value) : null;
          var isoValue;
          if (el.type === "datetime-local" && String(value || "").includes("T")) {
            isoValue = String(value);
          } else if (_parsed2 && _parsed2.isoDate) {
            isoValue = el.type === "month" ? _parsed2.isoMonth : _parsed2.isoDate;
          } else {
            isoValue = value;
          }
          if (el.type === "datetime-local" && !isoValue.includes("T")) {
            isoValue += "T00:00";
          }
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          el.focus();
          if (niv) niv.set.call(el, isoValue);
          else el.value = isoValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.blur();
          console.debug("[CC] date fill:", selector, "original:", value, "iso:", isoValue, "result:", el.value);
          return el.value ? 1 : 0;
        }
        return null;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one-text.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneText = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _fot = root.CcFillOneText || {};
    k.fillOneHandlers.push({
      id: "text",
      try(el, selector, value, type, elType) {
        if (_fot.fillText) return _fot.fillText(el, value);
        const isTextarea = el.tagName === "TEXTAREA";
        const niv = isTextarea ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (typeof window.keystrokeFillSync === "function") {
          const ok = window.keystrokeFillSync(el, value);
          if (el.getAttribute && el.getAttribute("data-type") === "fullName") {
            const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const idx = allInputs.indexOf(el);
            const next = allInputs[idx + 1];
            if (next && next.getAttribute("data-type") === "text") {
              setTimeout(() => {
                if (next.value && next.value.length > 0) return;
                const fillHindi = (hindiVal) => {
                  if (typeof window.keystrokeFillSync === "function") window.keystrokeFillSync(next, hindiVal);
                };
                fetch("https://inputtools.google.com/request?text=" + encodeURIComponent(value) + "&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8").then((r) => r.json()).then((d) => {
                  var _a, _b, _c;
                  const hindi = (_c = (_b = (_a = d == null ? void 0 : d[1]) == null ? void 0 : _a[0]) == null ? void 0 : _b[1]) == null ? void 0 : _c[0];
                  fillHindi(hindi || value);
                }).catch(() => fillHindi(value));
              }, 500);
            }
          }
          return ok ? 1 : 0;
        }
        el.focus();
        if (niv) niv.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.slice(-1) }));
        return 1;
        return 0;
      }
    });
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-fill-one.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOne = function(k) {
    k.fillOneHandlers = k.fillOneHandlers || [];
    var _resolve = root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector : function(sel) {
      return document.querySelector(sel);
    };
    function resolveEl(selector) {
      return _resolve(selector);
    }
    function detectElType(el, type) {
      const tagName = el.tagName.toLowerCase();
      if (tagName === "select") return "select";
      if (tagName === "ng-select") return "ng-dropdown";
      if (tagName === "mat-select") return "mat-select";
      if (tagName === "mat-checkbox") return "mat-checkbox";
      if (tagName === "mat-radio-button") return "mat-radio";
      if (el.classList && (el.classList.contains("ng-dropdown") || el.classList.contains("ng-select"))) return "ng-dropdown";
      if (tagName !== "input" && (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox")) return "ng-dropdown";
      return el.type || type || "text";
    }
    k.fillOne = function fillOne(selector, value, type) {
      try {
        const el = resolveEl(selector);
        if (!el) return 0;
        const elType = detectElType(el, type);
        console.log("[CC] fillOne:", selector, "elType:", elType, "value:", value);
        const handlers = k.fillOneHandlers || [];
        for (let i = 0; i < handlers.length; i++) {
          const r = handlers[i].try(el, selector, value, type, elType);
          if (r !== null && r !== void 0) return r;
        }
        return 0;
      } catch (e) {
        return 0;
      }
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-sequential.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installSequential = function(k) {
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
    const waitForDOMQuiet = b.waitForDOMQuiet || function(ms) {
      return new Promise(function(r) {
        setTimeout(r, ms || 300);
      });
    };
    const waitForNetworkIdle = b.waitForNetworkIdle || function(q, m) {
      return window.ccWaitForNetworkIdle ? window.ccWaitForNetworkIdle(q || 200, m || 8e3) : Promise.resolve({ idle: true, waitedMs: 0 });
    };
    const _buildFillRecord = root.CcBuildFillRecord && root.CcBuildFillRecord.buildFillRecord || function(base) {
      return Object.assign({ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: "sequential" }, base);
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
    k._seqChunks = k._seqChunks || ["baked-solid"];
    k.fillSequential = async function fillSequential() {
      var _a, _b, _c, _d;
      for (const [selector, fieldData] of entries) {
        const { value, type } = fieldData;
        let isNgDropdown = type === "ng-dropdown" || selector.startsWith("ng-dropdown-");
        const fieldLabel = (((_a = filledBySource[selector]) == null ? void 0 : _a.label) || selector).toLowerCase();
        const _fieldCtxEarly = filledBySource[selector] || {};
        _emitFillDebug("field.start", {
          selector,
          label: _fieldCtxEarly.label || fieldLabel,
          type,
          planned: value,
          profileKey: _fieldCtxEarly.profileKey || fieldData.profileKey || null
        });
        const _selectLike = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || "");
        const isDependent = _selectLike && PRIORITY_KEYS.some((pk) => fieldLabel.includes(pk) || selector.toLowerCase().includes(pk));
        let el = typeof root !== "undefined" && root.CcResolveCcSelector ? root.CcResolveCcSelector.resolveCcSelector(selector) : document.querySelector(selector);
        if (!isNgDropdown && el) {
          const _tag = el.tagName.toLowerCase();
          if (_tag === "ng-select" || el.classList && (el.classList.contains("ng-select") || el.classList.contains("ng-dropdown"))) {
            isNgDropdown = true;
          }
          if (!isNgDropdown && _tag !== "select" && _tag !== "input" && _tag !== "mat-select") {
            const _role = el.getAttribute("role");
            if (_role === "combobox" || _role === "listbox") isNgDropdown = true;
          }
        }
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          await new Promise((r) => setTimeout(r, 300));
        }
        const _t0 = Date.now();
        const _fieldCtx = {
          type,
          label: fieldData.label || ((_b = filledBySource[selector]) == null ? void 0 : _b.label) || selector,
          profileKey: fieldData.profileKey || ((_c = filledBySource[selector]) == null ? void 0 : _c.profileKey) || "",
          selector,
          matchBy: fieldData.matchBy || ((_d = filledBySource[selector]) == null ? void 0 : _d.matchBy) || "label"
        };
        const _selectLike2 = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || "");
        if (_selectLike2) console.log("[CC] route:", selector, "type:", type, "isNgDropdown:", isNgDropdown, "isDependent:", isDependent, "filled:", k.filled, "elTag:", el == null ? void 0 : el.tagName, "elType:", el == null ? void 0 : el.type);
        if (fieldData.type === "button") {
          const _btnPlugin = _CC_USE_PLUGINS && typeof findPlugin === "function" ? findPlugin(el, _fieldCtx) : null;
          if (_btnPlugin) {
            const _pResult = _btnPlugin.fill(el, value, { attempt: 1 });
            const _preCount = document.querySelectorAll("input,select,textarea,div.ng-dropdown").length;
            await waitForDOMQuiet(800);
            const newFields = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select,div.ng-dropdown');
            const newFieldCount = newFields.length;
            _ccRecords.push(_buildFillRecord({ selector, value, type: "button", result: "filled", strategy: "plugin:button-click", plugin: "button-click", role: fieldData.role || "navigation", newFieldCount, transitionOutcome: newFieldCount > _preCount ? "transition_success" : newFieldCount === _preCount ? "transition_no_change" : "transition_partial", durationMs: Date.now() - _t0 }, { rv: RUNTIME_VERSION }));
            _flushRecords();
            console.debug("[CC][plugin] button-click", selector, "newFields:", newFieldCount);
          } else {
            if (el) el.click();
            await waitForDOMQuiet(800);
          }
          await settleAfterAct("button");
        } else if (isNgDropdown) {
          if (!el) {
            _ccRecords.push(_buildFillRecord({ selector, value, type, result: "skipped", failReason: "no-element", strategy: "ng-dropdown" }, { rv: RUNTIME_VERSION }));
            _flushRecords();
            continue;
          }
          if (_realOptions(el).length === 0 && el.tagName === "SELECT") {
            el = await waitForSelectOptionsSequential(selector, 5e3) || el;
          }
          const _ngPlugin = _CC_USE_PLUGINS && typeof findPlugin === "function" ? findPlugin(el, _fieldCtx) : null;
          if (_ngPlugin) {
            try {
              const _ctx = { profileKey: _fieldCtx.profileKey, portalAdapters: portalAdapters || {}, attempt: 1 };
              const _pResult = await _ngPlugin.fill(el, value, _ctx);
              const _r = _pResult.success ? 1 : 0;
              k.filled += _r;
              _ccRecords.push(_buildFillRecord({ selector, value, type, result: _r ? "filled" : "skipped", failReason: _r ? null : _pResult.reason, strategy: "plugin:" + _ngPlugin.id, plugin: _ngPlugin.id, durationMs: Date.now() - _t0 }, { rv: RUNTIME_VERSION }));
              _flushRecords();
            } catch (e) {
              fillOne(selector, value, type);
            }
          } else {
            fillOne(selector, value, type);
          }
          await settleAfterAct("select");
        } else if (_selectLike && el && el.tagName === "SELECT") {
          const semKey = _cascadeSemanticKey(_fieldCtx.label, _fieldCtx.profileKey, selector);
          let liveEl = el;
          let loadMode = _selectLoadMode(liveEl);
          let optionCountBefore = _realOptions(liveEl).length;
          let sampleBefore = _sampleOptions(liveEl);
          let settleMeta = { idle: true, waitedMs: 0 };
          if (_isPlaceholderPlanned(value)) {
            _pushSelectRecord({
              selector,
              value,
              type,
              label: _fieldCtx.label,
              profileKey: _fieldCtx.profileKey || null,
              result: "skipped",
              failReason: "placeholder_planned_value",
              strategy: "sequential",
              loadMode,
              actualValue: _readSelectActual(el).actualValue,
              durationMs: Date.now() - _t0
            });
            continue;
          }
          if (!_selectIsActive(el) && loadMode === "ajax") {
            _pushSelectRecord({
              selector,
              value,
              type,
              label: _fieldCtx.label,
              profileKey: _fieldCtx.profileKey || null,
              result: "skipped",
              failReason: "ajax_control_inactive",
              strategy: "sequential",
              loadMode: "ajax",
              actualValue: "",
              durationMs: Date.now() - _t0
            });
            continue;
          }
          if (_realOptions(liveEl).length === 0) {
            const exhausted = k.ajaxWaitBudgetMs <= 0 || k.ajaxNotLoadedCount >= 5;
            const cap = exhausted ? 500 : Math.min(6e3, Math.max(500, k.ajaxWaitBudgetMs));
            console.log("[CC] sequential-wait-options:", selector, "budget=", k.ajaxWaitBudgetMs, "cap=", cap);
            const waitedEl = await waitForSelectOptionsSequential(selector, cap);
            liveEl = waitedEl || document.querySelector(selector) || el;
            loadMode = _selectLoadMode(liveEl);
            if (_realOptions(liveEl).length === 0) {
              k.ajaxNotLoadedCount += 1;
              _pushSelectRecord({
                selector,
                value,
                type,
                label: _fieldCtx.label,
                profileKey: _fieldCtx.profileKey || null,
                result: "skipped",
                failReason: exhausted ? "ajax_wait_budget_exhausted" : "strategy_options_not_ready",
                strategy: "sequential",
                loadMode: "ajax",
                optionCount: 0,
                optionSample: _sampleOptions(liveEl, 8),
                actualValue: _readSelectActual(liveEl).actualValue,
                durationMs: Date.now() - _t0
              });
              continue;
            }
          }
          optionCountBefore = _realOptions(liveEl).length;
          sampleBefore = _sampleOptions(liveEl, 10);
          let strategy = "native-select";
          let attempt = 1;
          async function tryApply(attemptNo) {
            const _plugin = _CC_USE_PLUGINS && typeof findPlugin === "function" ? findPlugin(liveEl, _fieldCtx) : null;
            if (_plugin) {
              const _pResult = _plugin.fill(liveEl, value, {
                profileKey: _fieldCtx.profileKey,
                attempt: attemptNo
              });
              strategy = "plugin:" + _plugin.id;
              if (_pResult && _pResult.success) return { ok: true, reason: null };
              return {
                ok: false,
                reason: _pResult && _pResult.reason || "strategy_option_mismatch",
                optionCount: _pResult && _pResult.optionCount
              };
            }
            const _r = fillOne(selector, value, type) || 0;
            strategy = "native-select";
            if (_r) return { ok: true, reason: null };
            const real = _realOptions(liveEl);
            if (!real.length) return { ok: false, reason: "strategy_options_not_ready" };
            return { ok: false, reason: "strategy_option_mismatch", optionCount: real.length };
          }
          let applyRes = await tryApply(1);
          if (!applyRes.ok && k.ajaxWaitBudgetMs > 2e3 && k.ajaxNotLoadedCount < 3) {
            attempt = 2;
            await settleAfterAct("select", { budgetMs: 2500 });
            liveEl = document.querySelector(selector) || liveEl;
            if (_realOptions(liveEl).length > 0) applyRes = await tryApply(2);
          }
          settleMeta = await settleAfterAct("select");
          liveEl = document.querySelector(selector) || liveEl;
          const actual = _readSelectActual(liveEl);
          let matchOk = applyRes.ok;
          if (!matchOk && actual.actualValue && value) {
            const np = String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
            const na = String(actual.actualValue).toLowerCase().replace(/[^a-z0-9]/g, "");
            if (np && na && (np === na || na.includes(np) || np.includes(na))) matchOk = true;
          }
          if (matchOk) {
            k.filled += 1;
            if (semKey) {
              _cascadeSettled[semKey] = {
                key: semKey,
                selector,
                value,
                actualValue: actual.actualValue
              };
            }
          } else if (applyRes.reason === "strategy_options_not_ready" || applyRes.reason === "ajax_options_not_loaded") {
            k.ajaxNotLoadedCount += 1;
          }
          _pushSelectRecord({
            selector,
            value,
            type,
            label: _fieldCtx.label,
            profileKey: _fieldCtx.profileKey || null,
            result: matchOk ? "filled" : "skipped",
            failReason: matchOk ? null : applyRes.reason || "strategy_failed",
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
            durationMs: Date.now() - _t0
          });
        } else if (el && el.type === "file") {
          if (value && (value.startsWith("http://") || value.startsWith("https://"))) {
            try {
              const resp = await fetch(value);
              if (resp.ok) {
                const blob = await resp.blob();
                const fileName = value.split("/").pop().split("?")[0] || "document";
                const file = new File([blob], fileName, {
                  type: blob.type || "application/octet-stream",
                  lastModified: Date.now()
                });
                const dt = new DataTransfer();
                dt.items.add(file);
                el.files = dt.files;
                el.dispatchEvent(new Event("change", { bubbles: true }));
                k.filled += 1;
                console.debug("[CC] file URL assigned:", selector, fileName, file.size, "bytes");
                _ccRecords.push(_buildFillRecord({
                  selector,
                  value,
                  type: "file",
                  label: _fieldCtx.label,
                  result: "filled",
                  strategy: "file-url-fetch",
                  fileName,
                  fileSize: file.size,
                  durationMs: Date.now() - _t0
                }, { rv: RUNTIME_VERSION }));
                _flushRecords();
              } else {
                _ccRecords.push(_buildFillRecord({
                  selector,
                  value,
                  type: "file",
                  label: _fieldCtx.label,
                  result: "waiting_human",
                  failReason: "fetch-" + resp.status,
                  strategy: "file-needs-human",
                  durationMs: Date.now() - _t0
                }, { rv: RUNTIME_VERSION }));
                _flushRecords();
              }
            } catch (e) {
              _ccRecords.push(_buildFillRecord({
                selector,
                value,
                type: "file",
                label: _fieldCtx.label,
                result: "waiting_human",
                failReason: e.message || "fetch-error",
                strategy: "file-needs-human",
                durationMs: Date.now() - _t0
              }, { rv: RUNTIME_VERSION }));
              _flushRecords();
            }
          } else {
            _ccRecords.push(_buildFillRecord({
              selector,
              value: value || null,
              type: "file",
              label: _fieldCtx.label,
              result: "waiting_human",
              failReason: value ? "filename_only_no_url" : "no_file_value",
              strategy: "file-needs-human",
              durationMs: Date.now() - _t0
            }, { rv: RUNTIME_VERSION }));
            _flushRecords();
          }
          await settleAfterAct("text");
        } else {
          const isChoice = type === "radio-click" || type === "radio" || type === "radio-group" || type === "checkbox" || type === "mat-checkbox" || type === "mat-radio" || el && (el.type === "radio" || el.type === "checkbox");
          try {
            const _r = fillOne(selector, value, type) || 0;
            if (isChoice) await settleAfterAct("choice");
            else await settleAfterAct("text");
            const _el2 = el || document.querySelector(selector);
            const _strategy = detectStrategy(_el2, type);
            const _ver = await verifyValue(selector, value, isChoice ? 80 : 100);
            let _trulyFilled = false;
            if (isChoice && _r === 1) {
              if (_el2 && (_el2.type === "radio" || _el2.type === "checkbox")) {
                _trulyFilled = !!_el2.checked;
              } else {
                _trulyFilled = _ver.ok || _r === 1;
              }
              if (!_trulyFilled && _ver.actualValue === "true") _trulyFilled = true;
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
              result: _trulyFilled ? "filled" : "skipped",
              failReason: _trulyFilled ? null : _r ? _ver.reason || "strategy_failed" : _el2 ? "strategy_failed" : "no-element",
              actualValue: _ver.actualValue,
              verified: _trulyFilled,
              strategy: _strategy,
              matchBy: _fieldCtx.matchBy,
              durationMs: Date.now() - _t0
            }, { rv: RUNTIME_VERSION });
            _ccRecords.push(_recChoice);
            _flushRecords();
            _emitFillDebug(_trulyFilled ? "field.done" : "field.fail", {
              selector,
              label: _fieldCtx.label,
              type,
              planned: value,
              actual: _ver.actualValue,
              failReason: _recChoice.failReason,
              strategy: _strategy
            });
          } catch (e) {
            _ccRecords.push(_buildFillRecord({
              selector,
              value,
              type,
              result: "error",
              error: e.message
            }, { rv: RUNTIME_VERSION }));
            _flushRecords();
            _emitFillDebug("field.fail", {
              selector,
              type,
              planned: value,
              failReason: e.message || "error"
            });
          }
        }
      }
    };
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-post-fill-corrections.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillCorrections = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      allFields,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    var _pfc = root.CcPostFillCorrections || {};
    if (_pfc.installCorrectionsObserver) {
      _pfc.installCorrectionsObserver({
        entries: Array.from(entries),
        filledBySource,
        allFields,
        getEl,
        records: k.records || [],
        RUNTIME_VERSION
      });
      return;
    }
    setTimeout(() => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      const _ccBackendUrl = document.body.getAttribute("data-cc-backend") || "";
      const _ccFormKey = document.body.getAttribute("data-cc-formkey") || "";
      const snapshot = {};
      const fieldMeta = {};
      for (const [selector, fieldData] of entries) {
        let el = getEl(selector);
        if (!el) continue;
        const val = el.tagName === "SELECT" ? ((_a = el.options[el.selectedIndex]) == null ? void 0 : _a.text) || el.value : ((_b = el.classList) == null ? void 0 : _b.contains("ng-dropdown")) ? ((_d = (_c = el.querySelector(".value-area .value,.select-type,.ng-value-label")) == null ? void 0 : _c.textContent) == null ? void 0 : _d.trim()) || "" : el.value || "";
        snapshot[selector] = val;
        const rec = _ccRecords.find((r) => r.selector === selector);
        fieldMeta[selector] = {
          label: ((_e = filledBySource[selector]) == null ? void 0 : _e.label) || selector,
          semanticKey: ((_f = filledBySource[selector]) == null ? void 0 : _f.semanticKey) || "",
          profileKey: ((_g = filledBySource[selector]) == null ? void 0 : _g.profileKey) || "",
          plugin: (rec == null ? void 0 : rec.plugin) || null,
          strategy: (rec == null ? void 0 : rec.strategy) || "",
          originalResult: (rec == null ? void 0 : rec.result) || "unknown",
          autofilledValue: fieldData.value
        };
      }
      if (Array.isArray(allFields)) {
        for (const f of allFields) {
          if (snapshot[f.selector] !== void 0) continue;
          const el = getEl(f.selector);
          if (!el) continue;
          const val = el.tagName === "SELECT" ? ((_h = el.options[el.selectedIndex]) == null ? void 0 : _h.text) || el.value : ((_i = el.classList) == null ? void 0 : _i.contains("ng-dropdown")) ? ((_k = (_j = el.querySelector(".value-area .value,.select-type,.ng-value-label")) == null ? void 0 : _j.textContent) == null ? void 0 : _k.trim()) || "" : el.value || "";
          snapshot[f.selector] = val;
          fieldMeta[f.selector] = {
            label: f.label || f.selector,
            semanticKey: "",
            profileKey: "",
            plugin: null,
            strategy: "unmapped",
            originalResult: "unmapped",
            autofilledValue: ""
          };
        }
      }
      function captureCorrections(trigger) {
        var _a2, _b2, _c2, _d2;
        const corrections = [];
        for (const [selector, originalVal] of Object.entries(snapshot)) {
          let el = getEl(selector);
          if (!el) continue;
          const currentVal = el.tagName === "SELECT" ? ((_a2 = el.options[el.selectedIndex]) == null ? void 0 : _a2.text) || el.value : ((_b2 = el.classList) == null ? void 0 : _b2.contains("ng-dropdown")) ? ((_d2 = (_c2 = el.querySelector(".value-area .value,.select-type,.ng-value-label")) == null ? void 0 : _c2.textContent) == null ? void 0 : _d2.trim()) || "" : el.value || "";
          if (currentVal !== originalVal && currentVal !== "") {
            const meta = fieldMeta[selector] || {};
            corrections.push({
              selector,
              field: meta.label,
              semanticKey: meta.semanticKey,
              profileKey: meta.profileKey,
              autofilledValue: meta.autofilledValue,
              snapshotValue: originalVal,
              finalOperatorValue: currentVal,
              correctionType: !originalVal || originalVal === "" ? "completion" : "override",
              originalResult: meta.originalResult,
              plugin: meta.plugin,
              strategy: meta.strategy,
              trigger,
              ts: Date.now()
            });
          }
        }
        return corrections;
      }
      function postCorrections(trigger) {
        const corrections = captureCorrections(trigger);
        if (corrections.length === 0) return;
        document.body.setAttribute("data-cc-corrections", JSON.stringify(corrections));
        if (_ccBackendUrl) {
          const _ccToken = document.body.getAttribute("data-cc-token") || "";
          const _ccProfileId = document.body.getAttribute("data-cc-profile-id") || "";
          const headers = { "Content-Type": "application/json" };
          if (_ccToken) headers["Authorization"] = "Bearer " + _ccToken;
          fetch(_ccBackendUrl + "/corrections", {
            method: "POST",
            headers,
            body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey, profileId: _ccProfileId, trigger, corrections })
          }).catch(() => {
          });
        }
      }
      document.addEventListener("click", (e) => {
        const btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
        if (!btn) return;
        const txt = (btn.textContent || btn.value || "").toLowerCase();
        if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === "submit") {
          postCorrections("submit");
        }
      }, true);
      window.addEventListener("beforeunload", () => postCorrections("unload"));
    }, 1e4);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-post-fill-confirm.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillConfirm = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    setTimeout(function() {
      var _cfp = root.CcConfirmFieldPattern || {};
      var _isConfirmField = _cfp.isConfirmField || function() {
        return false;
      };
      var _getBaseId = _cfp.getBaseId || function(id) {
        return id;
      };
      var allInputs = Array.from(document.querySelectorAll("input[type=text],input[type=email],input[type=tel],input[type=number]"));
      allInputs.forEach(function(el) {
        if (!el.id && !el.name) return;
        var id = (el.id || el.name || "").toLowerCase();
        var label = (function() {
          if (el.id) {
            var l = document.querySelector('label[for="' + el.id + '"]');
            if (l) return l.textContent.toLowerCase();
          }
          return "";
        })();
        var isConfirm = _isConfirmField(id, label);
        if (!isConfirm) return;
        if (el.value) return;
        var baseId = _getBaseId(id);
        var primary = document.getElementById(baseId) || document.querySelector('[id$="' + baseId + '"]') || document.querySelector('[name="' + baseId + '"]');
        if (!primary || !primary.value) {
          var ph = (el.placeholder || "").toLowerCase();
          if (ph.includes("dd/mm") || ph.includes("dd-mm")) {
            var allFilled = Array.from(document.querySelectorAll("input[type=text]")).filter(function(inp) {
              return inp !== el && inp.value && (inp.placeholder || "").toLowerCase().match(/dd.mm/);
            });
            if (allFilled.length > 0) primary = allFilled[0];
          }
        }
        if (!primary || !primary.value) return;
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (niv) niv.set.call(el, primary.value);
        else el.value = primary.value;
        ["input", "change", "blur"].forEach(function(ev) {
          el.dispatchEvent(new Event(ev, { bubbles: true }));
        });
        _ccRecords.push((root.CcBuildFillRecord ? root.CcBuildFillRecord.buildFillRecord : function(b2) {
          return Object.assign({ ts: Date.now(), rv: RUNTIME_VERSION, fillMode: "sequential" }, b2);
        })({ selector: "#" + (el.id || el.name), value: primary.value, type: "text", result: "filled", strategy: "confirm-mirror", durationMs: 0 }, { rv: RUNTIME_VERSION }));
        _flushRecords();
      });
    }, 4e3);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-post-fill-mirror.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFillMirror = function(k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters,
      filledBySource,
      mapping,
      _replayResults,
      _ccRecords,
      RUNTIME_VERSION,
      _CC_USE_PLUGINS,
      PRIORITY_KEYS,
      entries,
      getEl,
      _emitFillDebug,
      _flushRecords,
      _pushSelectRecord,
      settleAfterAct,
      waitForSelectOptionsSequential,
      waitForOptions,
      detectStrategy,
      verifyValue,
      _isPlaceholderOption,
      _realOptions,
      _sampleOptions,
      _readSelectActual,
      _selectLoadMode,
      _cascadeSemanticKey,
      _CASCADE_PARENTS,
      _cascadeSettled,
      _isPlaceholderPlanned,
      _selectIsActive,
      fillOne
    } = b;
    setTimeout(function() {
      var _cfp = root.CcConfirmFieldPattern || {};
      var _isConfirmField = _cfp.isConfirmField || function() {
        return false;
      };
      var _getBaseId = _cfp.getBaseId || function(id) {
        return id;
      };
      var allInputs = Array.from(document.querySelectorAll("input[type=text],input[type=email],input[type=tel]"));
      allInputs.forEach(function(el) {
        if (!el.id) return;
        if (el.value) return;
        var id = el.id.toLowerCase();
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
        var _mirrorTarget = document.getElementById(confirmId);
        var _mirroring = false;
        el.addEventListener("input", function() {
          if (_mirroring) return;
          _mirroring = true;
          var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
          if (niv) niv.set.call(_mirrorTarget, el.value);
          else _mirrorTarget.value = el.value;
          ["input", "change"].forEach(function(ev) {
            _mirrorTarget.dispatchEvent(new Event(ev, { bubbles: true }));
          });
          _mirroring = false;
        });
      });
    }, 3e3);
    try {
      document.body.setAttribute("data-cc-records", JSON.stringify(_ccRecords));
    } catch (e) {
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== install-post-fill.ts ==== */
(function(root) {
  "use strict";
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installPostFill = function(k) {
    root.CcExecParts.installPostFillCorrections(k);
    root.CcExecParts.installPostFillConfirm(k);
    root.CcExecParts.installPostFillMirror(k);
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* ==== fill-form-fields-sequential.ts ==== */
globalThis.fillFormFieldsSequential = async function fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields) {
  portalAdapters = portalAdapters || {};
  const parts = typeof globalThis !== "undefined" && globalThis.CcExecParts || {};
  const need = [
    "bindKernelLocals",
    "installDebug",
    "installSelectHelpers",
    "installSettle",
    "installDomOrder",
    "installStrategy",
    "installFillOne",
    "installSequential"
  ];
  const soft = [
    "installFillOneNgHelpers",
    "installFillOneNg",
    "installFillOneMat",
    "installFillOneRadioPlanned",
    "installFillOneSelect",
    "installFillOneChoiceDom",
    "installFillOneDate",
    "installFillOneText",
    "installPostFill"
  ];
  const missingHard = need.filter((n) => typeof parts[n] !== "function");
  if (missingHard.length) {
    const ver = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "?";
    const present = Object.keys(parts).filter((k2) => k2 === "bindKernelLocals" || k2.indexOf("install") === 0).sort().join("|");
    console.error("[CC] executor hard parts missing:", missingHard.join(","), "present=", present, "ver=", ver);
    throw new Error("executor_parts_not_loaded:" + missingHard[0] + " @" + ver);
  }
  const missingSoft = soft.filter((n) => typeof parts[n] !== "function");
  if (missingSoft.length) {
    console.warn("[CC] executor soft parts missing (inject incomplete?):", missingSoft.join(","));
  }
  const RUNTIME_VERSION = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "inj";
  console.log(
    "[CC] fillFormFieldsSequential started v" + RUNTIME_VERSION + ", fields:",
    Object.keys(mapping || {}).length
  );
  const k = {
    mapping: mapping || {},
    filledBySource: filledBySource || {},
    portalAdapters,
    allFields: allFields || null,
    records: [],
    replayResults: {},
    RUNTIME_VERSION,
    STRATEGY_VERSION: "1.0",
    WAIT_ENGINE_VERSION: "1.2",
    CC_USE_PLUGINS: true,
    CC_LEGACY_COMPARE: true,
    fillRunId: "fill:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ajaxWaitBudgetMs: 45e3,
    ajaxNotLoadedCount: 0,
    cascadeSettled: /* @__PURE__ */ Object.create(null),
    filled: 0,
    entries: [],
    PRIORITY_KEYS: null,
    CASCADE_PARENTS: null,
    fillOneHandlers: [],
    _seqChunks: []
  };
  k.flushRecords = function flushRecords() {
    try {
      document.body.setAttribute("data-cc-records", JSON.stringify(k.records));
    } catch (e) {
    }
  };
  function install(name) {
    if (typeof parts[name] === "function") parts[name](k);
  }
  install("installDebug");
  install("installSelectHelpers");
  install("installSettle");
  install("installDomOrder");
  install("installStrategy");
  install("installFillOneNgHelpers");
  install("installFillOneNg");
  install("installFillOneMat");
  install("installFillOneRadioPlanned");
  install("installFillOneSelect");
  install("installFillOneChoiceDom");
  install("installFillOneDate");
  install("installFillOneText");
  install("installFillOne");
  install("installSequential");
  if (typeof k.fillSequential !== "function") {
    throw new Error(
      "executor_parts_not_loaded:fillSequential @" + (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "?")
    );
  }
  k.emitFillDebug("fill.start", {
    fieldCount: Object.keys(k.mapping).length,
    waitEngine: k.WAIT_ENGINE_VERSION
  });
  await k.fillSequential();
  k.emitFillDebug("fill.end", {
    filled: k.filled,
    records: k.records.length,
    ajaxBudgetLeftMs: k.ajaxWaitBudgetMs
  });
  parts.installPostFill(k);
  try {
    document.body.setAttribute("data-cc-records", JSON.stringify(k.records));
  } catch (e) {
  }
  return k.filled;
};
