/**
 * AUTO-GENERATED — do not edit.
 * Source: autofill/extractor/capabilities/*.js + extractor.js (facade)
 * Rebuild: node extension/autofill/build-extractor-bundle.mjs
 */

/* ==== capabilities/form-context.js ==== */
/**
 * form-context — Form guard + element skip + label helpers
 *
 * Three helpers used by every extractor scan pass:
 *
 *   isInSkipContext(el)           — true if el is inside nav/header/footer/search/banner
 *   isGoodLabel(s, ccDomUtils)    — true if label is non-empty, meaningful, min 2 chars
 *   hasFormContext(doc, ccDomUtils) — true if page has a <form> OR 2+ labeled inputs
 *
 * ccDomUtils is injected (not read from window) so the functions are testable in Node.
 *
 * Public API (on globalThis.CcFormContext):
 *   isInSkipContext(el)
 *   isGoodLabel(s, ccDomUtils)
 *   hasFormContext(doc, ccDomUtils)
 *
 * See docs/form-context.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Returns true if el is inside a navigation/header/footer/search/banner context.
   * These containers are never part of a form worth filling.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function isInSkipContext(el) {
    return !!(el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
  }

  /**
   * Returns true if label string is non-empty, not just symbols, and at least 2 chars.
   * Delegates to ccDomUtils.isGoodLabel when available, falls back to inline check.
   *
   * @param {string} s
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function isGoodLabel(s, ccDomUtils) {
    if (ccDomUtils && typeof ccDomUtils.isGoodLabel === 'function') {
      return ccDomUtils.isGoodLabel(s);
    }
    // Inline fallback
    if (!s || typeof s !== 'string') return false;
    const t = s.trim();
    return t.length >= 2 && /[a-zA-Z0-9]/.test(t);
  }

  /**
   * Returns true if the page has a real form worth scanning.
   * Requires either a <form> element OR at least 2 labeled visible inputs.
   *
   * @param {Document} doc
   * @param {object} [ccDomUtils]
   * @returns {boolean}
   */
  function hasFormContext(doc, ccDomUtils) {
    const forms = doc.querySelectorAll('form');
    if (forms.length > 0) return true;
    // No <form> tag — check for 2+ labeled inputs (some govt sites don't use <form>)
    const inputs = doc.querySelectorAll(
      'input[type="text"],input[type="email"],input[type="tel"],textarea'
    );
    let labeled = 0;
    inputs.forEach(function (el) {
      if (!isInSkipContext(el)) {
        const lbl = ccDomUtils && typeof ccDomUtils.getLabel === 'function'
          ? ccDomUtils.getLabel(el)
          : el.placeholder || '';
        if (lbl) labeled++;
      }
    });
    return labeled >= 2;
  }

  root.CcFormContext = { isInSkipContext, isGoodLabel, hasFormContext };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/scan-standard-fields.js ==== */
/**
 * scan-standard-fields — Standard input/select/radio/checkbox scanner
 *
 * Loops all input/textarea/select elements in the document. Skips
 * hidden/submit/search/password/captcha inputs and elements in skip contexts.
 *
 * Handles:
 *   - Radio buttons: grouped by name, label from legend/fieldset/container
 *   - Checkboxes: agreement checkboxes stay individual; others grouped by name
 *   - <select>: options captured, type = 'dropdown'
 *   - Everything else: text/email/tel/number/date/file inputs
 *
 * Public API (on globalThis.CcScanStandardFields):
 *   scan(doc, helpers) => { formFields, labelList }
 *
 * helpers: { isInSkipContext, getLabel, isGoodLabel }
 *
 * See docs/scan-standard-fields.md for full documentation.
 */
(function (root) {
  'use strict';

  var INPUT_SELECTOR = (
    'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
    'input[type="file"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
  );

  var SKIP_META_RE = /search|query|filter|captcha|otp|token|csrf|recaptcha/i;
  var AGREEMENT_RE = /\b(i\s+)?(agree|accept|confirm|declare|certify|consent|terms|self.declaration)\b/i;

  function makeSelector(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    if (el.name) return '[name="' + el.name + '"]';
    return null;
  }

  function makeRadioSelector(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[name="' + el.name + '"][value="' + el.value + '"]';
  }

  function resolveRadioGroupLabel(el, isGoodLabel) {
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

  function resolveCheckboxGroupLabel(el, isGoodLabel) {
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

    inputs.forEach(function (el) {
      var t = el.type;
      if (t === 'hidden' || t === 'submit' || t === 'button' ||
          t === 'search' || t === 'password' || t === 'image' || t === 'reset') return;
      if (isInSkipContext(el)) return;

      var meta = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || '')).toLowerCase();
      if (SKIP_META_RE.test(meta)) return;

      // ── Radio ──
      if (t === 'radio' && el.name) {
        if (!radioGroups[el.name]) {
          radioGroups[el.name] = {
            options: [], selectors: [],
            groupLabel: resolveRadioGroupLabel(el, isGoodLabel),
            index: idx, firstEl: el,
          };
        }
        radioGroups[el.name].options.push(getLabel(el) || el.value || '');
        radioGroups[el.name].selectors.push(makeRadioSelector(el));
        idx++;
        return;
      }

      // ── Checkbox ──
      if (t === 'checkbox' && el.name) {
        var lbl = getLabel(el) || el.value || '';
        if (AGREEMENT_RE.test(lbl)) {
          var sel = makeSelector(el) || '[name="' + el.name + '"]';
          formFields.push({ selector: sel, id: el.id, name: el.name, value: el.value,
            placeholder: '', label: lbl, type: 'checkbox-agreement', index: idx, options: null, _el: el });
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
      var selector = makeSelector(el) || 'form-field-' + idx;

      // ── Select ──
      if (el.tagName === 'SELECT') {
        var options = Array.from(el.querySelectorAll('option'))
          .map(function (o) { return o.textContent.trim(); })
          .filter(function (t) { return t && !/^(select|choose|--)/i.test(t); });
        if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
        formFields.push({ selector: selector, id: el.id, name: el.name, value: el.value,
          placeholder: el.placeholder || '', label: label, type: 'dropdown', index: idx,
          options: options.length > 0 ? options : null, _el: el });
        idx++;
        return;
      }

      // ── Text / email / tel / number / date / file ──
      var type = el.type || 'text';
      if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({ selector: selector, id: el.id, name: el.name, value: el.value,
        placeholder: el.placeholder || '', label: label, type: type, index: idx,
        options: null, _el: el });
      idx++;
    });

    // ── Emit grouped radios ──
    for (var rname in radioGroups) {
      var rg = radioGroups[rname];
      var groupLabel = rg.groupLabel || rg.options.join(' / ');
      if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: '[name="' + rname + '"]',
        id: '', name: rname, value: '', placeholder: '',
        label: groupLabel, type: 'radio-group', index: rg.index,
        options: rg.options, optionSelectors: rg.selectors, _el: rg.firstEl,
      });
    }

    // ── Emit grouped checkboxes ──
    for (var cname in checkboxGroups) {
      var cg = checkboxGroups[cname];
      var cgLabel = cg.groupLabel || cg.options.join(' / ');
      if (cgLabel) labelList.push(cgLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: '[name="' + cname + '"]',
        id: '', name: cname, value: '', placeholder: '',
        label: cgLabel, type: 'checkbox-group', index: cg.index,
        options: cg.options, optionSelectors: cg.selectors, _el: cg.firstEl,
      });
    }

    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanStandardFields = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/scan-mat-widgets.js ==== */
/**
 * scan-mat-widgets — Angular Material widget scanner
 *
 * Scans mat-select, mat-checkbox, mat-radio-button elements not captured
 * by the standard input scan. Assigns data-cc-id when no id is present.
 *
 * Public API (on globalThis.CcScanMatWidgets):
 *   scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }
 *
 * helpers: { isInSkipContext, getLabel, isGoodLabel }
 * startIdx: index counter to continue from (avoids collisions with standard scan)
 *
 * See docs/scan-mat-widgets.md for full documentation.
 */
(function (root) {
  'use strict';

  function makeSelector(el, fallbackId) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[data-cc-id="' + fallbackId + '"]';
  }

  function isAlreadyCaptured(el, existingFields) {
    var sel = el.id
      ? (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id)
      : (el.name ? '[name="' + el.name + '"]' : null);
    if (!sel) return false;
    return existingFields.some(function (f) { return f.selector === sel; });
  }

  /**
   * @param {Document} doc
   * @param {Array} existingFields — already-captured fields (to avoid double-capture)
   * @param {{ isInSkipContext, getLabel, isGoodLabel }} helpers
   * @param {number} startIdx — starting index (default 10000)
   * @returns {{ formFields: Array, labelList: Array }}
   */
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 10000;
    var formFields = [];
    var labelList = [];

    // ── mat-select and mat-form-field select ──
    doc.querySelectorAll('mat-select,mat-form-field select').forEach(function (el) {
      if (isInSkipContext(el)) return;
      if (el.tagName === 'SELECT' && isAlreadyCaptured(el, existingFields)) return;
      var label = getLabel(el) || el.getAttribute('aria-label') || '';
      if (!isGoodLabel(label)) return;
      var id = el.id || ('mat-select-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      var type = el.tagName === 'SELECT' ? 'select' : 'mat-select';
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: makeSelector(el, id),
        id: id,
        name: el.getAttribute('formcontrolname') || el.name || '',
        value: '', placeholder: '', label: label, type: type, index: idx++, _el: el,
      });
    });

    // ── mat-checkbox ──
    doc.querySelectorAll('mat-checkbox').forEach(function (el) {
      if (isInSkipContext(el)) return;
      var label = getLabel(el) || el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var id = el.id || ('mat-cb-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      formFields.push({
        selector: makeSelector(el, id),
        id: id, name: '', value: '', placeholder: '',
        label: label, type: 'mat-checkbox', index: idx++, _el: el,
      });
    });

    // ── mat-radio-button ──
    doc.querySelectorAll('mat-radio-button').forEach(function (el) {
      if (isInSkipContext(el)) return;
      var label = el.textContent.trim().slice(0, 40);
      if (!isGoodLabel(label)) return;
      var group = el.closest('mat-radio-group');
      var name = el.getAttribute('name') || (group && group.getAttribute('formcontrolname')) || '';
      var id = el.id || ('mat-rb-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      formFields.push({
        selector: makeSelector(el, id),
        id: id, name: name, value: label, placeholder: '',
        label: label, type: 'mat-radio', index: idx++, _el: el,
      });
    });

    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanMatWidgets = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/scan-ng-dropdowns.js ==== */
/**
 * scan-ng-dropdowns — ng-select / combobox / custom dropdown scanner
 *
 * Captures Angular ng-select and custom dropdown widgets not covered by
 * the standard input scan or mat-widget scan. Two strategies:
 *
 *   1. role=combobox / role=listbox (non-input, non-search)
 *   2. Explicit ng-select containers + trigger-based indirect detection
 *      (.value-area, .ng-value-container, .ng-select-container)
 *      Used by SSC/RRB/NTA forms where id="dropsection" is reused for ALL dropdowns.
 *
 * Assigns unique data-cc-id (ng-dd-N) to force unique selectors.
 * Skips elements already captured in existingFields.
 *
 * Public API (on globalThis.CcScanNgDropdowns):
 *   scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }
 *
 * See docs/scan-ng-dropdowns.md for full documentation.
 */
(function (root) {
  'use strict';

  var NG_TRIGGER_SEL = '.value-area, .select-type, .ng-value-container, .ng-select-container';
  var NG_CONTAINER_SEL = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, [class*="custom-dropdown"], [class*="select-control"]';

  function isAlreadyCaptured(el, existingFields) {
    return existingFields.some(function (f) {
      try {
        if (el.matches && el.matches(f.selector)) return true;
        if (el.querySelector && el.querySelector(f.selector)) return true;
        if (el.closest && el.closest(f.selector)) return true;
        return false;
      } catch (e) { return false; }
    });
  }

  function resolveLabel(el, getLabel) {
    var label = (getLabel(el) || el.getAttribute('aria-label') || '').trim();
    if (!label) {
      var childLabel = el.querySelector && el.querySelector(
        ':scope > .label, :scope > label, :scope > .field-label, :scope > [class*="label"]'
      );
      if (childLabel) label = childLabel.textContent.trim();
    }
    if (!label) {
      var all = el.querySelectorAll && el.querySelectorAll('.label, .field-label, [class*="label"]');
      if (all) {
        var dl = Array.from(all).find(function (n) {
          return !(n.closest && n.closest('.value-area, .options-list, .ng-dropdown-panel, .dropdown-options'));
        });
        if (dl) label = dl.textContent.trim();
      }
    }
    return (label || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {Document} doc
   * @param {Array} existingFields
   * @param {{ isInSkipContext, getLabel, isGoodLabel }} helpers
   * @param {number} startIdx
   * @returns {{ formFields: Array, labelList: Array }}
   */
  function scan(doc, existingFields, helpers, startIdx) {
    var isInSkipContext = helpers.isInSkipContext;
    var getLabel = helpers.getLabel;
    var isGoodLabel = helpers.isGoodLabel;
    var idx = typeof startIdx === 'number' ? startIdx : 10000;
    var formFields = [];
    var labelList = [];

    // ── role=combobox / role=listbox ──
    doc.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(function (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      if (isInSkipContext(el)) return;
      var meta = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
      if (/search|query|filter/i.test(meta)) return;
      var label = getLabel(el) || el.getAttribute('aria-label') || '';
      if (!isGoodLabel(label)) return;
      var tagLower = el.tagName.toLowerCase();
      var isNg = tagLower === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')));
      var type = isNg ? 'ng-dropdown' : 'mat-select';
      var id = el.id || ('combobox-' + idx);
      if (!el.id) el.setAttribute('data-cc-id', id);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: el.id ? (el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id) : '[data-cc-id="' + id + '"]',
        id: id, name: el.getAttribute('formcontrolname') || '',
        value: '', placeholder: '', label: label, type: type, index: idx++, _el: el,
      });
    });

    // ── ng-select / custom dropdown containers ──
    var ngCandidates = new Set();
    doc.querySelectorAll(NG_CONTAINER_SEL).forEach(function (el) { ngCandidates.add(el); });
    doc.querySelectorAll(NG_TRIGGER_SEL).forEach(function (trigger) {
      var container = trigger.closest && trigger.closest(
        'mat-form-field, .form-field, .form-group, [class*="dropdown"], [class*="select"]'
      );
      if (!container) container = trigger.parentElement;
      if (container && container !== doc.body) ngCandidates.add(container);
    });

    ngCandidates.forEach(function (el) {
      if (isInSkipContext(el)) return;
      if (isAlreadyCaptured(el, existingFields.concat(formFields))) return;
      var label = resolveLabel(el, getLabel);
      if (!isGoodLabel(label)) return;
      var ddId = 'ng-dd-' + idx;
      el.setAttribute('data-cc-id', ddId);
      labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({
        selector: '[data-cc-id="' + ddId + '"]',
        id: ddId,
        name: el.getAttribute('formcontrolname') || el.getAttribute('name') || '',
        value: '', placeholder: '', label: label, type: 'ng-dropdown', index: idx++, _el: el,
      });
    });

    return { formFields: formFields, labelList: labelList };
  }

  root.CcScanNgDropdowns = { scan: scan };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/sort-fields-visual.js ==== */
/**
 * sort-fields-visual — Visual position sort for form fields
 *
 * Sorts formFields[] by true rendered position using getBoundingClientRect.
 * Fields within ROW_BAND (8px) vertically are treated as the same row and
 * sorted left-to-right within that row. Unrendered / display:none fields
 * (width=0, height=0, top=0, left=0) are sent to the end.
 *
 * Reassigns .index after sort. Requires _el references to be present.
 * _el refs are stripped by the fingerprint step after this runs.
 *
 * Public API (on globalThis.CcSortFieldsVisual):
 *   sort(formFields) — mutates in-place, reassigns .index, returns formFields
 *
 * See docs/sort-fields-visual.md for full documentation.
 */
(function (root) {
  'use strict';

  var ROW_BAND = 8; // px — fields within this vertical distance are the same row

  function visualPos(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') {
      return { row: 1e9, left: 1e9 };
    }
    var r = el.getBoundingClientRect();
    var top = r.top + ((typeof window !== 'undefined' && window.pageYOffset) || 0);
    var left = r.left + ((typeof window !== 'undefined' && window.pageXOffset) || 0);
    // Unrendered / display:none → send to end
    if (r.width === 0 && r.height === 0 && top === 0 && left === 0) {
      return { row: 1e9, left: 1e9 };
    }
    return { row: Math.round(top / ROW_BAND), left: Math.round(left) };
  }

  /**
   * Sort formFields by visual position (top-to-bottom, left-to-right).
   * Mutates the array in-place and reassigns .index.
   *
   * @param {Array} formFields
   * @returns {Array} formFields (same reference)
   */
  function sort(formFields) {
    formFields.forEach(function (f) { f._pos = visualPos(f._el); });
    formFields.sort(function (a, b) {
      return (a._pos.row - b._pos.row) || (a._pos.left - b._pos.left);
    });
    formFields.forEach(function (f, i) { f.index = i; delete f._pos; });
    return formFields;
  }

  root.CcSortFieldsVisual = { sort: sort, ROW_BAND: ROW_BAND };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/fingerprint-form.js ==== */
/**
 * fingerprint-form — Form fingerprinting + pageModel assembly
 *
 * Produces two stable form identifiers from a scanned field set:
 *
 *   formKey         — djb2 hash of "hostname::title::top10Labels"
 *                     Fast, DOM-structure-sensitive identifier
 *
 *   semanticFormKey — djb2 hash of "hostname|top15NormalizedLabels"
 *                     Stable across DOM changes (label-text based), prefixed "s_"
 *
 * Optionally builds a PageModel via ccModels.createPageModel if provided.
 * Strips _el DOM references from all fields (not serialisable across
 * chrome.scripting.executeScript boundary).
 *
 * Public API (on globalThis.CcFingerprintForm):
 *   fingerprint(formFields, labelList, opts) => { formKey, semanticFormKey, pageModel }
 *
 * opts: { hostname, title, ccModels? }
 * Side effect: strips _el from every field in formFields.
 *
 * See docs/fingerprint-form.md for full documentation.
 */
(function (root) {
  'use strict';

  function djb2(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * @param {Array} formFields  — field objects (will have _el stripped in-place)
   * @param {Array} labelList   — flat label strings collected during scan
   * @param {{ hostname: string, title: string, ccModels?: object }} opts
   * @returns {{ formKey: string, semanticFormKey: string, pageModel: object|null }}
   */
  function fingerprint(formFields, labelList, opts) {
    opts = opts || {};
    var hostname = opts.hostname || '';
    var title = opts.title || '';
    var ccModels = opts.ccModels || null;

    // ── formKey: top-10 labels sorted ──
    var labelSig = labelList.slice().sort().slice(0, 10).join('|');
    var formKey = djb2(hostname + '::' + title + '::' + labelSig);

    // ── semanticFormKey: top-15 normalized labels sorted ──
    var semanticLabels = formFields
      .map(function (f) {
        return (f.label || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
      })
      .filter(function (l) { return l.length > 2; })
      .sort()
      .slice(0, 15);
    var semRaw = hostname + '|' + semanticLabels.join('|');
    var semanticFormKey = 's_' + djb2(semRaw);

    // ── pageModel (optional) ──
    var pageModel = null;
    if (ccModels && typeof ccModels.createPageModel === 'function') {
      pageModel = ccModels.createPageModel(
        { formFields: formFields, formKey: formKey, semanticFormKey: semanticFormKey },
        { url: opts.url || '', hostname: hostname, title: title }
      );
    }

    // ── Strip DOM references (not serialisable) ──
    formFields.forEach(function (f) { delete f._el; });

    return { formKey: formKey, semanticFormKey: semanticFormKey, pageModel: pageModel };
  }

  root.CcFingerprintForm = { fingerprint: fingerprint, _djb2: djb2 };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== capabilities/correction-observer.js ==== */
/**
 * correction-observer — Post-fill correction + enrichment listeners
 *
 * Two listeners installed after autofill completes:
 *
 * 1. Correction listener (filled fields):
 *    Watches each autofilled field for 'change' events. When the user
 *    changes a value, finds the matching profile key and POSTs a correction
 *    to the backend (/mappings/:formKey) after a 1500ms debounce.
 *    Saves pending corrections to sessionStorage._cc_corrections.
 *
 * 2. Enrichment listener (unfilled fields):
 *    Watches unfilled inputs for 'blur' events. If the user fills a field
 *    the extension missed, validates it (dob/pincode/mobile/aadhaar/name)
 *    and saves to sessionStorage._cc_enrichments.
 *
 * Public API (on globalThis.CcCorrectionObserver):
 *   inject(mapping, filledBySource, profile, backendUrl, formKey, doc?)
 *
 * See docs/correction-observer.md for full documentation.
 */
(function (root) {
  'use strict';

  var SKIP_LABELS_RE = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  var SKIP_TYPES = ['select', 'checkbox', 'radio', 'hidden', 'submit', 'button'];

  var SEMANTIC_ALIASES = {
    'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
    'date of birth': 'dob', 'fathers name': 'father_name', 'mothers name': 'mother_name',
    'aadhaar no': 'aadhaar_number', 'mobile no': 'mobile', 'email id': 'email',
    'pin code': 'pincode', 'permanent address': 'address',
  };

  function resolveEl(selector, doc) {
    if (selector.startsWith('form-field-')) {
      var i = parseInt(selector.split('-')[2]);
      var all = doc.querySelectorAll('input,select,textarea');
      return all[i] || null;
    }
    return doc.querySelector(selector);
  }

  function makeSelectorFromEl(el) {
    if (el.id) return el.id.match(/^\d/) ? '[id="' + el.id + '"]' : '#' + el.id;
    return '[name="' + el.name + '"]';
  }

  function getLabelForEl(el, doc) {
    if (el.id) {
      var l = doc.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent.trim();
    }
    var td = el.closest && el.closest('td');
    if (td && td.previousElementSibling) return td.previousElementSibling.textContent.trim();
    return el.placeholder || '';
  }

  function isValidValue(semanticKey, val) {
    if (semanticKey === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
    if (semanticKey === 'pincode') return /^\d{6}$/.test(val);
    if (semanticKey === 'mobile') return /^\d{10}$/.test(val);
    if (semanticKey === 'aadhaar_number') return /^\d{12}$/.test(val);
    if (['name', 'father_name', 'mother_name'].includes(semanticKey)) return /^[a-zA-Z\s.]{2,60}$/.test(val);
    return val.length >= 2 && val.length <= 200;
  }

  /**
   * Install correction + enrichment listeners on the page.
   *
   * @param {object} mapping        — { selector: { value, ... } }
   * @param {object} filledBySource — { selector: { semanticKey, profileKey, ... } }
   * @param {object} profile        — { profileKey: value }
   * @param {string} backendUrl     — backend base URL (may be null/empty)
   * @param {string} formKey        — form identifier
   * @param {Document} [doc]        — defaults to globalThis.document
   */
  function inject(mapping, filledBySource, profile, backendUrl, formKey, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    var corrections = [];
    var enrichments = [];

    // ── Correction listener (filled fields) ──
    for (var selector in mapping) {
      try {
        var entry = mapping[selector];
        var originalValue = entry.value;
        var info = filledBySource[selector];
        if (!info) continue;
        var el = resolveEl(selector, doc);
        if (!el) continue;

        (function (el, originalValue, info) {
          el.addEventListener('change', function () {
            var newVal = el.value;
            if (newVal === originalValue) return;
            var correctedKey = null;
            for (var k in profile) {
              if (profile[k] === newVal) { correctedKey = k; break; }
            }
            if (!correctedKey) {
              if (typeof console !== 'undefined') console.debug('[CC] correction: no profileKey for value', newVal);
              return;
            }
            var already = corrections.some(function (c) {
              return c.semanticKey === info.semanticKey && c.newKey === correctedKey;
            });
            if (already) return;
            corrections.push({ semanticKey: info.semanticKey, oldKey: info.profileKey, newKey: correctedKey });
            try { sessionStorage.setItem('_cc_corrections', JSON.stringify(corrections)); } catch (e) {}
            if (!backendUrl || !formKey) return;
            clearTimeout(el._ccTimer);
            el._ccTimer = setTimeout(function () {
              var pending = [];
              try { pending = JSON.parse(sessionStorage.getItem('_cc_corrections') || '[]'); } catch (e) {}
              var updates = {};
              pending.forEach(function (c) {
                if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
              });
              if (!Object.keys(updates).length) return;
              fetch(backendUrl + '/mappings/' + formKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates: updates, formKey: formKey }),
              }).then(function () {
                try { sessionStorage.removeItem('_cc_corrections'); } catch (e) {}
              }).catch(function (e) {
                if (typeof console !== 'undefined') console.warn('[CC] correction save failed', e);
              });
            }, 1500);
          });
        }(el, originalValue, info));
      } catch (e) { /* skip */ }
    }

    // ── Enrichment listener (unfilled fields) ──
    doc.querySelectorAll('input,textarea').forEach(function (el) {
      if (SKIP_TYPES.indexOf(el.type) !== -1) return;
      var sel = makeSelectorFromEl(el);
      if (mapping[sel]) return;
      var label = getLabelForEl(el, doc);
      if (!label || SKIP_LABELS_RE.test(label)) return;
      var normalized = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      var semanticKey = SEMANTIC_ALIASES[normalized] || normalized;

      el.addEventListener('blur', function () {
        var val = el.value.trim();
        if (!val || val.length < 2) return;
        if (!isValidValue(semanticKey, val)) return;
        if (profile[semanticKey]) return;
        enrichments.push({ semanticKey: semanticKey, value: val, label: label });
        try { sessionStorage.setItem('_cc_enrichments', JSON.stringify(enrichments)); } catch (e) {}
      });
    });
  }

  root.CcCorrectionObserver = {
    inject: inject,
    _isValidValue: isValidValue,
    _SEMANTIC_ALIASES: SEMANTIC_ALIASES,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== extractor.js (facade) ==== */
/**
 * Extractor facade — thin wrapper over CcExtract* capabilities.
 *
 * Parts under autofill/extractor/capabilities/ are injected before this file.
 * Public API unchanged:
 *   extractFormFieldsWithFingerprint() => { formFields, formKey, semanticFormKey, pageModel }
 *   injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey)
 */

// ── extractFormFieldsWithFingerprint ──────────────────────────────────────────
function extractFormFieldsWithFingerprint() {
  var _fc  = globalThis.CcFormContext        || {};
  var _ssf = globalThis.CcScanStandardFields || {};
  var _smw = globalThis.CcScanMatWidgets     || {};
  var _sng = globalThis.CcScanNgDropdowns    || {};
  var _sfv = globalThis.CcSortFieldsVisual   || {};
  var _fp  = globalThis.CcFingerprintForm    || {};

  var ccDomUtils = window.ccDomUtils || {};
  var doc = document;

  var helpers = {
    isInSkipContext: function (el) {
      return _fc.isInSkipContext ? _fc.isInSkipContext(el) :
        !!(el.closest && el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
    },
    getLabel: function (el) {
      return ccDomUtils.getLabel ? ccDomUtils.getLabel(el) : (el.placeholder || '');
    },
    isGoodLabel: function (s) {
      return _fc.isGoodLabel ? _fc.isGoodLabel(s, ccDomUtils) :
        !!(s && s.trim().length >= 2 && /[a-zA-Z0-9]/.test(s));
    },
  };

  // Guard — bail early if no form context
  if (_fc.hasFormContext && !_fc.hasFormContext(doc, ccDomUtils)) {
    return { formFields: [], formKey: '' };
  }

  // Collect all fields from all scan passes
  var formFields = [];
  var labelList  = [];

  if (_ssf.scan) {
    var std = _ssf.scan(doc, helpers);
    formFields = formFields.concat(std.formFields);
    labelList  = labelList.concat(std.labelList);
  }

  if (_smw.scan) {
    var mat = _smw.scan(doc, formFields, helpers, 10000);
    formFields = formFields.concat(mat.formFields);
    labelList  = labelList.concat(mat.labelList);
  }

  if (_sng.scan) {
    var ng = _sng.scan(doc, formFields, helpers, 10000 + formFields.length);
    formFields = formFields.concat(ng.formFields);
    labelList  = labelList.concat(ng.labelList);
  }

  // Sort by visual position (_el refs still present here)
  if (_sfv.sort) _sfv.sort(formFields);

  // Fingerprint + strip _el
  var hostname = location.hostname;
  var title = (document.querySelector('h1,h2,legend,.form-title,.page-title')
    ?.textContent || document.title || '').trim().slice(0, 50);

  var result = { formKey: '', semanticFormKey: '', pageModel: null };
  if (_fp.fingerprint) {
    result = _fp.fingerprint(formFields, labelList, {
      hostname: hostname,
      title: title,
      url: location.href,
      ccModels: (typeof window !== 'undefined' && window.ccModels) || null,
    });
  }

  return {
    formFields: formFields,
    formKey: result.formKey,
    semanticFormKey: result.semanticFormKey,
    pageModel: result.pageModel,
  };
}

// ── injectCorrectionObserver ──────────────────────────────────────────────────
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  var _co = globalThis.CcCorrectionObserver || {};
  if (_co.inject) {
    _co.inject(mapping, filledBySource, profile, backendUrl, formKey, document);
  }
}
