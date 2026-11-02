/**
 * scan-standard-fields — Standard input/select/radio/checkbox scanner
 *
 * Loops all input/textarea/select elements in the document. Skips
 * hidden/submit/password/captcha inputs and elements in skip contexts.
 * A visible page search box is kept, including one in the header.
 *
 * Handles:
 *   - Radio buttons: grouped by name, label from legend/fieldset/container
 *   - Checkboxes: agreement checkboxes stay individual; others grouped by name
 *   - <select>: options captured, type = 'dropdown'
 *   - Everything else: text/email/tel/number/date/file inputs
 *
 * Public API (on (globalThis as any).CcScanStandardFields):
 *   scan(doc, helpers) => { formFields, labelList }
 *
 * helpers: { isInSkipContext, getLabel, isGoodLabel }
 *
 * See docs/scan-standard-fields.md for full documentation.
 */
(function (root: any) {
  'use strict';

  var INPUT_SELECTOR = (
    'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
    // type=search included for OTA From/To widgets (#311)
    'input[type="search"],input[type="file"],input[type="radio"],input[type="checkbox"],input[type="range"],input[type="submit"],input:not([type]),textarea,select,' +
    // iframe bodies (TinyMCE on The Internet) — not added to FORM_FIELD_QUERY so form-field-N stays stable
    '[contenteditable="true"],[contenteditable=""]'
  );

  // Site chrome / security — NOT journey search. "search" alone is OK when journey-like (#311).
  // captcha/otp are captured as humanGate, not skipped.
  var SKIP_META_HARD_RE = /token|csrf|recaptcha/i;
  var HUMAN_GATE_RE = /captcha|otp/i;
  var SKIP_META_SOFT_RE = /search|query|filter/i;
  var JOURNEY_RE = /\b(from|to|source|destination|origin|depart|arriv|journey|travel|station|boarding|onward|return|leaving|going|city|date)\b/i;
  var AGREEMENT_RE = /\b(i\s+)?(agree|accept|confirm|declare|certify|consent|terms|self.declaration)\b/i;

  function isJourneyMeta(meta: any, label: any) {
    return JOURNEY_RE.test(String(meta || '') + ' ' + String(label || ''));
  }

  /**
   * A box the operator uses to search the page. Header chrome stays out,
   * but this box is the control read_form has to show.
   * Name and id are enough: YouTube's box is type=text name=search_query
   * inside the masthead, so a header skip or a "search" word skip hides it.
   */
  function isPageSearch(el: any) {
    if (!el) return false;
    var t = String(el.type || '').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'password' ||
        t === 'image' || t === 'reset' || t === 'checkbox' || t === 'radio' || t === 'file') return false;
    var meta = ((el.id || '') + ' ' + (el.name || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
    if (SKIP_META_HARD_RE.test(meta) || HUMAN_GATE_RE.test(meta)) return false;
    if (t === 'search') return true;
    if (/(^|[^a-z])(search_query|search|query)([^a-z]|$)/.test(meta) && !/(^|[^a-z])filter([^a-z]|$)/.test(meta)) return true;
    var hint = String(el.placeholder || (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '').toLowerCase();
    return /^\s*search\b/.test(hint);
  }

  function isContentEditable(el: any) {
    if (!el) return false;
    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
    if (el.isContentEditable === true) return true;
    var raw = el.getAttribute && el.getAttribute('contenteditable');
    if (raw == null) return false;
    raw = String(raw).toLowerCase().trim();
    return raw === 'true' || raw === '';
  }

  function uniqueSearchSelector(el: any, doc: any) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return null;
    var sel = 'input[type="search"]';
    try {
      var hits = doc.querySelectorAll(sel);
      if (hits && hits.length === 1 && hits[0] === el) return sel;
    } catch (e) {}
    return null;
  }

  function uniqueRangeSelector(el: any, doc: any) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return null;
    var sel = 'input[type="range"]';
    try {
      var hits = doc.querySelectorAll(sel);
      if (hits && hits.length === 1 && hits[0] === el) return sel;
    } catch (e) {}
    return null;
  }

  // Same list as CcResolveCcSelector. form-field-N is an index into this
  // query, not the count of fields the scanner kept. A header input that is
  // skipped here is still input 0 on the page; numbering kept fields from 0
  // made the filler read a different control and refuse the write.
  var FORM_FIELD_QUERY = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="date"]',
    'input[type="radio"]',
    'input[type="checkbox"]',
    'input[type="range"]',
    'input:not([type])',
    'textarea',
    'select',
  ].join(',');

  function domFieldIndex(doc: any, el: any) {
    if (!doc || !el || typeof doc.querySelectorAll !== 'function') return -1;
    var all = doc.querySelectorAll(FORM_FIELD_QUERY);
    for (var i = 0; i < all.length; i++) {
      if (all[i] === el) return i;
    }
    return -1;
  }

  function makeSelector(el: any, doc: any) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    if (el.name) return '[name="' + el.name + '"]';
    var fcn = el.getAttribute && (el.getAttribute('formcontrolname') || el.getAttribute('ng-reflect-name'));
    if (fcn && doc && typeof doc.querySelectorAll === 'function') {
      var fcnSel = '[formcontrolname="' + String(fcn).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
      try {
        var hits = doc.querySelectorAll(fcnSel);
        if (hits && hits.length === 1) return fcnSel;
      } catch (e) {}
    }
    var domIdx = domFieldIndex(doc, el);
    if (domIdx >= 0) return 'form-field-' + domIdx;
    return null;
  }

  function makeRadioSelector(el: any) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[name="' + el.name + '"][value="' + el.value + '"]';
  }

  function attrOf(el: any, name: any) {
    if (!el) return '';
    if (el.getAttribute) {
      var v = el.getAttribute(name);
      if (v != null && String(v).trim()) return String(v).trim();
    }
    if (el[name] != null && String(el[name]).trim()) return String(el[name]).trim();
    return '';
  }

  function splitHiEn(text: any) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    var hi = '';
    var en = '';
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

  function isPlaceholderOption(text: any, value: any) {
    var t = String(text || '').trim();
    var v = String(value == null ? '' : value).trim();
    if (!t) return true;
    if (/^(select|choose|--|please select|loading)/i.test(t)) return true;
    if (v === '' || v === '-1') return true;
    return false;
  }

  function collectSelectOptions(el: any) {
    var nodes = (el && el.querySelectorAll) ? el.querySelectorAll('option') : [];
    var labels = [];
    var details = [];
    for (var i = 0; i < nodes.length; i++) {
      var o = nodes[i];
      var text = String((o && (o.textContent || o.label)) || '').trim();
      var value = o && o.value != null ? String(o.value) : text;
      if (isPlaceholderOption(text, value)) continue;
      var split = splitHiEn(text);
      labels.push(text);
      details.push({ value: value, labelHi: split.labelHi, labelEn: split.labelEn, text: text });
    }
    return { labels: labels, details: details, dynamic: labels.length === 0 };
  }

  function nearbyText(el: any) {
    if (!el || !el.closest) return '';
    var row = el.closest('tr,.form-group,.form-field,[class*="form-row"],li,fieldset,div');
    if (!row || !row.querySelector) return '';
    var lbl = row.querySelector('label,.label,.field-label,legend,td:first-child,th');
    if (!lbl || lbl === el || (lbl.contains && lbl.contains(el))) return '';
    var t = String(lbl.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length < 2 || t.length > 80) return '';
    return t;
  }

  var SYSTEM_NOISE_RE = /^(original code|cb code|location type|department level)$/i;
  var OFFICE_CAPS_RE = /^(STATE|DISTRICT|BLOCK|CIRCLE|CB CODE|LOCATION TYPE|DEPARTMENT LEVEL)$/;
  var COLLIDE_KEYS = ['state', 'district', 'block', 'sub_division', 'circle'];
  var ADDRESS_KEYS = ['state', 'district', 'sub_division', 'block', 'village', 'police_station', 'panchayat', 'post_office', 'ward', 'pincode'];
  var PER_APP_KEYS = ['purpose', 'apply_to_office'];

  function isSystemNoise(label: any) {
    return SYSTEM_NOISE_RE.test(String(label || '').trim());
  }

  function isNumericLabel(label: any) {
    return /^[0-9]{3,}$/.test(String(label || '').trim());
  }

  function isOfficeCapsLabel(label: any) {
    var lab = String(label || '').trim();
    return lab.length > 0 && lab === lab.toUpperCase() && OFFICE_CAPS_RE.test(lab);
  }

  function localBodyShowWhen(label: any) {
    var lab = String(label || '').trim();
    var pairs = [
      [/zilla parishad|जिला परिषद/i, 'Zilla Parishad'],
      [/municipal corporation|नगर निगम/i, 'Municipal Corporation'],
      [/municipal council/i, 'Municipal Council'],
      [/notified area/i, 'Notified Area Council'],
      [/town panchayat|नगर पंचायत/i, 'Town Panchayat'],
      [/^municipality$|नगरपालिका/i, 'Municipality'],
      [/^(gram panchayat|ग्राम पंचायत)$/i, 'Gram Panchayat'],
    ];
    for (var i = 0; i < pairs.length; i++) {
      if ((pairs[i][0] as RegExp).test(lab)) return { local_body_type: pairs[i][1] };
    }
    return null;
  }

  function isTransliterateField(canonicalKey: any, label: any) {
    if (/_hindi$/.test(String(canonicalKey || ''))) return true;
    if (isMostlyHindi(label) && /नाम|\bname\b/i.test(String(label || '')) && !/name of applicant|applicant.?s name/i.test(String(label || ''))) return true;
    return false;
  }

  function catalogKeyOf(f: any) {
    var c = f && f.canonicalKey;
    if (f && f.section && c && COLLIDE_KEYS.indexOf(c) >= 0) return f.section + '.' + c;
    return c || null;
  }

  function assignSections(formFields: any) {
    var seenOffice = false;
    for (var i = 0; i < formFields.length; i++) {
      var f = formFields[i];
      var lab = String(f.label || '').trim();
      if (f.canonicalKey === 'apply_to_office' || /apply to (the )?office/i.test(lab)) {
        f.section = 'office';
        seenOffice = true;
      } else if (isOfficeCapsLabel(lab) || (seenOffice && COLLIDE_KEYS.indexOf(f.canonicalKey) >= 0)) {
        f.section = 'office';
        seenOffice = true;
      } else if (ADDRESS_KEYS.indexOf(f.canonicalKey) >= 0) {
        f.section = 'address';
      }
      f.catalogKey = catalogKeyOf(f);
    }
  }

  function addLocator(locators: any, seen: any, type: any, value: any) {
    if (!value) return;
    var v = String(value).trim();
    if (!v) return;
    var k = type + ':' + v;
    if (seen[k]) return;
    seen[k] = true;
    locators.push({ type: type, value: v });
  }

  function buildLocators(el: any, doc: any, label: any, selectorFallback: any) {
    var locators = [];
    var seen = {};
    if (el && el.id) addLocator(locators, seen, 'id', makeSelector({ id: el.id, name: '', getAttribute: function () { return ''; } }, doc) || (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id));
    if (el && el.name) addLocator(locators, seen, 'name', '[name="' + el.name + '"]');
    var split = splitHiEn(label || '');
    addLocator(locators, seen, 'label-hi', split.labelHi);
    addLocator(locators, seen, 'label-en', split.labelEn);
    addLocator(locators, seen, 'placeholder', el && (el.placeholder || attrOf(el, 'placeholder')));
    addLocator(locators, seen, 'aria', attrOf(el, 'aria-label'));
    addLocator(locators, seen, 'nearby', nearbyText(el));
    var fcn = attrOf(el, 'formcontrolname') || attrOf(el, 'ng-reflect-name');
    if (fcn) addLocator(locators, seen, 'css', '[formcontrolname="' + String(fcn).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
    addLocator(locators, seen, 'css', selectorFallback);
    if (el && el.id) addLocator(locators, seen, 'xpath', '//*[@id="' + String(el.id).replace(/"/g, '\\"') + '"]');
    return locators;
  }

  function guessCanonicalKey(label: any, name: any, id: any, type: any, options: any) {
    var blob = [label, name, id, type].filter(Boolean).join(' ');
    var optBlob = '';
    if (Array.isArray(options)) {
      optBlob = options.map(function (o: any) {
        return typeof o === 'string' ? o : (o && (o.text || o.labelEn || o.label || o.value)) || '';
      }).join(' ');
    }
    var all = blob + ' ' + optBlob;
    if (/police\s*station|\bthana\b|थाना/i.test(all)) return 'police_station';
    if (/post\s*office|डाकघर/i.test(all) && !/police|thana/i.test(all)) return 'post_office';
    if (/\bpanchayat\b|पंचायत/i.test(blob) && !/local body|ग्राम पंचायत.*नगर|नगर पंचायत|नगर निगम/i.test(all)) return 'panchayat';
    if (/local body|ग्राम पंचायत|नगर पंचायत|नगर निगम|municipal/i.test(all) && (type === 'radio-group' || /local body/i.test(blob))) return 'local_body_type';
    if (/\bgender\b|\bsex\b|\bling\b|पुरुष|स्त्री|तृतीय|male.*female|third\s*gender/i.test(all)) return 'gender';
    if (/supporting document|document type|आधार कार्ड|राशन कार्ड/i.test(all) && (type === 'radio-group' || /document/i.test(blob))) return 'supporting_document_type';
    if (/आवेदक|आवेदिका का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ''))) return 'name_hindi';
    if (/पिता का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ''))) return 'father_name_hindi';
    if (/माता का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ''))) return 'mother_name_hindi';
    if (/पति का नाम/i.test(blob) && !/[A-Za-z]{3,}/.test(String(label || ''))) return 'husband_name_hindi';
    if (/name of husband|husband.?s name/i.test(blob)) return 'husband_name';
    if (/name of father|father.?s name/i.test(blob)) return 'father_name';
    if (/name of mother|mother.?s name/i.test(blob)) return 'mother_name';
    if (/name of applicant|applicant.?s name|^full name$|^candidate name$|^applicant name$/i.test(blob)) return 'name';
    if (/e-?mail/i.test(blob)) return 'email';
    if (/(mobile|phone|sampark|मोबाइल)/i.test(blob) && !/otp/i.test(blob)) return 'mobile';
    if (/aadhaar|aadhar/i.test(blob)) return 'aadhaar_number';
    if (/pin\s*code|pincode|postal code/i.test(blob)) return 'pincode';
    if (/\bstate\b|राज्य/i.test(blob) && !/statement/i.test(blob)) return 'state';
    if (/\bdistrict\b|जिला/i.test(blob)) return 'district';
    if (/sub[\s-]*division|अनुमंडल/i.test(blob)) return 'sub_division';
    if (/\bblock\b|प्रखंड/i.test(blob)) return 'block';
    if (/\bvillage\b|गांव|गाँव/i.test(blob)) return 'village';
    if (/\bward\b|वार्ड/i.test(blob)) return 'ward';
    if (/purpose|उद्देश्य/i.test(blob)) return 'purpose';
    if (/^circle$/i.test(String(label || '').trim()) || (/(^|\s)circle(\s|$)/i.test(blob) && !/sub[\s-]*division|अनुमंडल/i.test(blob))) return 'circle';
    if (/residence type|type of residence|स्थायी|अस्थायी/i.test(all)) return 'residence_type';
    if (/photo|photograph|पासपोर्ट साइज/i.test(blob)) return 'photo';
    if (/apply to (the )?office|office to apply/i.test(blob)) return 'apply_to_office';
    return null;
  }

  function isMostlyHindi(label: any) {
    var raw = String(label || '');
    var hi = (raw.match(/[\u0900-\u097F]/g) || []).length;
    var en = (raw.match(/[A-Za-z]/g) || []).length;
    return hi >= 4 && en < 3;
  }

  function detectHumanGate(el: any, label: any, type: any) {
    var blob = [el && el.id, el && el.name, el && el.className, label, type].filter(Boolean).join(' ');
    if (/captcha/i.test(blob)) return 'captcha';
    if (/\botp\b/i.test(blob)) return 'otp';
    if (type === 'file') return 'upload';
    if (type === 'submit') return 'submit';
    if (type === 'checkbox-agreement') return 'agree';
    return null;
  }

  function readRules(el: any, label: any, type: any) {
    var rules: any = {};
    var maxL = el && (el.maxLength || el.maxlength || attrOf(el, 'maxlength'));
    if (maxL && Number(maxL) > 0 && Number(maxL) < 100000) rules.maxLength = Number(maxL);
    var minL = el && (el.minLength || el.minlength || attrOf(el, 'minlength'));
    if (minL && Number(minL) > 0) rules.minLength = Number(minL);
    var pat = el && (el.pattern || attrOf(el, 'pattern'));
    if (pat) rules.pattern = String(pat);
    var req = el && (el.required === true || (el.getAttribute && el.getAttribute('required') != null && el.getAttribute('required') !== 'false'));
    if (req) rules.required = true;
    var blob = ((label || '') + ' ' + ((el && el.id) || '') + ' ' + ((el && el.name) || '') + ' ' + (type || '')).toLowerCase();
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

  function decorateField(field: any, el: any, doc: any) {
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
    var hasReadonly = !!(el && ((el.readOnly === true) || (el.getAttribute && el.getAttribute('readonly') != null)));
    var hasDisabled = !!(el && ((el.disabled === true) || (el.getAttribute && el.getAttribute('disabled') != null && el.getAttribute('disabled') !== 'false')));
    var readOnly = hasReadonly || hasDisabled;
    if (field.humanGate === 'captcha' || field.humanGate === 'otp' || field.humanGate === 'upload' || field.humanGate === 'submit') {
      field.fillMode = 'skip';
    } else if (transliterate) {
      field.fillMode = 'auto';
    } else if (readOnly || (AGREEMENT_RE.test(String(field.label || '')) && (field.type === 'textarea' || field.type === 'text'))) {
      field.fillMode = 'skip';
      field.readOnly = readOnly;
    } else {
      field.fillMode = 'fill';
    }
    field.dependsOn = null;
    field.showWhen = localBodyShowWhen(field.label);
    if (PER_APP_KEYS.indexOf(field.canonicalKey) >= 0) field.relationHint = 'per_application';
    field.needsReview = (!field.canonicalKey && !field.humanGate && field.type !== 'search' && field.fillMode !== 'auto') || PER_APP_KEYS.indexOf(field.canonicalKey) >= 0;
    if (field.canonicalKey === 'residence_type' && Array.isArray(field.options)) {
      var hit = field.options.find(function (o: any) {
        var t = typeof o === 'string' ? o : (o && (o.text || o.labelEn || o.labelHi)) || '';
        return /स्थायी|permanent/i.test(String(t));
      });
      if (hit) field.constantValue = typeof hit === 'string' ? hit : (hit.text || hit.labelEn || hit.labelHi);
    }
    return field;
  }

  var ADDRESS_CASCADE = ['state', 'district', 'sub_division', 'block', 'village', 'police_station', 'panchayat'];
  var OFFICE_CASCADE = ['state', 'district', 'block', 'circle'];

  function linkDependsOn(formFields: any) {
    var seenAddr: any = {};
    var seenOff: any = {};
    for (var i = 0; i < formFields.length; i++) {
      var f = formFields[i];
      var key = f.canonicalKey;
      var isDrop = f.type === 'dropdown' || f.type === 'select' || f.type === 'mat-select' || f.type === 'ng-dropdown';
      if (f.section === 'office') {
        if (key && OFFICE_CASCADE.indexOf(key) >= 0) seenOff[key] = f;
      } else if (key && ADDRESS_CASCADE.indexOf(key) >= 0) {
        seenAddr[key] = f;
      }
      if (!isDrop) continue;
      if (f.optionsDynamic || f.options === 'dynamic' || !f.options || (Array.isArray(f.options) && f.options.length === 0)) {
        f.optionsDynamic = true;
        if (!f.options || (Array.isArray(f.options) && f.options.length === 0)) f.options = [];
        var chain = f.section === 'office' ? OFFICE_CASCADE : ADDRESS_CASCADE;
        var seen = f.section === 'office' ? seenOff : seenAddr;
        var parent = null;
        if (key === 'panchayat') {
          parent = seenAddr.block || seenAddr.sub_division || seenAddr.district || null;
        } else {
          var idx = key ? chain.indexOf(key) : -1;
          if (idx > 0) {
            for (var p = idx - 1; p >= 0; p--) {
              if (seen[chain[p]] && seen[chain[p]] !== f) { parent = seen[chain[p]]; break; }
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

  function resolveRadioGroupLabel(el: any, isGoodLabel: any) {
    const fieldset = el.closest('fieldset');
    const legend = fieldset && fieldset.querySelector('legend');
    if (legend && isGoodLabel(legend.textContent.trim())) {
      return legend.textContent.trim();
    }
    const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div');
    if (container) {
      const lbl = container.querySelector('label,.label,.field-label,td:first-child');
      if (lbl && !lbl.querySelector('input') && isGoodLabel(lbl.textContent.trim())) {
        return lbl.textContent.trim();
      }
    }
    return '';
  }

  function resolveCheckboxGroupLabel(el: any, isGoodLabel: any) {
    const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div,fieldset');
    if (container) {
      const legend = container.querySelector('legend');
      const lbl = legend || container.querySelector('label:not(:has(input)),.label,.field-label');
      if (lbl && isGoodLabel(lbl.textContent.trim())) return lbl.textContent.trim();
    }
    return '';
  }

  /**
   * Scan standard form inputs in doc.
   *
   * @param {Document} doc
   * @param {{ isInSkipContext, getLabel, isGoodLabel }} helpers
   * @returns {{ formFields: Array, labelList: Array }}
   */
  function scan(doc: any, helpers: any) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    function blocked(el: any) {
      if (isInSkipContext(el) && !isPageSearch(el)) return true;
      var tag = String(el.tagName || '').toLowerCase();
      var kind = String(el.type || '').toLowerCase();
      var rawLabel = (getLabel(el) || nearbyText(el) || el.id || '').trim();
      var present = typeof helpers.isVisuallyPresent !== 'function' || helpers.isVisuallyPresent(el);
      if (isSystemNoise(rawLabel) && !present) return true;
      if (kind === 'file' && isNumericLabel(rawLabel) && !present) return true;
      if (!present) {
        // Cascade children and local-body conditionals stay; other hidden DOM is noise.
        if (tag === 'select' && !isSystemNoise(rawLabel)) return false;
        if (kind === 'file' && /photo|photograph|पासपोर्ट/i.test(rawLabel)) return false;
        if (localBodyShowWhen(rawLabel)) return false;
        if (kind === 'checkbox' || kind === 'radio') {
          var lab = null;
          if (el.id && el.ownerDocument && el.ownerDocument.querySelector) {
            lab = el.ownerDocument.querySelector('label[for="' + el.id + '"]');
          }
          if (!lab && el.closest) lab = el.closest('label');
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

    inputs.forEach(function (el: any) {
      var t = el.type;
      if (t === 'hidden' || t === 'button' ||
          t === 'password' || t === 'image' || t === 'reset') return;
      if (blocked(el)) return;
      if (isContentEditable(el)) {
        if (el.parentElement && isContentEditable(el.parentElement)) return;
        var ceLabel = getLabel(el);
        if (!ceLabel && helpers.humanizeAttr) ceLabel = helpers.humanizeAttr(el.id || el.className || '') || '';
        if (!ceLabel) ceLabel = el.id ? String(el.id) : 'Editor';
        var ceSelector = makeSelector(el, doc);
        if (!ceSelector && el.id) ceSelector = el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
        if (!ceSelector) ceSelector = '[contenteditable="true"]';
        formFields.push(decorateField({
          selector: ceSelector,
          id: el.id || '',
          name: el.name || '',
          value: String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
          placeholder: '',
          label: ceLabel,
          type: 'contenteditable',
          index: idx,
          options: null,
          _el: el,
        }, el, doc));
        idx++;
        return;
      }

      var meta = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || '')).toLowerCase();
      var pageSearch = isPageSearch(el);
      if (SKIP_META_HARD_RE.test(meta)) return;
      if (SKIP_META_SOFT_RE.test(meta) && !pageSearch && !HUMAN_GATE_RE.test(meta) && !isJourneyMeta(meta, getLabel(el) || el.placeholder || '')) return;

      // ── Radio ──
      if (t === 'radio' && el.name) {
        if (!radioGroups[el.name]) {
          radioGroups[el.name] = {
            options: [], selectors: [], details: [],
            groupLabel: resolveRadioGroupLabel(el, isGoodLabel),
            index: idx, firstEl: el,
          };
        }
        var radioLbl = getLabel(el) || el.value || '';
        var radioSplit = splitHiEn(radioLbl);
        radioGroups[el.name].options.push(radioLbl);
        radioGroups[el.name].details.push({
          value: el.value != null ? String(el.value) : radioLbl,
          labelHi: radioSplit.labelHi,
          labelEn: radioSplit.labelEn,
          text: radioLbl,
        });
        radioGroups[el.name].selectors.push(makeRadioSelector(el));
        idx++;
        return;
      }

      // ── Checkbox ──
      if (t === 'checkbox' && el.name) {
        var lbl = getLabel(el) || el.value || '';
        if (AGREEMENT_RE.test(lbl)) {
          var sel = makeSelector(el) || '[name="' + el.name + '"]';
          formFields.push(decorateField({ selector: sel, id: el.id, name: el.name, value: el.value,
            placeholder: '', label: lbl, type: 'checkbox-agreement', index: idx, options: null, _el: el }, el, doc));
          idx++;
          return;
        }
        if (!checkboxGroups[el.name]) {
          checkboxGroups[el.name] = {
            options: [], selectors: [],
            groupLabel: resolveCheckboxGroupLabel(el, isGoodLabel),
            index: idx, firstEl: el,
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
      // Last-resort: humanize name/id so we never emit blank labels (sessions UI
      // otherwise falls back to selector / semantic ids).
      if (!label && helpers.humanizeAttr) {
        label = helpers.humanizeAttr(el.name || el.id || '') || '';
      } else if (!label && typeof window !== 'undefined' && window.ccDomUtils && window.ccDomUtils.humanizeAttr) {
        label = window.ccDomUtils.humanizeAttr(el.name || el.id || '') || '';
      }
      if (isSystemNoise(label) && typeof helpers.isVisuallyPresent === 'function' && !helpers.isVisuallyPresent(el)) return;
      if (el.type === 'file' && isNumericLabel(label) && typeof helpers.isVisuallyPresent === 'function' && !helpers.isVisuallyPresent(el)) return;
      var selector = makeSelector(el, doc);
      // type=search is outside FORM_FIELD_QUERY on purpose, so a kept counter
      // must not become form-field-N. That index would point at a different input.
      if (!selector && pageSearch) selector = uniqueSearchSelector(el, doc);
      if (!selector && pageSearch) return;
      if (!selector && t === 'range') selector = uniqueRangeSelector(el, doc);
      if (!selector) selector = 'form-field-' + idx;

      // ── Select ──
      if (el.tagName === 'SELECT') {
        var collected = collectSelectOptions(el);
        if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
        formFields.push(decorateField({
          selector: selector, id: el.id, name: el.name, value: el.value,
          placeholder: el.placeholder || '', label: label, type: 'dropdown', index: idx,
          options: collected.dynamic ? [] : collected.labels,
          optionDetails: collected.details,
          optionsDynamic: collected.dynamic,
          _el: el,
        }, el, doc));
        idx++;
        return;
      }

      // ── Submit ──
      if (t === 'submit') {
        formFields.push(decorateField({
          selector: selector, id: el.id, name: el.name, value: el.value || '',
          placeholder: '', label: label || el.value || 'Submit', type: 'submit', index: idx,
          options: null, _el: el,
        }, el, doc));
        idx++;
        return;
      }

      // ── Text / email / tel / number / date / file / search / slider ──
      var type = pageSearch ? 'search' : (t === 'range' ? 'slider' : (el.type || 'text'));
      if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push(decorateField({ selector: selector, id: el.id, name: el.name, value: el.value,
        placeholder: el.placeholder || '', label: label, type: type, index: idx,
        options: null, _el: el }, el, doc));
      idx++;
    });

    // ── Emit grouped radios ──
    for (var rname in radioGroups) {
      var rg = radioGroups[rname];
      var groupLabel = rg.groupLabel || rg.options.join(' / ');
      if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push(decorateField({
        selector: '[name="' + rname + '"]',
        id: '', name: rname, value: '', placeholder: '',
        label: groupLabel, type: 'radio-group', index: rg.index,
        options: rg.options, optionDetails: rg.details, optionSelectors: rg.selectors, _el: rg.firstEl,
      }, rg.firstEl, doc));
    }

    // ── Emit grouped checkboxes ──
    for (var cname in checkboxGroups) {
      var cg = checkboxGroups[cname];
      var cgLabel = cg.groupLabel || cg.options.join(' / ');
      if (cgLabel) labelList.push(cgLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push(decorateField({
        selector: '[name="' + cname + '"]',
        id: '', name: cname, value: '', placeholder: '',
        label: cgLabel, type: 'checkbox-group', index: cg.index,
        options: cg.options, optionSelectors: cg.selectors, _el: cg.firstEl,
      }, cg.firstEl, doc));
    }

    assignSections(formFields);
    linkDependsOn(formFields);
    formFields = formFields.filter(function (f: any) {
      var el = f._el;
      var present = !el || typeof helpers.isVisuallyPresent !== 'function' || helpers.isVisuallyPresent(el);
      if (!present) f.hidden = true;
      if (f.showWhen && f.hidden) f.fillMode = f.fillMode || 'fill';
      if (f.hidden && !f.showWhen && !f.optionsDynamic && f.fillMode !== 'auto') f.fillMode = 'skip';
      if (isSystemNoise(f.label) && f.hidden) return false;
      if (f.type === 'file' && isNumericLabel(f.label) && (f.hidden || !present)) return false;
      return true;
    });
    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanStandardFields = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScanStandardFields;
