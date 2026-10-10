/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/extractor
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== form-context.ts ==== */
(function(root2) {
  "use strict";
  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;
  function isJourneyLike(el, labelHint) {
    if (!el) return false;
    var blob = [
      labelHint || "",
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("placeholder"),
      el.placeholder,
      el.id,
      el.name,
      typeof el.className === "string" ? el.className : "",
      el.getAttribute && el.getAttribute("data-testid")
    ].filter(Boolean).join(" ");
    return JOURNEY_RE.test(blob);
  }
  function isInSkipContext(el) {
    if (!el || !el.closest) return false;
    if (el.closest('nav,header,footer,[role="navigation"],[role="banner"]')) return true;
    var searchHost = el.closest('[role="search"]');
    if (!searchHost) return false;
    if (isJourneyLike(el) || isJourneyLike(searchHost)) return false;
    return true;
  }
  function isGoodLabel(s, ccDomUtils) {
    if (ccDomUtils && typeof ccDomUtils.isGoodLabel === "function") {
      return ccDomUtils.isGoodLabel(s);
    }
    if (!s || typeof s !== "string") return false;
    const t = s.trim();
    return t.length >= 2 && /[a-zA-Z0-9]/.test(t);
  }
  function hasFormContext(doc, ccDomUtils) {
    const forms = doc.querySelectorAll("form");
    if (forms.length > 0) return true;
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],input[type="search"],input[type="date"],input:not([type]),textarea,[role="combobox"]'
    );
    let labeled = 0;
    inputs.forEach(function(el) {
      if (isInSkipContext(el)) return;
      const lbl = ccDomUtils && typeof ccDomUtils.getLabel === "function" ? ccDomUtils.getLabel(el) : el.getAttribute && el.getAttribute("aria-label") || el.placeholder || "";
      if (lbl || isJourneyLike(el, lbl)) labeled++;
    });
    return labeled >= 2;
  }
  root2.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext, isJourneyLike };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof globalThis !== "undefined" ? globalThis : root).CcFormContext;
}

/* ==== scan-standard-fields.ts ==== */
(function(root2) {
  "use strict";
  var INPUT_SELECTOR = 'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="search"],input[type="file"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select';
  var SKIP_META_HARD_RE = /captcha|otp|token|csrf|recaptcha/i;
  var SKIP_META_SOFT_RE = /search|query|filter/i;
  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;
  var AGREEMENT_RE = /\b(i\s+)?(agree|accept|confirm|declare|certify|consent|terms|self.declaration)\b/i;
  function isJourneyMeta(meta, label) {
    return JOURNEY_RE.test(String(meta || "") + " " + String(label || ""));
  }
  function makeSelector(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    if (el.name) return '[name="' + el.name + '"]';
    return null;
  }
  function makeRadioSelector(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    return '[name="' + el.name + '"][value="' + el.value + '"]';
  }
  function resolveRadioGroupLabel(el, isGoodLabel) {
    const fieldset = el.closest("fieldset");
    const legend = fieldset && fieldset.querySelector("legend");
    if (legend && isGoodLabel(legend.textContent.trim())) {
      return legend.textContent.trim();
    }
    const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div');
    if (container) {
      const lbl = container.querySelector("label,.label,.field-label,td:first-child");
      if (lbl && !lbl.querySelector("input") && isGoodLabel(lbl.textContent.trim())) {
        return lbl.textContent.trim();
      }
    }
    return "";
  }
  function resolveCheckboxGroupLabel(el, isGoodLabel) {
    const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div,fieldset');
    if (container) {
      const legend = container.querySelector("legend");
      const lbl = legend || container.querySelector("label:not(:has(input)),.label,.field-label");
      if (lbl && isGoodLabel(lbl.textContent.trim())) return lbl.textContent.trim();
    }
    return "";
  }
  function scan(doc, helpers) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var formFields = [];
    var labelList = [];
    var radioGroups = {};
    var checkboxGroups = {};
    var idx = 0;
    var inputs = doc.querySelectorAll(INPUT_SELECTOR);
    inputs.forEach(function(el) {
      var t = el.type;
      if (t === "hidden" || t === "submit" || t === "button" || t === "password" || t === "image" || t === "reset") return;
      if (t === "search") {
        var earlyLbl = getLabel(el) || el.placeholder || "";
        var earlyMeta = ((el.id || "") + " " + (el.name || "") + " " + (el.className || "")).toLowerCase();
        if (!isJourneyMeta(earlyMeta, earlyLbl)) return;
      }
      if (isInSkipContext(el)) return;
      var meta = ((el.id || "") + " " + (el.name || "") + " " + (el.className || "")).toLowerCase();
      if (SKIP_META_HARD_RE.test(meta)) return;
      if (SKIP_META_SOFT_RE.test(meta) && !isJourneyMeta(meta, getLabel(el) || el.placeholder || "")) return;
      if (t === "radio" && el.name) {
        if (!radioGroups[el.name]) {
          radioGroups[el.name] = {
            options: [],
            selectors: [],
            groupLabel: resolveRadioGroupLabel(el, isGoodLabel),
            index: idx,
            firstEl: el
          };
        }
        radioGroups[el.name].options.push(getLabel(el) || el.value || "");
        radioGroups[el.name].selectors.push(makeRadioSelector(el));
        idx++;
        return;
      }
      if (t === "checkbox" && el.name) {
        var lbl = getLabel(el) || el.value || "";
        if (AGREEMENT_RE.test(lbl)) {
          var sel = makeSelector(el) || '[name="' + el.name + '"]';
          formFields.push({
            selector: sel,
            id: el.id,
            name: el.name,
            value: el.value,
            placeholder: "",
            label: lbl,
            type: "checkbox-agreement",
            index: idx,
            options: null,
            _el: el
          });
          idx++;
          return;
        }
        if (!checkboxGroups[el.name]) {
          checkboxGroups[el.name] = {
            options: [],
            selectors: [],
            groupLabel: resolveCheckboxGroupLabel(el, isGoodLabel),
            index: idx,
            firstEl: el
          };
        }
        checkboxGroups[el.name].options.push(lbl);
        checkboxGroups[el.name].selectors.push(makeRadioSelector(el));
        idx++;
        return;
      }
      var label = getLabel(el);
      if (!label && helpers.humanizeAttr) {
        label = helpers.humanizeAttr(el.name || el.id || "") || "";
      } else if (!label && typeof window !== "undefined" && window.ccDomUtils && window.ccDomUtils.humanizeAttr) {
        label = window.ccDomUtils.humanizeAttr(el.name || el.id || "") || "";
      }
      var selector = makeSelector(el) || "form-field-" + idx;
      if (el.tagName === "SELECT") {
        var options = Array.from(el.querySelectorAll("option")).map(function(o) {
          return o.textContent.trim();
        }).filter(function(t2) {
          return t2 && !/^(select|choose|--)/i.test(t2);
        });
        if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
        formFields.push({
          selector,
          id: el.id,
          name: el.name,
          value: el.value,
          placeholder: el.placeholder || "",
          label,
          type: "dropdown",
          index: idx,
          options: options.length > 0 ? options : null,
          _el: el
        });
        idx++;
        return;
      }
      var type = el.type || "text";
      if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector,
        id: el.id,
        name: el.name,
        value: el.value,
        placeholder: el.placeholder || "",
        label,
        type,
        index: idx,
        options: null,
        _el: el
      });
      idx++;
    });
    for (var rname in radioGroups) {
      var rg = radioGroups[rname];
      var groupLabel = rg.groupLabel || rg.options.join(" / ");
      if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector: '[name="' + rname + '"]',
        id: "",
        name: rname,
        value: "",
        placeholder: "",
        label: groupLabel,
        type: "radio-group",
        index: rg.index,
        options: rg.options,
        optionSelectors: rg.selectors,
        _el: rg.firstEl
      });
    }
    for (var cname in checkboxGroups) {
      var cg = checkboxGroups[cname];
      var cgLabel = cg.groupLabel || cg.options.join(" / ");
      if (cgLabel) labelList.push(cgLabel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector: '[name="' + cname + '"]',
        id: "",
        name: cname,
        value: "",
        placeholder: "",
        label: cgLabel,
        type: "checkbox-group",
        index: cg.index,
        options: cg.options,
        optionSelectors: cg.selectors,
        _el: cg.firstEl
      });
    }
    return { formFields, labelList };
  }
  root2.CcScanStandardFields = { scan };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcScanStandardFields;

/* ==== scan-mat-widgets.ts ==== */
(function(root2) {
  "use strict";
  function makeSelector(el, fallbackId) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    return '[data-cc-id="' + fallbackId + '"]';
  }
  function isAlreadyCaptured(el, existingFields) {
    var sel = el.id ? el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id : el.name ? '[name="' + el.name + '"]' : null;
    if (!sel) return false;
    return existingFields.some(function(f) {
      return f.selector === sel;
    });
  }
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === "number" ? startIdx : 1e4;
    var formFields = [];
    var labelList = [];
    function matFieldLabel(el) {
      var label = getLabel(el) || el.getAttribute("aria-label") || "";
      if (isGoodLabel(label)) return label.trim();
      var field = el.closest && el.closest("mat-form-field, mat-radio-group");
      if (field) {
        var ml = field.querySelector("mat-label, .mat-mdc-floating-label, .mat-form-field-label, label, legend");
        if (ml) {
          var t = (ml.textContent || "").replace(/\s+/g, " ").trim();
          if (isGoodLabel(t)) return t;
        }
        var al = field.getAttribute("aria-label");
        if (al && isGoodLabel(al)) return al.trim();
      }
      var fcn = el.getAttribute("formcontrolname") || "";
      if (helpers.humanizeAttr) {
        var h = helpers.humanizeAttr(fcn || el.name || el.id || "");
        if (isGoodLabel(h)) return h;
      } else if (typeof window !== "undefined" && window.ccDomUtils && window.ccDomUtils.humanizeAttr) {
        var h2 = window.ccDomUtils.humanizeAttr(fcn || el.name || el.id || "");
        if (isGoodLabel(h2)) return h2;
      }
      return "";
    }
    doc.querySelectorAll("mat-select,mat-form-field select").forEach(function(el) {
      if (isInSkipContext(el)) return;
      if (el.tagName === "SELECT" && isAlreadyCaptured(el, existingFields)) return;
      var label = matFieldLabel(el);
      if (!isGoodLabel(label)) return;
      var id = el.id || "mat-select-" + idx;
      if (!el.id) el.setAttribute("data-cc-id", id);
      var type = el.tagName === "SELECT" ? "select" : "mat-select";
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector: makeSelector(el, id),
        id,
        name: el.getAttribute("formcontrolname") || el.name || "",
        value: "",
        placeholder: "",
        label,
        type,
        index: idx++,
        _el: el
      });
    });
    doc.querySelectorAll("mat-checkbox").forEach(function(el) {
      if (isInSkipContext(el)) return;
      var label = matFieldLabel(el) || el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var id = el.id || "mat-cb-" + idx;
      if (!el.id) el.setAttribute("data-cc-id", id);
      formFields.push({
        selector: makeSelector(el, id),
        id,
        name: "",
        value: "",
        placeholder: "",
        label,
        type: "mat-checkbox",
        index: idx++,
        _el: el
      });
    });
    doc.querySelectorAll("mat-radio-button").forEach(function(el) {
      if (isInSkipContext(el)) return;
      var optionText = el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(optionText)) return;
      var group = el.closest("mat-radio-group");
      var name = el.getAttribute("name") || group && group.getAttribute("formcontrolname") || "";
      var groupLabel = "";
      if (group) {
        groupLabel = matFieldLabel(group) || group.getAttribute("aria-label") || "";
        if (!isGoodLabel(groupLabel)) {
          var node = group.parentElement;
          var hops = 0;
          while (node && hops < 4 && !isGoodLabel(groupLabel)) {
            var cand = node.querySelector(":scope > label, :scope > mat-label, :scope > legend, :scope > .label, :scope > .field-label");
            if (cand) {
              var ct = (cand.textContent || "").replace(/\s+/g, " ").trim();
              if (isGoodLabel(ct) && ct.toLowerCase() !== optionText.toLowerCase()) groupLabel = ct;
            }
            node = node.parentElement;
            hops++;
          }
        }
      }
      var label = isGoodLabel(groupLabel) ? groupLabel : optionText;
      var id = el.id || "mat-rb-" + idx;
      if (!el.id) el.setAttribute("data-cc-id", id);
      formFields.push({
        selector: makeSelector(el, id),
        id,
        name,
        value: optionText,
        placeholder: "",
        label,
        type: "mat-radio",
        index: idx++,
        _el: el,
        optionLabel: optionText
      });
    });
    return { formFields, labelList };
  }
  root2.CcScanMatWidgets = { scan };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcScanMatWidgets;

/* ==== scan-ng-dropdowns.ts ==== */
(function(root2) {
  "use strict";
  var NG_TRIGGER_SEL = ".value-area, .select-type, .ng-value-container, .ng-select-container";
  var NG_CONTAINER_SEL = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, [class*="custom-dropdown"], [class*="select-control"]';
  function isAlreadyCaptured(el, existingFields) {
    return existingFields.some(function(f) {
      try {
        if (el.matches && el.matches(f.selector)) return true;
        if (el.querySelector && el.querySelector(f.selector)) return true;
        if (el.closest && el.closest(f.selector)) return true;
        return false;
      } catch (e) {
        return false;
      }
    });
  }
  function resolveLabel(el, getLabel) {
    var label = (getLabel(el) || el.getAttribute("aria-label") || "").trim();
    if (!label) {
      var childLabel = el.querySelector && el.querySelector(
        ':scope > .label, :scope > label, :scope > .field-label, :scope > [class*="label"]'
      );
      if (childLabel) label = childLabel.textContent.trim();
    }
    if (!label) {
      var all = el.querySelectorAll && el.querySelectorAll('.label, .field-label, [class*="label"]');
      if (all) {
        var dl = Array.from(all).find(function(n) {
          return !(n.closest && n.closest(".value-area, .options-list, .ng-dropdown-panel, .dropdown-options"));
        });
        if (dl) label = dl.textContent.trim();
      }
    }
    return (label || "").replace(/\s+/g, " ").trim();
  }
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === "number" ? startIdx : 1e4;
    var formFields = [];
    var labelList = [];
    var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|city|date)\b/i;
    doc.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(function(el) {
      if (el.tagName === "INPUT" || el.tagName === "SELECT") return;
      if (isInSkipContext(el)) return;
      var meta = ((el.id || "") + " " + (el.className || "")).toLowerCase();
      var label = getLabel(el) || el.getAttribute("aria-label") || "";
      if (/search|query|filter/i.test(meta) && !JOURNEY_RE.test(meta + " " + label)) return;
      if (!isGoodLabel(label) && !JOURNEY_RE.test(meta + " " + label)) return;
      if (!isGoodLabel(label) && JOURNEY_RE.test(meta)) {
        label = label || meta.replace(/[_-]+/g, " ").trim().slice(0, 40);
      }
      if (!isGoodLabel(label)) return;
      var tagLower = el.tagName.toLowerCase();
      var isNg = tagLower === "ng-select" || el.classList && (el.classList.contains("ng-select") || el.classList.contains("ng-dropdown"));
      var type = isNg ? "ng-dropdown" : "mat-select";
      var id = el.id || "combobox-" + idx;
      if (!el.id) el.setAttribute("data-cc-id", id);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector: el.id ? el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id : '[data-cc-id="' + id + '"]',
        id,
        name: el.getAttribute("formcontrolname") || "",
        value: "",
        placeholder: "",
        label,
        type,
        index: idx++,
        _el: el
      });
    });
    var ngCandidates = /* @__PURE__ */ new Set();
    doc.querySelectorAll(NG_CONTAINER_SEL).forEach(function(el) {
      ngCandidates.add(el);
    });
    doc.querySelectorAll(NG_TRIGGER_SEL).forEach(function(trigger) {
      var container = trigger.closest && trigger.closest(
        'mat-form-field, .form-field, .form-group, [class*="dropdown"], [class*="select"]'
      );
      if (!container) container = trigger.parentElement;
      if (container && container !== doc.body) ngCandidates.add(container);
    });
    ngCandidates.forEach(function(el) {
      if (isInSkipContext(el)) return;
      if (isAlreadyCaptured(el, existingFields.concat(formFields))) return;
      var label = resolveLabel(el, getLabel);
      if (!isGoodLabel(label)) return;
      var ddId = "ng-dd-" + idx;
      el.setAttribute("data-cc-id", ddId);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector: '[data-cc-id="' + ddId + '"]',
        id: ddId,
        name: el.getAttribute("formcontrolname") || el.getAttribute("name") || "",
        value: "",
        placeholder: "",
        label,
        type: "ng-dropdown",
        index: idx++,
        _el: el
      });
    });
    return { formFields, labelList };
  }
  root2.CcScanNgDropdowns = { scan };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcScanNgDropdowns;

/* ==== sort-fields-visual.ts ==== */
(function(root2) {
  "use strict";
  var ROW_BAND = 8;
  function visualPos(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return { row: 1e9, left: 1e9 };
    }
    var r = el.getBoundingClientRect();
    var top = r.top + (typeof window !== "undefined" && window.pageYOffset || 0);
    var left = r.left + (typeof window !== "undefined" && window.pageXOffset || 0);
    if (r.width === 0 && r.height === 0 && top === 0 && left === 0) {
      return { row: 1e9, left: 1e9 };
    }
    return { row: Math.round(top / ROW_BAND), left: Math.round(left) };
  }
  function sort(formFields) {
    formFields.forEach(function(f) {
      f._pos = visualPos(f._el);
    });
    formFields.sort(function(a, b) {
      return a._pos.row - b._pos.row || a._pos.left - b._pos.left;
    });
    formFields.forEach(function(f, i) {
      f.index = i;
      delete f._pos;
    });
    return formFields;
  }
  root2.CcSortFieldsVisual = { sort, ROW_BAND };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcSortFieldsVisual;

/* ==== fingerprint-form.ts ==== */
(function(root2) {
  "use strict";
  function djb2(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
  function fingerprint(formFields, labelList, opts) {
    opts = opts || {};
    var hostname = opts.hostname || "";
    var title = opts.title || "";
    var ccModels = opts.ccModels || null;
    var labelSig = labelList.slice().sort().slice(0, 10).join("|");
    var formKey = djb2(hostname + "::" + title + "::" + labelSig);
    var semanticLabels = formFields.map(function(f) {
      return (f.label || "").toLowerCase().replace(/[^a-z\s]/g, "").trim();
    }).filter(function(l) {
      return l.length > 2;
    }).sort().slice(0, 15);
    var semRaw = hostname + "|" + semanticLabels.join("|");
    var semanticFormKey = "s_" + djb2(semRaw);
    var pageModel = null;
    if (ccModels && typeof ccModels.createPageModel === "function") {
      pageModel = ccModels.createPageModel(
        { formFields, formKey, semanticFormKey },
        { url: opts.url || "", hostname, title }
      );
    }
    formFields.forEach(function(f) {
      delete f._el;
    });
    return { formKey, semanticFormKey, pageModel };
  }
  root2.CcFingerprintForm = { fingerprint, _djb2: djb2 };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcFingerprintForm;

/* ==== correction-observer.ts ==== */
(function(root2) {
  "use strict";
  var SKIP_LABELS_RE = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  var SKIP_TYPES = ["select", "checkbox", "radio", "hidden", "submit", "button"];
  var SEMANTIC_ALIASES = {
    "full name": "name",
    "candidate name": "name",
    "applicant name": "name",
    "date of birth": "dob",
    "fathers name": "father_name",
    "mothers name": "mother_name",
    "aadhaar no": "aadhaar_number",
    "mobile no": "mobile",
    "email id": "email",
    "pin code": "pincode",
    "permanent address": "address"
  };
  function resolveEl(selector, doc) {
    if (selector.startsWith("form-field-")) {
      var i = parseInt(selector.split("-")[2]);
      var all = doc.querySelectorAll("input,select,textarea");
      return all[i] || null;
    }
    return doc.querySelector(selector);
  }
  function makeSelectorFromEl(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    return '[name="' + el.name + '"]';
  }
  function getLabelForEl(el, doc) {
    if (el.id) {
      var l = doc.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent.trim();
    }
    var td = el.closest && el.closest("td");
    if (td && td.previousElementSibling) return td.previousElementSibling.textContent.trim();
    return el.placeholder || "";
  }
  function isValidValue(semanticKey, val) {
    if (semanticKey === "dob") return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
    if (semanticKey === "pincode") return /^\d{6}$/.test(val);
    if (semanticKey === "mobile") return /^\d{10}$/.test(val);
    if (semanticKey === "aadhaar_number") return /^\d{12}$/.test(val);
    if (["name", "father_name", "mother_name"].includes(semanticKey)) return /^[a-zA-Z\s.]{2,60}$/.test(val);
    return val.length >= 2 && val.length <= 200;
  }
  function inject(mapping, filledBySource, profile, backendUrl, formKey, doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return;
    var corrections = [];
    var enrichments = [];
    for (var selector in mapping) {
      try {
        var entry = mapping[selector];
        var originalValue = entry.value;
        var info = filledBySource[selector];
        if (!info) continue;
        var el = resolveEl(selector, doc);
        if (!el) continue;
        (function(el2, originalValue2, info2) {
          el2.addEventListener("change", function() {
            var newVal = el2.value;
            if (newVal === originalValue2) return;
            var correctedKey = null;
            for (var k in profile) {
              if (profile[k] === newVal) {
                correctedKey = k;
                break;
              }
            }
            if (!correctedKey) {
              if (typeof console !== "undefined") console.debug("[CC] correction: no profileKey for value", newVal);
              return;
            }
            var already = corrections.some(function(c) {
              return c.semanticKey === info2.semanticKey && c.newKey === correctedKey;
            });
            if (already) return;
            corrections.push({ semanticKey: info2.semanticKey, oldKey: info2.profileKey, newKey: correctedKey });
            try {
              sessionStorage.setItem("_cc_corrections", JSON.stringify(corrections));
            } catch (e) {
            }
            if (!backendUrl || !formKey) return;
            clearTimeout(el2._ccTimer);
            el2._ccTimer = setTimeout(function() {
              var pending = [];
              try {
                pending = JSON.parse(sessionStorage.getItem("_cc_corrections") || "[]");
              } catch (e) {
              }
              var updates = {};
              pending.forEach(function(c) {
                if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
              });
              if (!Object.keys(updates).length) return;
              fetch(backendUrl + "/mappings/" + formKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ updates, formKey })
              }).then(function() {
                try {
                  sessionStorage.removeItem("_cc_corrections");
                } catch (e) {
                }
              }).catch(function(e) {
                if (typeof console !== "undefined") console.warn("[CC] correction save failed", e);
              });
            }, 1500);
          });
        })(el, originalValue, info);
      } catch (e) {
      }
    }
    doc.querySelectorAll("input,textarea").forEach(function(el2) {
      if (SKIP_TYPES.indexOf(el2.type) !== -1) return;
      var sel = makeSelectorFromEl(el2);
      if (mapping[sel]) return;
      var label = getLabelForEl(el2, doc);
      if (!label || SKIP_LABELS_RE.test(label)) return;
      var normalized = label.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      var semanticKey = SEMANTIC_ALIASES[normalized] || normalized;
      el2.addEventListener("blur", function() {
        var val = el2.value.trim();
        if (!val || val.length < 2) return;
        if (!isValidValue(semanticKey, val)) return;
        if (profile[semanticKey]) return;
        enrichments.push({ semanticKey, value: val, label });
        try {
          sessionStorage.setItem("_cc_enrichments", JSON.stringify(enrichments));
        } catch (e) {
        }
      });
    });
  }
  root2.CcCorrectionObserver = {
    inject,
    _isValidValue: isValidValue,
    _SEMANTIC_ALIASES: SEMANTIC_ALIASES
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = root.CcCorrectionObserver;

/* ==== extract-form-fields.ts ==== */
function extractFormFieldsWithFingerprint() {
  var _a;
  var _fc = globalThis.CcFormContext || {};
  var _ssf = globalThis.CcScanStandardFields || {};
  var _smw = globalThis.CcScanMatWidgets || {};
  var _sng = globalThis.CcScanNgDropdowns || {};
  var _sfv = globalThis.CcSortFieldsVisual || {};
  var _fp = globalThis.CcFingerprintForm || {};
  var ccDomUtils = window.ccDomUtils || {};
  var doc = document;
  var helpers = {
    isInSkipContext: function(el) {
      return _fc.isInSkipContext ? _fc.isInSkipContext(el) : !!(el.closest && el.closest('nav,header,footer,[role="navigation"],[role="banner"]'));
    },
    humanizeAttr: function(raw) {
      return ccDomUtils.humanizeAttr ? ccDomUtils.humanizeAttr(raw) : "";
    },
    getLabel: function(el) {
      if (ccDomUtils.getLabel) return ccDomUtils.getLabel(el) || "";
      var ph = (el.placeholder || "").trim();
      if (ph) return ph;
      if (ccDomUtils.humanizeAttr) {
        return ccDomUtils.humanizeAttr(el.name || el.id || el.getAttribute && el.getAttribute("formcontrolname") || "") || "";
      }
      return "";
    },
    isGoodLabel: function(s) {
      return _fc.isGoodLabel ? _fc.isGoodLabel(s, ccDomUtils) : !!(s && s.trim().length >= 2 && /[a-zA-Z0-9]/.test(s));
    }
  };
  if (_fc.hasFormContext && !_fc.hasFormContext(doc, ccDomUtils)) {
    return { formFields: [], formKey: "" };
  }
  var formFields = [];
  var labelList = [];
  if (_ssf.scan) {
    var std = _ssf.scan(doc, helpers);
    formFields = formFields.concat(std.formFields);
    labelList = labelList.concat(std.labelList);
  }
  if (_smw.scan) {
    var mat = _smw.scan(doc, formFields, helpers, 1e4);
    formFields = formFields.concat(mat.formFields);
    labelList = labelList.concat(mat.labelList);
  }
  if (_sng.scan) {
    var ng = _sng.scan(doc, formFields, helpers, 1e4 + formFields.length);
    formFields = formFields.concat(ng.formFields);
    labelList = labelList.concat(ng.labelList);
  }
  if (_sfv.sort) _sfv.sort(formFields);
  var hostname = location.hostname;
  var title = (((_a = document.querySelector("h1,h2,legend,.form-title,.page-title")) == null ? void 0 : _a.textContent) || document.title || "").trim().slice(0, 50);
  var result = { formKey: "", semanticFormKey: "", pageModel: null };
  if (_fp.fingerprint) {
    result = _fp.fingerprint(formFields, labelList, {
      hostname,
      title,
      url: location.href,
      ccModels: typeof window !== "undefined" && window.ccModels || null
    });
  }
  return {
    formFields,
    formKey: result.formKey,
    semanticFormKey: result.semanticFormKey,
    pageModel: result.pageModel
  };
}
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  var _co = globalThis.CcCorrectionObserver || {};
  if (_co.inject) {
    _co.inject(mapping, filledBySource, profile, backendUrl, formKey, document);
  }
}
