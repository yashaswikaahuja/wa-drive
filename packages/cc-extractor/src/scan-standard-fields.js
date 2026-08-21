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

if (typeof module !== 'undefined') module.exports = root.CcScanStandardFields;
