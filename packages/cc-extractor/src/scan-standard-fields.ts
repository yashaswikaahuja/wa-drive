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
    'input[type="search"],input[type="file"],input[type="radio"],input[type="checkbox"],input[type="range"],input:not([type]),textarea,select,' +
    // iframe bodies (TinyMCE on The Internet) — not added to FORM_FIELD_QUERY so form-field-N stays stable
    '[contenteditable="true"],[contenteditable=""]'
  );

  // Site chrome / security — NOT journey search. "search" alone is OK when journey-like (#311).
  var SKIP_META_HARD_RE = /captcha|otp|token|csrf|recaptcha/i;
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
    if (SKIP_META_HARD_RE.test(meta)) return false;
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
      if (typeof helpers.isVisuallyPresent === 'function' && !helpers.isVisuallyPresent(el)) {
        var kind = String(el.type || '').toLowerCase();
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
      if (t === 'hidden' || t === 'submit' || t === 'button' ||
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
        formFields.push({
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
        });
        idx++;
        return;
      }

      var meta = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || '')).toLowerCase();
      var pageSearch = isPageSearch(el);
      if (SKIP_META_HARD_RE.test(meta)) return;
      if (SKIP_META_SOFT_RE.test(meta) && !pageSearch && !isJourneyMeta(meta, getLabel(el) || el.placeholder || '')) return;

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
      // Last-resort: humanize name/id so we never emit blank labels (sessions UI
      // otherwise falls back to selector / semantic ids).
      if (!label && helpers.humanizeAttr) {
        label = helpers.humanizeAttr(el.name || el.id || '') || '';
      } else if (!label && typeof window !== 'undefined' && window.ccDomUtils && window.ccDomUtils.humanizeAttr) {
        label = window.ccDomUtils.humanizeAttr(el.name || el.id || '') || '';
      }
      var selector = makeSelector(el, doc);
      // type=search is outside FORM_FIELD_QUERY on purpose, so a kept counter
      // must not become form-field-N. That index would point at a different input.
      if (!selector && pageSearch) selector = uniqueSearchSelector(el, doc);
      if (!selector && pageSearch) return;
      if (!selector && t === 'range') selector = uniqueRangeSelector(el, doc);
      if (!selector) selector = 'form-field-' + idx;

      // ── Select ──
      if (el.tagName === 'SELECT') {
        var options = Array.from(el.querySelectorAll('option'))
          .map(function (o: any) { return o.textContent.trim(); })
          .filter(function (t: any) { return t && !/^(select|choose|--)/i.test(t); });
        if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
        formFields.push({ selector: selector, id: el.id, name: el.name, value: el.value,
          placeholder: el.placeholder || '', label: label, type: 'dropdown', index: idx,
          options: options.length > 0 ? options : null, _el: el });
        idx++;
        return;
      }

      // ── Text / email / tel / number / date / file / search / slider ──
      var type = pageSearch ? 'search' : (t === 'range' ? 'slider' : (el.type || 'text'));
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

if (typeof module !== 'undefined') module.exports = root.CcScanStandardFields;
