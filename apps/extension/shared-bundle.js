/**
 * AUTO-GENERATED
 * Source: @cc/shared
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== network-idle.ts ==== */
;
(function() {
  "use strict";
  function ccWaitForNetworkIdle(quietMs, maxMs) {
    quietMs = typeof quietMs === "number" && quietMs > 0 ? quietMs : 200;
    maxMs = typeof maxMs === "number" && maxMs > 0 ? maxMs : 8e3;
    return new Promise(function(resolve) {
      var start = Date.now();
      var deadline = start + maxMs;
      function tick() {
        var ds = document.body.dataset || {};
        var active = parseInt(ds.ccAjaxActive || "NaN", 10);
        var lastActivity = parseInt(ds.ccAjaxLastActivity || "0", 10);
        if (Number.isNaN(active)) {
          setTimeout(function() {
            resolve({ idle: true, waitedMs: Date.now() - start, monitorMissing: true });
          }, quietMs);
          return;
        }
        if (Date.now() >= deadline) {
          resolve({ idle: false, waitedMs: Date.now() - start, reason: "max-elapsed" });
          return;
        }
        if (active === 0 && lastActivity && Date.now() - lastActivity >= quietMs) {
          resolve({ idle: true, waitedMs: Date.now() - start });
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });
  }
  window.ccWaitForNetworkIdle = ccWaitForNetworkIdle;
})();

/* ==== dom-utils.ts ==== */
;
(function() {
  "use strict";
  function isVisible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    var style = getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    return true;
  }
  function isGoodLabel(text) {
    if (!text) return false;
    var t = text.replace(/[*:\s]/g, "");
    if (t.length < 2) return false;
    var lower = text.toLowerCase().trim();
    if (/^(please\s+select|select(\s+(an?|one))?|--\s*select|choose|select\.{2,}|enter|type|input|field)$/i.test(lower)) return false;
    if (/^[\d\s\-_.*/]+$/.test(text)) return false;
    var nonDigits = text.replace(/[\d\s\n\r,]/g, "").trim();
    if (text.length > 30 && nonDigits.length < text.length * 0.3) return false;
    if (text.length > 250) return false;
    if ((text.match(/\n/g) || []).length > 3) return false;
    return true;
  }
  function cleanLabelText(text) {
    return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").replace(/[*：:]+$/g, "").trim();
  }
  function humanizeAttr(raw) {
    if (!raw || typeof raw !== "string") return "";
    var s = raw.trim();
    if (!s) return "";
    if (/^(mat-|cdk-|ng-|mdc-|react-|ember\d|form-field-|ctl\d)/i.test(s)) return "";
    if (/^[0-9a-f]{8,}(-[0-9a-f]{4,})+$/i.test(s)) return "";
    if (/^(id|input|select|field|ctrl|control)\d+$/i.test(s)) return "";
    s = s.replace(/^(txt|ddl|cmb|cbo|chk|opt|btn|fld|inp|lbl|hdn|uc|UserControl_?)/i, "");
    if (!s || s.length < 2 || s.length > 60) return "";
    s = s.replace(/[_\-.]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
    if (!/[a-zA-Z]{2,}/.test(s)) return "";
    if (/^(name|value|type|class|style)$/i.test(s)) return "";
    return s.replace(/\b([a-z])/g, function(m) {
      return m.toUpperCase();
    });
  }
  function textFromLabelEl(lbl) {
    if (!lbl) return "";
    try {
      if (lbl.querySelector && lbl.querySelector("input,select,textarea,button")) {
        var clone = lbl.cloneNode(true);
        clone.querySelectorAll("input,select,textarea,button").forEach(function(e) {
          e.remove();
        });
        return cleanLabelText(clone.textContent);
      }
    } catch (e) {
    }
    return cleanLabelText(lbl.textContent);
  }
  function getLabel(el) {
    if (!el) return "";
    if (el.id) {
      try {
        var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        var t1 = textFromLabelEl(lbl);
        if (isGoodLabel(t1)) return t1;
      } catch (e) {
      }
    }
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && isGoodLabel(cleanLabelText(ariaLabel))) return cleanLabelText(ariaLabel);
    var labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      var parts = String(labelledBy).trim().split(/\s+/).filter(Boolean);
      var joined = parts.map(function(id) {
        var lEl = document.getElementById(id);
        return lEl ? cleanLabelText(lEl.textContent) : "";
      }).filter(Boolean).join(" ");
      if (isGoodLabel(joined)) return joined;
    }
    var wrappingLabel = el.closest && el.closest("label");
    if (wrappingLabel) {
      var tWrap = textFromLabelEl(wrappingLabel);
      if (isGoodLabel(tWrap)) return tWrap;
    }
    var fieldset = el.closest && el.closest("fieldset");
    if (fieldset) {
      var legend = fieldset.querySelector(":scope > legend, legend");
      var tLeg = cleanLabelText(legend && legend.textContent);
      if (isGoodLabel(tLeg) && tLeg.length < 120) return tLeg;
    }
    var cell = el.closest && el.closest("td,th");
    if (cell) {
      var prevCell = cell.previousElementSibling;
      while (prevCell) {
        if (/^(TD|TH)$/i.test(prevCell.tagName)) {
          var tCell = cleanLabelText(prevCell.textContent);
          if (isGoodLabel(tCell)) return tCell.slice(0, 80);
        }
        prevCell = prevCell.previousElementSibling;
      }
    }
    var container = el.closest && el.closest([
      ".form-group",
      ".form-field",
      ".field-wrapper",
      ".input-group",
      ".form-floating",
      ".mb-3",
      ".mb-2",
      ".row",
      "mat-form-field",
      "mat-radio-group",
      '[class*="form-row"]',
      '[class*="field-row"]',
      '[class*="FormField"]',
      "ion-item",
      "ion-input",
      "dt",
      "dd"
    ].join(","));
    if (container) {
      var cLbl = container.querySelector([
        "label",
        "mat-label",
        ".mat-mdc-floating-label",
        ".mat-form-field-label",
        ".label",
        ".field-label",
        ".control-label",
        ".form-label",
        "legend",
        '[class*="label"]'
      ].join(","));
      var tCont = textFromLabelEl(cLbl);
      if (isGoodLabel(tCont) && tCont.length < 120) return tCont;
    }
    var p = el.parentElement;
    var hop = 0;
    while (p && hop < 5) {
      var pLbl = p.querySelector([
        ":scope > label",
        ":scope > .label",
        ":scope > .field-label",
        ":scope > .control-label",
        ":scope > .form-label",
        ":scope > mat-label",
        ":scope > .mat-mdc-floating-label",
        ":scope > legend",
        ":scope > span.label",
        ":scope > div.label"
      ].join(", "));
      if (pLbl && pLbl !== el) {
        var tHop = textFromLabelEl(pLbl);
        if (isGoodLabel(tHop) && tHop.length < 120) return tHop;
      }
      p = p.parentElement;
      hop++;
    }
    var prev = el.previousElementSibling;
    if (prev && ["LABEL", "SPAN", "DIV", "P", "STRONG", "B", "LEGEND"].includes(prev.tagName)) {
      var pt = cleanLabelText(prev.textContent);
      if (isGoodLabel(pt) && pt.length < 80 && !(prev.querySelector && prev.querySelector("input,select,textarea"))) {
        return pt;
      }
    }
    var dataCandidates = [
      el.getAttribute("data-label"),
      el.getAttribute("data-field-label"),
      el.getAttribute("data-displayname"),
      el.getAttribute("data-display-name"),
      el.getAttribute("data-name"),
      el.getAttribute("title")
    ];
    for (var di = 0; di < dataCandidates.length; di++) {
      var dt = cleanLabelText(dataCandidates[di]);
      if (isGoodLabel(dt) && dt.length < 80) return dt;
    }
    if (el.placeholder && isGoodLabel(el.placeholder) && el.placeholder.length < 60) {
      return cleanLabelText(el.placeholder);
    }
    var fromName = humanizeAttr(el.getAttribute("name") || el.name || "");
    if (isGoodLabel(fromName)) return fromName;
    var fromId = humanizeAttr(el.id || "");
    if (isGoodLabel(fromId)) return fromId;
    var fromFcn = humanizeAttr(el.getAttribute("formcontrolname") || "");
    if (isGoodLabel(fromFcn)) return fromFcn;
    return "";
  }
  window.ccDomUtils = {
    getLabel,
    isVisible,
    isGoodLabel,
    humanizeAttr
  };
})();

/* ==== label-utils.ts ==== */
const SEMANTIC_ALIASES = {
  "full name": "name",
  "candidate name": "name",
  "applicant name": "name",
  "student name": "name",
  "name of candidate": "name",
  "name of applicant": "name",
  "candidates name": "name",
  "applicants name": "name",
  "date of birth": "dob",
  "birth date": "dob",
  "dob": "dob",
  "date of birth ddmmyyyy": "dob",
  "fathers name": "father_name",
  "father name": "father_name",
  "fathers husbands name": "father_name",
  "mothers name": "mother_name",
  "mother name": "mother_name",
  "aadhaar no": "aadhaar_number",
  "aadhaar number": "aadhaar_number",
  "aadhar no": "aadhaar_number",
  "pan no": "pan_number",
  "pan number": "pan_number",
  "pan card": "pan_number",
  "mobile no": "mobile",
  "mobile number": "mobile",
  "phone no": "mobile",
  "contact no": "mobile",
  "email id": "email",
  "email address": "email",
  "permanent address": "address",
  "residential address": "address",
  "correspondence address": "address",
  "pin code": "pincode",
  "postal code": "pincode",
  "pincode": "pincode",
  "state name": "state",
  "district name": "district"
};
function normalizeLabel(label) {
  return (label || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}
function getSemanticKey(label) {
  const n = normalizeLabel(label);
  return SEMANTIC_ALIASES[n] || n;
}
function calcConfidence(fills, corrections) {
  if (fills + corrections === 0) return 0.5;
  return fills / (fills + corrections * 3);
}
function normalizeFieldLabel(label) {
  return (label || "").replace(/\n/g, " ").replace(/^\d+\.\s*/, "").replace(/^[a-z]\.\s*/i, "").replace(/\*$/, "").trim();
}

/* ==== option-match.ts ==== */
;
(function() {
  "use strict";
  function norm(s) {
    return (s == null ? "" : String(s)).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  var DEFAULT_SYNONYMS = [
    ["intermediate", "higher secondary", "10+2", "12th", "hsc", "senior secondary", "plus two"],
    ["matriculation", "10th", "sslc", "secondary", "high school", "class 10", "class x"],
    ["graduation", "graduate", "degree", "bachelor", "ug", "under graduate"],
    ["post graduation", "post graduate", "masters", "pg", "post-graduate"],
    ["general", "gen", "ur", "unreserved"],
    ["obc", "other backward class", "other backward classes"],
    ["sc", "scheduled caste"],
    ["st", "scheduled tribe"],
    ["male", "m", "\u092A\u0941\u0930\u0941\u0937"],
    ["female", "f", "\u092E\u0939\u093F\u0932\u093E", "\u0938\u094D\u0924\u094D\u0930\u0940"],
    ["other", "transgender", "third gender"]
  ];
  function ccMatchOption(value, options, config) {
    if (value == null || !options || !options.length) return null;
    config = config || {};
    var v = String(value).trim();
    var vn = norm(v);
    if (!vn) return null;
    var excludePlaceholders = config.excludePlaceholders !== false;
    var opts = options.map(function(o) {
      if (typeof o === "string") return { text: o, value: o, _original: o };
      return { text: o.text || o.label || "", value: o.value || "", _original: o };
    });
    if (excludePlaceholders) {
      opts = opts.filter(function(o) {
        if (!o.value || o.value === "0" || o.value === "-1" || o.value === "") return false;
        var t = (o.text || "").toLowerCase();
        if (t.includes("select") || t.includes("choose") || t.includes("loading") || t === "--") return false;
        return true;
      });
    }
    if (!opts.length) return null;
    var translations = config.translations;
    if (translations) {
      var tr = translations[v] || translations[vn] || translations[value];
      if (tr) {
        var trn = norm(tr);
        var hit = opts.find(function(o) {
          return norm(o.text) === trn || norm(o.value) === trn;
        });
        if (hit) return hit._original;
      }
    }
    var hit = opts.find(function(o) {
      return o.value.toLowerCase().trim() === v.toLowerCase().trim();
    });
    if (hit) return hit._original;
    hit = opts.find(function(o) {
      return norm(o.text) === vn;
    });
    if (hit) return hit._original;
    hit = opts.find(function(o) {
      return norm(o.value) === vn;
    });
    if (hit) return hit._original;
    var extraValues = config.extraValues;
    if (extraValues && extraValues.length) {
      var extras = extraValues.map(function(e) {
        return norm(e);
      });
      hit = opts.find(function(o) {
        return extras.includes(o.value.toLowerCase()) || extras.includes(norm(o.text));
      });
      if (hit) return hit._original;
    }
    if (vn.length > 2) {
      hit = opts.find(function(o) {
        return norm(o.text).startsWith(vn);
      });
      if (hit) return hit._original;
      hit = opts.find(function(o) {
        var on = norm(o.text);
        return on.length > 2 && vn.startsWith(on);
      });
      if (hit) return hit._original;
    }
    if (vn.length > 3) {
      hit = opts.find(function(o) {
        return norm(o.text).includes(vn);
      });
      if (hit) return hit._original;
      hit = opts.find(function(o) {
        var on = norm(o.text);
        return on.length > 3 && vn.includes(on);
      });
      if (hit) return hit._original;
    }
    var vWords = vn.split(" ").filter(function(w) {
      return w.length > 1;
    });
    if (vWords.length > 0) {
      var scored = opts.filter(function(o) {
        var on = norm(o.text);
        return vWords.every(function(w) {
          return on.includes(w);
        });
      });
      if (scored.length === 1) return scored[0]._original;
      if (scored.length > 1) {
        scored.sort(function(a, b) {
          return a.text.length - b.text.length;
        });
        return scored[0]._original;
      }
    }
    var synonymGroups = (config.synonymGroups || []).concat(DEFAULT_SYNONYMS);
    for (var gi = 0; gi < synonymGroups.length; gi++) {
      var group = synonymGroups[gi];
      var vInGroup = group.some(function(s) {
        return vn.includes(s) || s.includes(vn);
      });
      if (!vInGroup) continue;
      hit = opts.find(function(o) {
        var on = norm(o.text);
        return group.some(function(s) {
          return on.includes(s) || s.includes(on);
        });
      });
      if (hit) return hit._original;
    }
    return null;
  }
  window.ccMatchOption = ccMatchOption;
  window.ccMatchOption._norm = norm;
  window.ccMatchOption._DEFAULT_SYNONYMS = DEFAULT_SYNONYMS;
})();

/* ==== select-apply.ts ==== */
;
(function() {
  "use strict";
  function ccApplySelect(el, opt) {
    el.focus();
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    Array.from(el.options).forEach(function(o) {
      o.selected = false;
    });
    opt.selected = true;
    el.selectedIndex = opt.index;
    var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
    if (nativeSetter) nativeSetter.set.call(el, opt.value);
    else el.value = opt.value;
    ["mousedown", "mouseup", "click", "input", "change"].forEach(function(ev) {
      el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }));
    });
    if (typeof el.onchange === "function") {
      try {
        el.onchange.call(el, new Event("change"));
      } catch (e) {
      }
    }
    if (typeof $ !== "undefined") {
      try {
        $(el).trigger("change");
      } catch (e) {
      }
    }
    try {
      el.dispatchEvent(new Event("propertychange", { bubbles: true }));
    } catch (e) {
    }
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    var _rv = opt.value;
    var _ri = opt.index;
    setTimeout(function() {
      if (el.value !== _rv) {
        el.selectedIndex = _ri;
        el.value = _rv;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, 3500);
    return true;
  }
  window.ccApplySelect = ccApplySelect;
})();

/* ==== llm-client.ts ==== */
;
(function() {
  "use strict";
  var DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
  var DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";
  var DEFAULT_MAX_TOKENS = 500;
  var DEFAULT_TIMEOUT = 12e3;
  async function call(opts) {
    if (!opts || !opts.apiKey) {
      return { text: "", usage: null, raw: null, error: "no-api-key" };
    }
    var url = opts.baseUrl || DEFAULT_BASE_URL;
    var model = opts.model || DEFAULT_MODEL;
    var maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
    var timeout = opts.timeout || DEFAULT_TIMEOUT;
    var messages = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    messages.push({ role: "user", content: opts.userPrompt });
    var body = {
      model,
      messages,
      max_tokens: maxTokens
    };
    if (opts.temperature !== void 0) {
      body.temperature = opts.temperature;
    }
    var controller = new AbortController();
    var timer = setTimeout(function() {
      controller.abort();
    }, timeout);
    try {
      var res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + opts.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        var errText = "";
        try {
          errText = await res.text();
        } catch (e) {
        }
        return { text: "", usage: null, raw: null, error: "http-" + res.status, detail: errText };
      }
      var data = await res.json();
      var text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "";
      var usage = data && data.usage || null;
      return { text, usage, raw: data, error: null };
    } catch (e) {
      clearTimeout(timer);
      var errMsg = e.name === "AbortError" ? "timeout" : e.message;
      return { text: "", usage: null, raw: null, error: errMsg };
    }
  }
  function parseJSON(text) {
    if (!text) return null;
    var stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    var match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      try {
        var fixed = match[0].replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(fixed);
      } catch (e2) {
        return null;
      }
    }
  }
  window.ccLLM = {
    call,
    parseJSON,
    DEFAULT_BASE_URL,
    DEFAULT_MODEL
  };
})();

/* ==== semantic-aliases.ts ==== */
;
(function() {
  "use strict";
  var aliases = {};
  var _loaded = false;
  var _source = "none";
  async function load(backendUrl, token) {
    if (!backendUrl) return false;
    try {
      var headers = { "Authorization": "Bearer " + token };
      var res = await fetch(backendUrl + "/settings/semantic-aliases", { headers });
      if (res.ok) {
        var data = await res.json();
        if (data && typeof data === "object") {
          var serviceAliases = data.aliases || data;
          replace(serviceAliases);
          _loaded = true;
          _source = "service";
          return true;
        }
      }
    } catch (e) {
      try {
        var cached = localStorage.getItem("cc_semantic_aliases");
        if (cached) {
          replace(JSON.parse(cached));
          _loaded = true;
          _source = "cache";
          return true;
        }
      } catch (e2) {
      }
    }
    return false;
  }
  function merge(newAliases) {
    if (!newAliases || typeof newAliases !== "object") return;
    for (var key in newAliases) {
      if (!aliases[key]) {
        aliases[key] = newAliases[key];
      } else {
        var existing = aliases[key];
        newAliases[key].forEach(function(a) {
          if (existing.indexOf(a) === -1) existing.push(a);
        });
      }
    }
    _cacheAliases();
  }
  function replace(newAliases) {
    if (!newAliases || typeof newAliases !== "object") return;
    for (var k in aliases) delete aliases[k];
    for (var key in newAliases) aliases[key] = newAliases[key];
    _cacheAliases();
  }
  function _cacheAliases() {
    try {
      if (Object.keys(aliases).length > 0) {
        localStorage.setItem("cc_semantic_aliases", JSON.stringify(aliases));
      }
    } catch (e) {
    }
  }
  function getAll() {
    return aliases;
  }
  function status() {
    return { loaded: _loaded, source: _source, count: Object.keys(aliases).length };
  }
  window.ccSemanticAliases = {
    aliases,
    load,
    merge,
    replace,
    getAll,
    status
  };
})();

/* ==== legacy-fill-gate.ts ==== */
(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.CcLegacyFillGate = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const STORAGE_KEY = "allowLegacyClientFill";
  function isLegacyClientFillAllowed(_storageSlice) {
    return false;
  }
  function legacyClientFillDenied(pathName) {
    const name = pathName || "legacy client fill";
    return {
      ok: false,
      code: "legacy_client_fill_disabled",
      error: name + " is permanently disabled (Phase 4.1). Use side-panel Fill (server plan)."
    };
  }
  return {
    STORAGE_KEY,
    isLegacyClientFillAllowed,
    legacyClientFillDenied
  };
});
