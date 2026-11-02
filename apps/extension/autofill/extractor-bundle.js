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
  function hitsControl(el, top) {
    if (!top) return false;
    if (top === el) return true;
    if (el.contains && el.contains(top)) return true;
    if (top.contains && top.contains(el)) return true;
    var id = el.id;
    if (id && top.getAttribute && top.getAttribute("for") === id) return true;
    if (id && top.closest && top.closest('label[for="' + id + '"]')) return true;
    return false;
  }
  function isVisuallyPresent(el, view) {
    if (!el) return false;
    if (typeof el.getBoundingClientRect !== "function") return true;
    var box = el.getBoundingClientRect();
    if (!box || box.width < 2 || box.height < 2) return false;
    if (typeof el.getClientRects === "function") {
      var rects = el.getClientRects();
      if (!rects || rects.length === 0) return false;
    }
    if (el.closest) {
      if (el.closest("[hidden]")) return false;
      if (el.closest('[aria-hidden="true"]')) return false;
      var details = el.closest("details");
      if (details && !details.open) return false;
    }
    var getStyle = view && view.getComputedStyle || typeof window !== "undefined" && window.getComputedStyle;
    if (typeof getStyle === "function") {
      var style = getStyle(el);
      if (style && (style.display === "none" || style.visibility === "hidden" || String(style.opacity) === "0")) return false;
    }
    var hit = view && view.elementFromPoint;
    var iw = view && view.innerWidth;
    var ih = view && view.innerHeight;
    if (typeof hit !== "function" && typeof document !== "undefined" && document.elementFromPoint) {
      hit = function(x, y) {
        return document.elementFromPoint(x, y);
      };
      iw = window.innerWidth;
      ih = window.innerHeight;
    }
    if (typeof hit === "function" && iw && ih) {
      var cx = box.left + box.width / 2;
      var cy = box.top + box.height / 2;
      var inView = cx >= 0 && cy >= 0 && cx <= iw && cy <= ih;
      var top = inView ? hit(cx, cy) : null;
      if (inView && !hitsControl(el, top) && !isAdCover(top, el)) return false;
    }
    return true;
  }
  function isAdCover(top, el) {
    if (!top || top === el) return false;
    var node = top;
    var hops = 0;
    while (node && hops < 6) {
      var tag = String(node.tagName || "").toLowerCase();
      if (tag === "iframe" || tag === "ins") return true;
      var blob = ((node.id || "") + " " + (typeof node.className === "string" ? node.className : "")).toLowerCase();
      if (/adplus|adsbygoogle|google_ads|google_vignette|ad-overlay|ad_overlay/.test(blob)) return true;
      node = node.parentElement;
      hops += 1;
    }
    return false;
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
  function isAdFrameUrl(url) {
    return /doubleclick|googlesyndication|googleads|adservice|adnxs|adplus|facebook\.com\/tr|hotjar|clarity\.ms/i.test(String(url || ""));
  }
  function sameOriginDocs(rootDoc) {
    var out = [];
    function walk(doc) {
      if (!doc || out.indexOf(doc) !== -1) return;
      var href = "";
      try {
        href = doc.location && doc.location.href || "";
      } catch (e) {
        href = "";
      }
      if (isAdFrameUrl(href)) return;
      out.push(doc);
      var frames = [];
      try {
        frames = doc.querySelectorAll("iframe,frame");
      } catch (e2) {
        return;
      }
      for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        var tag = String(frame && frame.tagName || "").toLowerCase();
        if (tag && tag !== "iframe" && tag !== "frame") continue;
        var child = null;
        try {
          child = frame.contentDocument;
        } catch (e3) {
          child = null;
        }
        if (child) walk(child);
      }
    }
    walk(rootDoc);
    return out;
  }
  function hasContentEditable(doc) {
    var nodes = [];
    try {
      nodes = doc.querySelectorAll('[contenteditable="true"],[contenteditable=""],[contenteditable]');
    } catch (e) {
      return false;
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var tag = String(el && el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") continue;
      if (el && el.isContentEditable === true) return true;
      var raw = el && el.getAttribute && el.getAttribute("contenteditable");
      if (raw == null) continue;
      raw = String(raw).toLowerCase().trim();
      if (raw === "true" || raw === "") return true;
    }
    return false;
  }
  function hasLocalFormContext(doc, ccDomUtils) {
    if (!doc || typeof doc.querySelectorAll !== "function") return false;
    const forms = doc.querySelectorAll("form");
    if (forms.length > 0) return true;
    if (hasContentEditable(doc)) return true;
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],input[type="search"],input[type="date"],input[type="number"],input[type="range"],input:not([type]),textarea,select,input[type="checkbox"],input[type="radio"],[role="combobox"],[role="checkbox"],[role="radio"]'
    );
    let labeled = 0;
    inputs.forEach(function(el) {
      if (isInSkipContext(el)) return;
      const lbl = ccDomUtils && typeof ccDomUtils.getLabel === "function" ? ccDomUtils.getLabel(el) : el.getAttribute && el.getAttribute("aria-label") || el.placeholder || "";
      if (lbl || isJourneyLike(el, lbl) || el.tagName && String(el.tagName).toLowerCase() === "select" || el.type === "number" || el.type === "range") labeled++;
    });
    return labeled >= 1;
  }
  function hasFormContext(doc, ccDomUtils) {
    var docs = sameOriginDocs(doc);
    for (var i = 0; i < docs.length; i++) {
      if (hasLocalFormContext(docs[i], ccDomUtils)) return true;
    }
    return false;
  }
  root2.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext, isJourneyLike, isVisuallyPresent, sameOriginDocs };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined" && module.exports) {
  module.exports = (typeof globalThis !== "undefined" ? globalThis : root).CcFormContext;
}

/* ==== scan-standard-fields.ts ==== */
(function(root2) {
  "use strict";
  var INPUT_SELECTOR = 'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="search"],input[type="file"],input[type="radio"],input[type="checkbox"],input[type="range"],input[type="submit"],input:not([type]),textarea,select,[contenteditable="true"],[contenteditable=""]';
  var SKIP_META_HARD_RE = /token|csrf|recaptcha/i;
  var HUMAN_GATE_RE = /captcha|otp/i;
  var SKIP_META_SOFT_RE = /search|query|filter/i;
  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;
  var AGREEMENT_RE = /\b(i\s+)?(agree|accept|confirm|declare|certify|consent|terms|self.declaration)\b/i;
  function isJourneyMeta(meta, label) {
    return JOURNEY_RE.test(String(meta || "") + " " + String(label || ""));
  }
  function isPageSearch(el) {
    if (!el) return false;
    var t = String(el.type || "").toLowerCase();
    if (t === "hidden" || t === "submit" || t === "button" || t === "password" || t === "image" || t === "reset" || t === "checkbox" || t === "radio" || t === "file") return false;
    var meta = ((el.id || "") + " " + (el.name || "") + " " + (typeof el.className === "string" ? el.className : "")).toLowerCase();
    if (SKIP_META_HARD_RE.test(meta) || HUMAN_GATE_RE.test(meta)) return false;
    if (t === "search") return true;
    if (/(^|[^a-z])(search_query|search|query)([^a-z]|$)/.test(meta) && !/(^|[^a-z])filter([^a-z]|$)/.test(meta)) return true;
    var hint = String(el.placeholder || el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title")) || "").toLowerCase();
    return /^\s*search\b/.test(hint);
  }
  function isContentEditable(el) {
    if (!el) return false;
    var tag = String(el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return false;
    if (el.isContentEditable === true) return true;
    var raw = el.getAttribute && el.getAttribute("contenteditable");
    if (raw == null) return false;
    raw = String(raw).toLowerCase().trim();
    return raw === "true" || raw === "";
  }
  function uniqueSearchSelector(el, doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    var sel = 'input[type="search"]';
    try {
      var hits = doc.querySelectorAll(sel);
      if (hits && hits.length === 1 && hits[0] === el) return sel;
    } catch (e) {
    }
    return null;
  }
  function uniqueRangeSelector(el, doc) {
    if (!doc || typeof doc.querySelectorAll !== "function") return null;
    var sel = 'input[type="range"]';
    try {
      var hits = doc.querySelectorAll(sel);
      if (hits && hits.length === 1 && hits[0] === el) return sel;
    } catch (e) {
    }
    return null;
  }
  var FORM_FIELD_QUERY = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="date"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'input[type="range"]',
    "input:not([type])",
    "textarea",
    "select"
  ].join(",");
  function domFieldIndex(doc, el) {
    if (!doc || !el || typeof doc.querySelectorAll !== "function") return -1;
    var all = doc.querySelectorAll(FORM_FIELD_QUERY);
    for (var i = 0; i < all.length; i++) {
      if (all[i] === el) return i;
    }
    return -1;
  }
  function makeSelector(el, doc) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    if (el.name) return '[name="' + el.name + '"]';
    var fcn = el.getAttribute && (el.getAttribute("formcontrolname") || el.getAttribute("ng-reflect-name"));
    if (fcn && doc && typeof doc.querySelectorAll === "function") {
      var fcnSel = '[formcontrolname="' + String(fcn).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
      try {
        var hits = doc.querySelectorAll(fcnSel);
        if (hits && hits.length === 1) return fcnSel;
      } catch (e) {
      }
    }
    var domIdx = domFieldIndex(doc, el);
    if (domIdx >= 0) return "form-field-" + domIdx;
    return null;
  }
  function makeRadioSelector(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
    return '[name="' + el.name + '"][value="' + el.value + '"]';
  }
  function attrOf(el, name) {
    if (!el) return "";
    if (el.getAttribute) {
      var v = el.getAttribute(name);
      if (v != null && String(v).trim()) return String(v).trim();
    }
    if (el[name] != null && String(el[name]).trim()) return String(el[name]).trim();
    return "";
  }
  function splitHiEn(text) {
    var raw = String(text || "").replace(/\s+/g, " ").trim();
    var hi = "";
    var en = "";
    var parts = raw.split(/\s*\/\s*/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      if (/[\u0900-\u097F]/.test(p) && !hi) hi = p;
      else if (/[A-Za-z]/.test(p) && !en) en = p;
    }
    if (!en && !hi) en = raw;
    return { labelHi: hi, labelEn: en || raw, text: raw };
  }
  function isPlaceholderOption(text, value) {
    var t = String(text || "").trim();
    var v = String(value == null ? "" : value).trim();
    if (!t) return true;
    if (/^(select|choose|--|please select|loading)/i.test(t)) return true;
    if (v === "" || v === "-1") return true;
    return false;
  }
  function collectSelectOptions(el) {
    var nodes = el && el.querySelectorAll ? el.querySelectorAll("option") : [];
    var labels = [];
    var details = [];
    for (var i = 0; i < nodes.length; i++) {
      var o = nodes[i];
      var text = String(o && (o.textContent || o.label) || "").trim();
      var value = o && o.value != null ? String(o.value) : text;
      if (isPlaceholderOption(text, value)) continue;
      var split = splitHiEn(text);
      labels.push(text);
      details.push({ value, labelHi: split.labelHi, labelEn: split.labelEn, text });
    }
    return { labels, details, dynamic: labels.length === 0 };
  }
  function nearbyText(el) {
    if (!el || !el.closest) return "";
    var row = el.closest('tr,.form-group,.form-field,[class*="form-row"],li,fieldset,div');
    if (!row || !row.querySelector) return "";
    var lbl = row.querySelector("label,.label,.field-label,legend,td:first-child,th");
    if (!lbl || lbl === el || lbl.contains && lbl.contains(el)) return "";
    var t = String(lbl.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 80) return "";
    return t;
  }
  var SYSTEM_NOISE_RE = /^(original code|cb code|location type|department level)$/i;
  var OFFICE_CAPS_RE = /^(STATE|DISTRICT|BLOCK|CIRCLE|CB CODE|LOCATION TYPE|DEPARTMENT LEVEL)$/;
  var COLLIDE_KEYS = ["state", "district", "block", "sub_division", "circle"];
  var ADDRESS_KEYS = ["state", "district", "sub_division", "block", "village", "police_station", "panchayat", "post_office", "ward", "pincode"];
  var PER_APP_KEYS = ["purpose", "apply_to_office"];
  function isSystemNoise(label) {
    return SYSTEM_NOISE_RE.test(String(label || "").trim());
  }
  function isNumericLabel(label) {
    return /^[0-9]{3,}$/.test(String(label || "").trim());
  }
  function isOfficeCapsLabel(label) {
    var lab = String(label || "").trim();
    return lab.length > 0 && lab === lab.toUpperCase() && OFFICE_CAPS_RE.test(lab);
  }
  function localBodyShowWhen(label) {
    var lab = String(label || "").trim();
    var pairs = [
      [/zilla parishad|जिला परिषद/i, "Zilla Parishad"],
      [/municipal corporation|नगर निगम/i, "Municipal Corporation"],
      [/municipal council/i, "Municipal Council"],
      [/notified area/i, "Notified Area Council"],
      [/town panchayat|नगर पंचायत/i, "Town Panchayat"],
      [/^municipality$|नगरपालिका/i, "Municipality"],
      [/^(gram panchayat|ग्राम पंचायत)$/i, "Gram Panchayat"]
    ];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i][0].test(lab)) return { local_body_type: pairs[i][1] };
    }
    return null;
  }
  function isTransliterateField(canonicalKey, label) {
    if (/_hindi$/.test(String(canonicalKey || ""))) return true;
    if (isMostlyHindi(label) && /नाम|\bname\b/i.test(String(label || "")) && !/name of applicant|applicant.?s name/i.test(String(label || ""))) return true;
    return false;
  }
  function catalogKeyOf(f) {
    var c = f && f.canonicalKey;
    if (f && f.section && c && COLLIDE_KEYS.indexOf(c) >= 0) return f.section + "." + c;
    return c || null;
  }
  function assignSections(formFields) {
    var seenOffice = false;
    for (var i = 0; i < formFields.length; i++) {
      var f = formFields[i];
      var lab = String(f.label || "").trim();
      if (f.canonicalKey === "apply_to_office" || /apply to (the )?office/i.test(lab)) {
        f.section = "office";
        seenOffice = true;
      } else if (isOfficeCapsLabel(lab) || seenOffice && COLLIDE_KEYS.indexOf(f.canonicalKey) >= 0) {
        f.section = "office";
        seenOffice = true;
      } else if (ADDRESS_KEYS.indexOf(f.canonicalKey) >= 0) {
        f.section = "address";
      }
      f.catalogKey = catalogKeyOf(f);
    }
  }
  function addLocator(locators, seen, type, value) {
    if (!value) return;
    var v = String(value).trim();
    if (!v) return;
    var k = type + ":" + v;
    if (seen[k]) return;
    seen[k] = true;
    locators.push({ type, value: v });
  }
  function buildLocators(el, doc, label, selectorFallback) {
    var locators = [];
    var seen = {};
    if (el && el.id) addLocator(locators, seen, "id", makeSelector({ id: el.id, name: "", getAttribute: function() {
      return "";
    } }, doc) || (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id));
    if (el && el.name) addLocator(locators, seen, "name", '[name="' + el.name + '"]');
    var split = splitHiEn(label || "");
    addLocator(locators, seen, "label-hi", split.labelHi);
    addLocator(locators, seen, "label-en", split.labelEn);
    addLocator(locators, seen, "placeholder", el && (el.placeholder || attrOf(el, "placeholder")));
    addLocator(locators, seen, "aria", attrOf(el, "aria-label"));
    addLocator(locators, seen, "nearby", nearbyText(el));
    var fcn = attrOf(el, "formcontrolname") || attrOf(el, "ng-reflect-name");
    if (fcn) addLocator(locators, seen, "css", '[formcontrolname="' + String(fcn).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]');
    addLocator(locators, seen, "css", selectorFallback);
    if (el && el.id) addLocator(locators, seen, "xpath", '//*[@id="' + String(el.id).replace(/"/g, '\\"') + '"]');
    return locators;
  }
  function guessCanonicalKey(label, name, id, type, options) {
    var blob = [label, name, id, type].filter(Boolean).join(" ");
    var optBlob = "";
    if (Array.isArray(options)) {
      optBlob = options.map(function(o) {
        return typeof o === "string" ? o : o && (o.text || o.labelEn || o.label || o.value) || "";
      }).join(" ");
    }
    var all = blob + " " + optBlob;
    if (/police\s*station|\bthana\b|थाना/i.test(all)) return "police_station";
    if (/post\s*office|डाकघर/i.test(all) && !/police|thana/i.test(all)) return "post_office";
    if (/\bpanchayat\b|पंचायत/i.test(blob) && !/local body|ग्राम पंचायत.*नगर|नगर पंचायत|नगर निगम/i.test(all)) return "panchayat";
    if (/local body|ग्राम पंचायत|नगर पंचायत|नगर निगम|municipal/i.test(all) && (type === "radio-group" || /local body/i.test(blob))) return "local_body_type";
    if (/\bgender\b|\bsex\b|\bling\b|पुरुष|स्त्री|तृतीय|male.*female|third\s*gender/i.test(all)) return "gender";
    if (/supporting document|document type|आधार कार्ड|राशन कार्ड/i.test(all) && (type === "radio-group" || /document/i.test(blob))) return "supporting_document_type";
    if (/आवेदक|आवेदिका का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ""))) return "name_hindi";
    if (/पिता का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ""))) return "father_name_hindi";
    if (/माता का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ""))) return "mother_name_hindi";
    if (/पति का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ""))) return "husband_name_hindi";
    if (/name of husband|husband.?s name/i.test(blob)) return "husband_name";
    if (/name of father|father.?s name/i.test(blob)) return "father_name";
    if (/name of mother|mother.?s name/i.test(blob)) return "mother_name";
    if (/name of applicant|applicant.?s name|^full name$|^candidate name$|^applicant name$/i.test(blob)) return "name";
    if (/e-?mail/i.test(blob)) return "email";
    if (/(mobile|phone|sampark|मोबाइल)/i.test(blob) && !/otp/i.test(blob)) return "mobile";
    if (/aadhaar|aadhar/i.test(blob)) return "aadhaar_number";
    if (/pin\s*code|pincode|postal code/i.test(blob)) return "pincode";
    if (/\bstate\b|राज्य/i.test(blob) && !/statement/i.test(blob)) return "state";
    if (/\bdistrict\b|जिला/i.test(blob)) return "district";
    if (/sub[\s-]*division|अनुमंडल/i.test(blob)) return "sub_division";
    if (/\bblock\b|प्रखंड/i.test(blob)) return "block";
    if (/\bvillage\b|गांव|गाँव/i.test(blob)) return "village";
    if (/\bward\b|वार्ड/i.test(blob)) return "ward";
    if (/purpose|उद्देश्य/i.test(blob)) return "purpose";
    if (/^circle$/i.test(String(label || "").trim()) || /(^|\s)circle(\s|$)/i.test(blob) && !/sub[\s-]*division|अनुमंडल/i.test(blob)) return "circle";
    if (/residence type|type of residence|स्थायी|अस्थायी/i.test(all)) return "residence_type";
    if (/photo|photograph|पासपोर्ट साइज/i.test(blob)) return "photo";
    if (/apply to (the )?office|office to apply/i.test(blob)) return "apply_to_office";
    return null;
  }
  function isMostlyHindi(label) {
    var raw = String(label || "");
    var hi = (raw.match(/[\u0900-\u097F]/g) || []).length;
    var en = (raw.match(/[A-Za-z]/g) || []).length;
    return hi >= 4 && en < 3;
  }
  function detectHumanGate(el, label, type) {
    var blob = [el && el.id, el && el.name, el && el.className, label, type].filter(Boolean).join(" ");
    if (/captcha/i.test(blob)) return "captcha";
    if (/\botp\b/i.test(blob)) return "otp";
    if (type === "file") return "upload";
    if (type === "submit") return "submit";
    if (type === "checkbox-agreement") return "agree";
    return null;
  }
  function readRules(el, label, type) {
    var rules = {};
    var maxL = el && (el.maxLength || el.maxlength || attrOf(el, "maxlength"));
    if (maxL && Number(maxL) > 0 && Number(maxL) < 1e5) rules.maxLength = Number(maxL);
    var minL = el && (el.minLength || el.minlength || attrOf(el, "minlength"));
    if (minL && Number(minL) > 0) rules.minLength = Number(minL);
    var pat = el && (el.pattern || attrOf(el, "pattern"));
    if (pat) rules.pattern = String(pat);
    var req = el && (el.required === true || el.getAttribute && el.getAttribute("required") != null && el.getAttribute("required") !== "false");
    if (req) rules.required = true;
    var blob = ((label || "") + " " + (el && el.id || "") + " " + (el && el.name || "") + " " + (type || "")).toLowerCase();
    if (/pin\s*code|pincode|postal/.test(blob)) {
      rules.digits = 6;
      if (!rules.maxLength) rules.maxLength = 6;
    }
    if (/(mobile|phone|sampark)/.test(blob) && !/otp/.test(blob)) {
      rules.digits = 10;
      if (!rules.maxLength) rules.maxLength = 10;
    }
    if (/aadhaar|aadhar/.test(blob)) {
      rules.digits = 12;
      if (!rules.maxLength) rules.maxLength = 12;
    }
    return Object.keys(rules).length ? rules : null;
  }
  function decorateField(field, el, doc) {
    if ((!field.label || isNumericLabel(field.label)) && el) {
      var nearby = nearbyText(el);
      if (nearby && !isNumericLabel(nearby)) field.label = nearby;
    }
    var locators = buildLocators(el, doc, field.label, field.selector);
    field.locators = locators;
    field.lastLocator = locators.length ? locators[0].type : null;
    field.canonicalKey = guessCanonicalKey(field.label, field.name, field.id, field.type, field.options);
    field.humanGate = detectHumanGate(el, field.label, field.type);
    field.rules = readRules(el, field.label, field.type);
    var transliterate = isTransliterateField(field.canonicalKey, field.label);
    field.transliterate = transliterate;
    var hasReadonly = !!(el && (el.readOnly === true || el.getAttribute && el.getAttribute("readonly") != null));
    var hasDisabled = !!(el && (el.disabled === true || el.getAttribute && el.getAttribute("disabled") != null && el.getAttribute("disabled") !== "false"));
    var readOnly = hasReadonly || hasDisabled;
    if (field.humanGate === "captcha" || field.humanGate === "otp" || field.humanGate === "upload" || field.humanGate === "submit") {
      field.fillMode = "skip";
    } else if (transliterate) {
      field.fillMode = "auto";
    } else if (readOnly || AGREEMENT_RE.test(String(field.label || "")) && (field.type === "textarea" || field.type === "text")) {
      field.fillMode = "skip";
      field.readOnly = readOnly;
    } else {
      field.fillMode = "fill";
    }
    field.dependsOn = null;
    field.showWhen = localBodyShowWhen(field.label);
    if (PER_APP_KEYS.indexOf(field.canonicalKey) >= 0) field.relationHint = "per_application";
    field.needsReview = !field.canonicalKey && !field.humanGate && field.type !== "search" && field.fillMode !== "auto" || PER_APP_KEYS.indexOf(field.canonicalKey) >= 0;
    if (field.canonicalKey === "residence_type" && Array.isArray(field.options)) {
      var hit = field.options.find(function(o) {
        var t = typeof o === "string" ? o : o && (o.text || o.labelEn || o.labelHi) || "";
        return /स्थायी|permanent/i.test(String(t));
      });
      if (hit) field.constantValue = typeof hit === "string" ? hit : hit.text || hit.labelEn || hit.labelHi;
    }
    return field;
  }
  var ADDRESS_CASCADE = ["state", "district", "sub_division", "block", "village", "police_station", "panchayat"];
  var OFFICE_CASCADE = ["state", "district", "block", "circle"];
  function linkDependsOn(formFields) {
    var seenAddr = {};
    var seenOff = {};
    for (var i = 0; i < formFields.length; i++) {
      var f = formFields[i];
      var key = f.canonicalKey;
      var isDrop = f.type === "dropdown" || f.type === "select" || f.type === "mat-select" || f.type === "ng-dropdown";
      if (f.section === "office") {
        if (key && OFFICE_CASCADE.indexOf(key) >= 0) seenOff[key] = f;
      } else if (key && ADDRESS_CASCADE.indexOf(key) >= 0) {
        seenAddr[key] = f;
      }
      if (!isDrop) continue;
      if (f.optionsDynamic || f.options === "dynamic" || !f.options || Array.isArray(f.options) && f.options.length === 0) {
        f.optionsDynamic = true;
        if (!f.options || Array.isArray(f.options) && f.options.length === 0) f.options = [];
        var chain = f.section === "office" ? OFFICE_CASCADE : ADDRESS_CASCADE;
        var seen = f.section === "office" ? seenOff : seenAddr;
        var parent = null;
        if (key === "panchayat") {
          parent = seenAddr.block || seenAddr.sub_division || seenAddr.district || null;
        } else {
          var idx = key ? chain.indexOf(key) : -1;
          if (idx > 0) {
            for (var p = idx - 1; p >= 0; p--) {
              if (seen[chain[p]] && seen[chain[p]] !== f) {
                parent = seen[chain[p]];
                break;
              }
            }
          }
        }
        if (parent) {
          f.dependsOn = catalogKeyOf(parent) || parent.canonicalKey || parent.selector || parent.id || null;
          f.rules = Object.assign({}, f.rules || {}, { waitForOptions: true });
        }
      }
    }
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
    function blocked(el) {
      if (isInSkipContext(el) && !isPageSearch(el)) return true;
      var tag = String(el.tagName || "").toLowerCase();
      var kind = String(el.type || "").toLowerCase();
      var rawLabel = (getLabel(el) || nearbyText(el) || el.id || "").trim();
      var present = typeof helpers.isVisuallyPresent !== "function" || helpers.isVisuallyPresent(el);
      if (isSystemNoise(rawLabel) && !present) return true;
      if (kind === "file" && isNumericLabel(rawLabel) && !present) return true;
      if (!present) {
        if (tag === "select" && !isSystemNoise(rawLabel)) return false;
        if (kind === "file" && /photo|photograph|पासपोर्ट/i.test(rawLabel)) return false;
        if (localBodyShowWhen(rawLabel)) return false;
        if (kind === "checkbox" || kind === "radio") {
          var lab = null;
          if (el.id && el.ownerDocument && el.ownerDocument.querySelector) {
            lab = el.ownerDocument.querySelector('label[for="' + el.id + '"]');
          }
          if (!lab && el.closest) lab = el.closest("label");
          if (lab && helpers.isVisuallyPresent(lab)) return false;
        }
        return true;
      }
      return false;
    }
    var formFields = [];
    var labelList = [];
    var radioGroups = {};
    var checkboxGroups = {};
    var idx = 0;
    var inputs = doc.querySelectorAll(INPUT_SELECTOR);
    inputs.forEach(function(el) {
      var t = el.type;
      if (t === "hidden" || t === "button" || t === "password" || t === "image" || t === "reset") return;
      if (blocked(el)) return;
      if (isContentEditable(el)) {
        if (el.parentElement && isContentEditable(el.parentElement)) return;
        var ceLabel = getLabel(el);
        if (!ceLabel && helpers.humanizeAttr) ceLabel = helpers.humanizeAttr(el.id || el.className || "") || "";
        if (!ceLabel) ceLabel = el.id ? String(el.id) : "Editor";
        var ceSelector = makeSelector(el, doc);
        if (!ceSelector && el.id) ceSelector = el.id.match(/^\d/) ? '[id="' + el.id + '"]' : "#" + el.id;
        if (!ceSelector) ceSelector = '[contenteditable="true"]';
        formFields.push(decorateField({
          selector: ceSelector,
          id: el.id || "",
          name: el.name || "",
          value: String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200),
          placeholder: "",
          label: ceLabel,
          type: "contenteditable",
          index: idx,
          options: null,
          _el: el
        }, el, doc));
        idx++;
        return;
      }
      var meta = ((el.id || "") + " " + (el.name || "") + " " + (el.className || "")).toLowerCase();
      var pageSearch = isPageSearch(el);
      if (SKIP_META_HARD_RE.test(meta)) return;
      if (SKIP_META_SOFT_RE.test(meta) && !pageSearch && !HUMAN_GATE_RE.test(meta) && !isJourneyMeta(meta, getLabel(el) || el.placeholder || "")) return;
      if (t === "radio" && el.name) {
        if (!radioGroups[el.name]) {
          radioGroups[el.name] = {
            options: [],
            selectors: [],
            details: [],
            groupLabel: resolveRadioGroupLabel(el, isGoodLabel),
            index: idx,
            firstEl: el
          };
        }
        var radioLbl = getLabel(el) || el.value || "";
        var radioSplit = splitHiEn(radioLbl);
        radioGroups[el.name].options.push(radioLbl);
        radioGroups[el.name].details.push({
          value: el.value != null ? String(el.value) : radioLbl,
          labelHi: radioSplit.labelHi,
          labelEn: radioSplit.labelEn,
          text: radioLbl
        });
        radioGroups[el.name].selectors.push(makeRadioSelector(el));
        idx++;
        return;
      }
      if (t === "checkbox" && el.name) {
        var lbl = getLabel(el) || el.value || "";
        if (AGREEMENT_RE.test(lbl)) {
          var sel = makeSelector(el) || '[name="' + el.name + '"]';
          formFields.push(decorateField({
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
          }, el, doc));
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
      if (!label || isNumericLabel(label)) {
        var nearby = nearbyText(el);
        if (nearby) label = nearby;
      }
      if (!label && helpers.humanizeAttr) {
        label = helpers.humanizeAttr(el.name || el.id || "") || "";
      } else if (!label && typeof window !== "undefined" && window.ccDomUtils && window.ccDomUtils.humanizeAttr) {
        label = window.ccDomUtils.humanizeAttr(el.name || el.id || "") || "";
      }
      if (isSystemNoise(label) && typeof helpers.isVisuallyPresent === "function" && !helpers.isVisuallyPresent(el)) return;
      if (el.type === "file" && isNumericLabel(label) && typeof helpers.isVisuallyPresent === "function" && !helpers.isVisuallyPresent(el)) return;
      var selector = makeSelector(el, doc);
      if (!selector && pageSearch) selector = uniqueSearchSelector(el, doc);
      if (!selector && pageSearch) return;
      if (!selector && t === "range") selector = uniqueRangeSelector(el, doc);
      if (!selector) selector = "form-field-" + idx;
      if (el.tagName === "SELECT") {
        var collected = collectSelectOptions(el);
        if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
        formFields.push(decorateField({
          selector,
          id: el.id,
          name: el.name,
          value: el.value,
          placeholder: el.placeholder || "",
          label,
          type: "dropdown",
          index: idx,
          options: collected.dynamic ? [] : collected.labels,
          optionDetails: collected.details,
          optionsDynamic: collected.dynamic,
          _el: el
        }, el, doc));
        idx++;
        return;
      }
      if (t === "submit") {
        formFields.push(decorateField({
          selector,
          id: el.id,
          name: el.name,
          value: el.value || "",
          placeholder: "",
          label: label || el.value || "Submit",
          type: "submit",
          index: idx,
          options: null,
          _el: el
        }, el, doc));
        idx++;
        return;
      }
      var type = pageSearch ? "search" : t === "range" ? "slider" : el.type || "text";
      if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push(decorateField({
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
      }, el, doc));
      idx++;
    });
    for (var rname in radioGroups) {
      var rg = radioGroups[rname];
      var groupLabel = rg.groupLabel || rg.options.join(" / ");
      if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push(decorateField({
        selector: '[name="' + rname + '"]',
        id: "",
        name: rname,
        value: "",
        placeholder: "",
        label: groupLabel,
        type: "radio-group",
        index: rg.index,
        options: rg.options,
        optionDetails: rg.details,
        optionSelectors: rg.selectors,
        _el: rg.firstEl
      }, rg.firstEl, doc));
    }
    for (var cname in checkboxGroups) {
      var cg = checkboxGroups[cname];
      var cgLabel = cg.groupLabel || cg.options.join(" / ");
      if (cgLabel) labelList.push(cgLabel.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push(decorateField({
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
      }, cg.firstEl, doc));
    }
    assignSections(formFields);
    linkDependsOn(formFields);
    formFields = formFields.filter(function(f) {
      var el = f._el;
      var present = !el || typeof helpers.isVisuallyPresent !== "function" || helpers.isVisuallyPresent(el);
      if (!present) f.hidden = true;
      if (f.showWhen && f.hidden) f.fillMode = f.fillMode || "fill";
      if (f.hidden && !f.showWhen && !f.optionsDynamic && f.fillMode !== "auto") f.fillMode = "skip";
      if (isSystemNoise(f.label) && f.hidden) return false;
      if (f.type === "file" && isNumericLabel(f.label) && (f.hidden || !present)) return false;
      return true;
    });
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
    function blocked(el) {
      if (isInSkipContext(el)) return true;
      if (typeof helpers.isVisuallyPresent === "function" && !helpers.isVisuallyPresent(el)) return true;
      return false;
    }
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
      if (blocked(el)) return;
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
      if (blocked(el)) return;
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
      if (blocked(el)) return;
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
  var NG_CONTAINER_SEL = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, [class*="custom-dropdown"], [class*="select-control"], [class*="-container"][class*="css-"]';
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
    function blocked(el) {
      if (isInSkipContext(el)) return true;
      if (typeof helpers.isVisuallyPresent === "function" && !helpers.isVisuallyPresent(el)) return true;
      return false;
    }
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === "number" ? startIdx : 1e4;
    var formFields = [];
    var labelList = [];
    var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|city|date)\b/i;
    doc.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(function(el) {
      if (el.tagName === "INPUT" || el.tagName === "SELECT") return;
      if (blocked(el)) return;
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
      if (blocked(el)) return;
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

/* ==== scan-custom-choice.ts ==== */
(function(root) {
  "use strict";
  var QUERY = [
    '[role="checkbox"]',
    '[role="radio"]',
    ".rct-checkbox",
    ".rct-title",
    "label.custom-control-label",
    "label.form-check-label"
  ].join(",");
  function already(el, existing) {
    if (!el || !existing) return false;
    for (var i = 0; i < existing.length; i++) {
      var f = existing[i];
      if (f && f._el === el) return true;
      try {
        if (f && f.selector && el.matches && el.matches(f.selector)) return true;
      } catch (e) {
      }
    }
    return false;
  }
  function selectorFor(el, idx, doc) {
    if (el.id && /^[A-Za-z][\w:-]*$/.test(el.id)) {
      var byId = "#" + el.id;
      if (doc.querySelectorAll && doc.querySelectorAll(byId).length === 1) return byId;
    }
    var htmlFor = el.getAttribute && el.getAttribute("for");
    if (htmlFor) return 'label[for="' + htmlFor + '"]';
    var cls = String(el.className || "").trim().split(/\s+/).filter(function(c) {
      return c && /^[A-Za-z][\w-]*$/.test(c);
    });
    if (cls.length && el.tagName) {
      var sel = String(el.tagName).toLowerCase() + "." + cls[0];
      if (doc.querySelectorAll && doc.querySelectorAll(sel).length === 1) return sel;
    }
    return "cc-choice-" + idx;
  }
  function kindOf(el) {
    var role = el.getAttribute && el.getAttribute("role");
    if (role === "radio") return "radio";
    if (role === "checkbox") return "checkbox";
    var cls = String(el.className || "");
    if (/custom-control-label/.test(cls)) {
      var box = el.parentElement && el.parentElement.querySelector && el.parentElement.querySelector("input");
      var t = box && String(box.type || "").toLowerCase();
      if (t === "radio") return "radio";
      return "checkbox";
    }
    if (/rct-checkbox|rct-title/.test(cls) || el.getAttribute && el.getAttribute("for")) return "checkbox";
    return "checkbox";
  }
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var idx = typeof startIdx === "number" ? startIdx : 2e4;
    var formFields = [];
    var labelList = [];
    var seen = {};
    if (!doc || typeof doc.querySelectorAll !== "function") return { formFields, labelList };
    var nodes = doc.querySelectorAll(QUERY);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (isInSkipContext && isInSkipContext(el)) continue;
      if (typeof helpers.isVisuallyPresent === "function" && !helpers.isVisuallyPresent(el)) continue;
      var host = el;
      if (el.classList && el.classList.contains("rct-checkbox") && el.closest) {
        host = el.closest("label") || el;
      }
      if (el.classList && el.classList.contains("rct-title") && el.closest) {
        host = el.closest("label") || el;
      }
      if (already(host, existingFields) || already(host, formFields)) continue;
      var label = "";
      if (host.classList && host.classList.contains("rct-title")) label = String(host.textContent || "").replace(/\s+/g, " ").trim();
      else if (el.classList && el.classList.contains("rct-title")) label = String(el.textContent || "").replace(/\s+/g, " ").trim();
      else label = getLabel && getLabel(host) || host.getAttribute && host.getAttribute("aria-label") || String(host.textContent || "").replace(/\s+/g, " ").trim();
      label = String(label || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!label || label.length < 2) continue;
      var key = label.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      var type = kindOf(host);
      var selector = selectorFor(host, idx, doc);
      if (label) labelList.push(key.replace(/[^a-z0-9]/g, "").slice(0, 15));
      formFields.push({
        selector,
        id: host.id || "",
        name: host.getAttribute && host.getAttribute("for") || "",
        value: "",
        placeholder: "",
        label,
        type,
        index: idx,
        options: null,
        _el: host
      });
      idx += 1;
    }
    return { formFields, labelList };
  }
  root.CcScanCustomChoice = { scan };
})(typeof globalThis !== "undefined" ? globalThis : this);
if (typeof module !== "undefined") module.exports = (typeof globalThis !== "undefined" ? globalThis : this).CcScanCustomChoice;

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
    var idSig = formFields.map(function(f) {
      return String(f.id || f.name || "").trim();
    }).filter(Boolean).sort().join(",");
    var structuralFingerprint = djb2((opts.serviceId || "") + "|" + idSig);
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
    return {
      formKey,
      semanticFormKey,
      pageModel,
      structuralFingerprint
    };
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
  var _scw = globalThis.CcScanCustomChoice || {};
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
    },
    isVisuallyPresent: function(el) {
      if (!_fc.isVisuallyPresent) return true;
      var view = el && el.ownerDocument && el.ownerDocument.defaultView || void 0;
      return _fc.isVisuallyPresent(el, view);
    }
  };
  var docs = _fc.sameOriginDocs ? _fc.sameOriginDocs(doc) : [doc];
  if (_fc.hasFormContext && !_fc.hasFormContext(doc, ccDomUtils)) {
    return { formFields: [], formKey: "" };
  }
  var formFields = [];
  var labelList = [];
  for (var d = 0; d < docs.length; d++) {
    var one = docs[d];
    if (_ssf.scan) {
      var std = _ssf.scan(one, helpers);
      formFields = formFields.concat(std.formFields);
      labelList = labelList.concat(std.labelList);
    }
    if (_smw.scan) {
      var mat = _smw.scan(one, formFields, helpers, 1e4 + formFields.length);
      formFields = formFields.concat(mat.formFields);
      labelList = labelList.concat(mat.labelList);
    }
    if (_sng.scan) {
      var ng = _sng.scan(one, formFields, helpers, 1e4 + formFields.length);
      formFields = formFields.concat(ng.formFields);
      labelList = labelList.concat(ng.labelList);
    }
    if (_scw.scan) {
      var custom = _scw.scan(one, formFields, helpers, 2e4 + formFields.length);
      formFields = formFields.concat(custom.formFields);
      labelList = labelList.concat(custom.labelList);
    }
  }
  if (_sfv.sort) _sfv.sort(formFields);
  var snapshotId = "snap." + Date.now().toString(36);
  formFields.forEach(function(f, i) {
    f.visible = true;
    f.visualLabel = f.label || "";
    f.fieldId = snapshotId + "." + i;
    f.snapshotId = snapshotId;
  });
  var hostname = location.hostname;
  var title = (((_a = document.querySelector("h1,h2,legend,.form-title,.page-title")) == null ? void 0 : _a.textContent) || document.title || "").trim().slice(0, 50);
  var serviceId = "";
  try {
    var params = new URL(location.href).searchParams;
    serviceId = params.get("serviceId") || params.get("serviceid") || params.get("service_id") || "";
  } catch (e) {
  }
  if (!serviceId) {
    var sidEl = document.querySelector('input[name="serviceId"],input[id="serviceId"],input[name="serviceid"]');
    if (sidEl && sidEl.value) serviceId = String(sidEl.value);
  }
  var result = { formKey: "", semanticFormKey: "", pageModel: null, structuralFingerprint: "" };
  if (_fp.fingerprint) {
    result = _fp.fingerprint(formFields, labelList, {
      hostname,
      title,
      url: location.href,
      serviceId,
      ccModels: typeof window !== "undefined" && window.ccModels || null
    });
  }
  return {
    formFields,
    formKey: result.formKey,
    semanticFormKey: result.semanticFormKey,
    pageModel: result.pageModel,
    snapshotId,
    meta: {
      title,
      hostname,
      url: location.href,
      serviceId: serviceId || "",
      structuralFingerprint: result.structuralFingerprint || ""
    }
  };
}
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  var _co = globalThis.CcCorrectionObserver || {};
  if (_co.inject) {
    _co.inject(mapping, filledBySource, profile, backendUrl, formKey, document);
  }
}
