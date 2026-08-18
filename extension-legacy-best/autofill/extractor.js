// ── Content script functions (run in page context) ────────────────────────────
function extractFormFieldsWithFingerprint() {
  const hostname = location.hostname;
  const title = (document.querySelector('h1,h2,legend,.form-title,.page-title')?.textContent || document.title || '').trim().slice(0, 50);
  const labelList = [];
  const formFields = [];

  // ── Skip elements inside nav/header/search/footer contexts ──
  function isInSkipContext(el) {
    return !!(el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
  }

  // ── Meaningful label: must be non-empty, not just symbols, min 2 chars ──
  function isGoodLabel(s) {
    return window.ccDomUtils.isGoodLabel(s);
  }

  // ── Get label for an input element ──
  function getLabel(el) {
    // Delegate to shared/dom-utils.js (injected before extractor runs)
    return window.ccDomUtils.getLabel(el);
  }

  // ── Determine if a page has a real form worth scanning ──
  // Must have at least 2 labeled inputs to be considered a form page
  function hasFormContext() {
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) return true;
    // No <form> tag but has multiple labeled inputs (some govt sites don't use <form>)
    const inputs = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],textarea');
    let labeled = 0;
    inputs.forEach(el => { if (!isInSkipContext(el) && getLabel(el)) labeled++; });
    return labeled >= 2;
  }

  if (!hasFormContext()) return { formFields: [], formKey: '' };

  // ── Scan standard inputs ──
  const inputs = document.querySelectorAll(
    'input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],' +
    'input[type="file"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select'
  );

  // ── Group radios and checkboxes by name ──
  const radioGroups = {}; // name → { labels: [], selectors: [], groupLabel: '' }
  const checkboxGroups = {}; // name → { labels: [], selectors: [], groupLabel: '' }

  let idx = 0;
  inputs.forEach((el) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' ||
        el.type === 'search' || el.type === 'password' ||
        el.type === 'image' || el.type === 'reset') return;
    if (isInSkipContext(el)) return;
    // Skip inputs that are clearly search/filter (by name/id/class)
    const meta = ((el.id || '') + ' ' + (el.name || '') + ' ' + (el.className || '')).toLowerCase();
    if (/search|query|filter|captcha|otp|token|csrf|recaptcha/i.test(meta)) return;

    // Group radio buttons by name
    if (el.type === 'radio' && el.name) {
      if (!radioGroups[el.name]) {
        radioGroups[el.name] = { options: [], selectors: [], groupLabel: '', index: idx, firstEl: el };
        // Try to find a group-level label (legend, preceding heading, or fieldset label)
        const fieldset = el.closest('fieldset');
        const legend = fieldset && fieldset.querySelector('legend');
        if (legend && isGoodLabel(legend.textContent.trim())) {
          radioGroups[el.name].groupLabel = legend.textContent.trim();
        } else {
          // Look for a label/heading before this radio group's container
          const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div');
          if (container) {
            const lbl = container.querySelector('label,.label,.field-label,td:first-child');
            if (lbl && !lbl.querySelector('input') && isGoodLabel(lbl.textContent.trim())) {
              radioGroups[el.name].groupLabel = lbl.textContent.trim();
            }
          }
        }
      }
      const optLabel = getLabel(el) || el.value || '';
      radioGroups[el.name].options.push(optLabel);
      radioGroups[el.name].selectors.push(el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[name="${el.name}"][value="${el.value}"]`);
      idx++;
      return;
    }

    // Group non-agreement checkboxes by name (agreements handled separately)
    if ((el.type === 'checkbox') && el.name) {
      const lbl = getLabel(el) || el.value || '';
      const isAgreement = /\b(i\s+)?(agree|accept|confirm|declare|certify|consent|terms|self.declaration)\b/i.test(lbl);
      if (isAgreement) {
        // Agreement checkboxes stay as individual fields
        const selector = el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[name="${el.name}"]`;
        formFields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: '', label: lbl, type: 'checkbox-agreement', index: idx, options: null, _el: el });
        idx++;
        return;
      }
      if (!checkboxGroups[el.name]) {
        checkboxGroups[el.name] = { options: [], selectors: [], groupLabel: '', index: idx, firstEl: el };
        const container = el.closest('.form-group,.form-field,[class*="form-row"],tr,div,fieldset');
        if (container) {
          const legend = container.querySelector('legend');
          const lbl2 = legend || container.querySelector('label:not(:has(input)),.label,.field-label');
          if (lbl2 && isGoodLabel(lbl2.textContent.trim())) checkboxGroups[el.name].groupLabel = lbl2.textContent.trim();
        }
      }
      checkboxGroups[el.name].options.push(lbl);
      checkboxGroups[el.name].selectors.push(el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[name="${el.name}"][value="${el.value}"]`);
      idx++;
      return;
    }

    const label = getLabel(el);
    const selector = el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : el.name ? `[name="${el.name}"]` : `form-field-${idx}`;

    // For <select>, capture options
    if (el.tagName === 'SELECT') {
      const options = Array.from(el.querySelectorAll('option')).map(o => o.textContent.trim()).filter(t => t && !/^(select|choose|--)/i.test(t));
      if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
      formFields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: el.placeholder || '', label, type: 'dropdown', index: idx, options: options.length > 0 ? options : null, _el: el });
      idx++;
      return;
    }

    const type = el.type || 'text';
    if (label) labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector, id: el.id, name: el.name, value: el.value, placeholder: el.placeholder || '', label, type, index: idx, options: null, _el: el });
    idx++;
  });

  // ── Emit grouped radio fields ──
  for (const [name, group] of Object.entries(radioGroups)) {
    const groupLabel = group.groupLabel || group.options.join(' / ');
    if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({
      selector: `[name="${name}"]`,
      id: '', name,
      value: '',
      placeholder: '',
      label: groupLabel,
      type: 'radio-group',
      index: group.index,
      options: group.options,
      optionSelectors: group.selectors,
      _el: group.firstEl,
    });
  }

  // ── Emit grouped checkbox fields ──
  for (const [name, group] of Object.entries(checkboxGroups)) {
    const groupLabel = group.groupLabel || group.options.join(' / ');
    if (groupLabel) labelList.push(groupLabel.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({
      selector: `[name="${name}"]`,
      id: '', name,
      value: '',
      placeholder: '',
      label: groupLabel,
      type: 'checkbox-group',
      index: group.index,
      options: group.options,
      optionSelectors: group.selectors,
      _el: group.firstEl,
    });
  }

  // (final visual-position sort happens after all widgets are collected — see below)

  // ── Angular Material: mat-select ──
  let matIdx = 10000;
  document.querySelectorAll('mat-select,mat-form-field select').forEach(el => {
    if (isInSkipContext(el)) return;
    if (el.tagName === 'SELECT' && formFields.some(f => f.selector === (el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : '#'+el.id) : `[name="${el.name}"]`))) return;
    const label = getLabel(el) || el.getAttribute('aria-label') || '';
    if (!isGoodLabel(label)) return;
    const id = el.id || `mat-select-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    const type = el.tagName === 'SELECT' ? 'select' : 'mat-select';
    labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector: el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[data-cc-id="${id}"]`, id, name: el.getAttribute('formcontrolname') || el.name || '', value: '', placeholder: '', label, type, index: matIdx++, _el: el });
  });

  // ── mat-checkbox / mat-radio ──
  document.querySelectorAll('mat-checkbox').forEach(el => {
    if (isInSkipContext(el)) return;
    const label = getLabel(el) || el.textContent.trim().slice(0, 40);
    if (!isGoodLabel(label)) return;
    const id = el.id || `mat-cb-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    formFields.push({ selector: el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[data-cc-id="${id}"]`, id, name: '', value: '', placeholder: '', label, type: 'mat-checkbox', index: matIdx++, _el: el });
  });
  document.querySelectorAll('mat-radio-button').forEach(el => {
    if (isInSkipContext(el)) return;
    const label = el.textContent.trim().slice(0, 40);
    if (!isGoodLabel(label)) return;
    const name = el.getAttribute('name') || el.closest('mat-radio-group')?.getAttribute('formcontrolname') || '';
    const id = el.id || `mat-rb-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    formFields.push({ selector: el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[data-cc-id="${id}"]`, id, name, value: label, placeholder: '', label, type: 'mat-radio', index: matIdx++, _el: el });
  });

  // ── role=combobox (non-input, non-search) ──
  document.querySelectorAll('[role="combobox"],[role="listbox"]').forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    if (isInSkipContext(el)) return;
    const meta = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
    if (/search|query|filter/i.test(meta)) return;
    const label = getLabel(el) || el.getAttribute('aria-label') || '';
    if (!isGoodLabel(label)) return;
    // Detect ng-select vs true mat-select: ng-select uses class, mat-select uses custom tag
    const _isNgSelect = el.tagName.toLowerCase() === 'ng-select' || el.classList.contains('ng-select') || el.classList.contains('ng-dropdown');
    const _type = _isNgSelect ? 'ng-dropdown' : 'mat-select';
    const id = el.id || `combobox-${matIdx}`;
    if (!el.id) el.setAttribute('data-cc-id', id);
    labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({ selector: el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[data-cc-id="${id}"]`, id, name: el.getAttribute('formcontrolname') || '', value: '', placeholder: '', label, type: _type, index: matIdx++, _el: el });
  });

  // ── Angular ng-select / ng-dropdown custom widgets ──
  // (these are NOT covered by mat-select or [role=combobox] selectors)
  // Strategy: find ANY container that holds a dropdown-trigger child element
  // (.value-area, .select-type, .ng-value-container — used by ssc.gov.in / RRB / NTA forms)
  const ngTriggerSelectors = '.value-area, .select-type, .ng-value-container, .ng-select-container';
  const ngContainerSelectors = 'ng-select, ng-dropdown, .ng-select, .ng-dropdown, [class*="custom-dropdown"], [class*="select-control"]';
  const ngCandidates = new Set();
  // Direct: explicit container classes
  document.querySelectorAll(ngContainerSelectors).forEach(el => ngCandidates.add(el));
  // Indirect: any element with a trigger child becomes a candidate (use closest meaningful wrapper)
  document.querySelectorAll(ngTriggerSelectors).forEach(trigger => {
    // Walk up to find the field-level container (form-field, .form-group, or parent div)
    let container = trigger.closest('mat-form-field, .form-field, .form-group, [class*="dropdown"], [class*="select"]');
    if (!container) container = trigger.parentElement;
    if (container && container !== document.body) ngCandidates.add(container);
  });

  ngCandidates.forEach(el => {
    if (isInSkipContext(el)) return;
    // Skip if already captured (mat-select / select / ng-select case)
    // Check: is this element itself already captured, OR is it inside an already-captured element?
    const skip = formFields.some(f => {
      try {
        if (el.matches(f.selector)) return true;          // Same element
        if (el.querySelector(f.selector)) return true;    // Contains captured element
        if (el.closest(f.selector)) return true;          // Is inside a captured element
        return false;
      } catch { return false; }
    });
    if (skip) return;
    // Label resolution: ng-dropdown container often has its label as a CHILD
    // <div class="ng-dropdown"><div class="label">5. Gender</div>...</div>
    let label = getLabel(el) || el.getAttribute('aria-label') || '';
    if (!label) {
      // Direct child label/.label/.field-label (NOT inside .value-area which holds the trigger)
      const childLabel = el.querySelector(':scope > .label, :scope > label, :scope > .field-label, :scope > [class*="label"]');
      if (childLabel) label = childLabel.textContent.trim();
    }
    if (!label) {
      // Any descendant .label that isn't inside a value-area / option-list
      const dl = Array.from(el.querySelectorAll('.label, .field-label, [class*="label"]'))
        .find(n => !n.closest('.value-area, .options-list, .ng-dropdown-panel, .dropdown-options'));
      if (dl) label = dl.textContent.trim();
    }
    label = (label || '').replace(/\s+/g, ' ').trim();
    if (!isGoodLabel(label)) return;
    // Force unique selector via data-cc-id (SSC reuses id="dropsection" for ALL dropdowns)
    const ddId = `ng-dd-${matIdx}`;
    el.setAttribute('data-cc-id', ddId);
    labelList.push(label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15));
    formFields.push({
      selector: `[data-cc-id="${ddId}"]`,
      id: ddId,
      name: el.getAttribute('formcontrolname') || el.getAttribute('name') || '',
      value: '',
      placeholder: '',
      label,
      type: 'ng-dropdown',
      index: matIdx++,
      _el: el,
    });
  });

  // ── Order fields by TRUE VISUAL position ────────────────────────────────────
  // Uses rendered geometry (getBoundingClientRect) so fields sort in real
  // top-to-bottom, left-to-right order — correct even when CSS (flex `order`,
  // grid) or custom widgets (mat-select/ng-dropdown) diverge from DOM order,
  // and for multi-column layouts. Element refs are stripped before return
  // (DOM nodes can't cross the executeScript boundary).
  const ROW_BAND = 8; // px: fields within this vertical distance are the same row
  function _visualPos(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return { row: 1e9, left: 1e9 };
    const r = el.getBoundingClientRect();
    const top = r.top + (window.pageYOffset || 0);
    const left = r.left + (window.pageXOffset || 0);
    // Unrendered / display:none → send to the end
    if (r.width === 0 && r.height === 0 && top === 0 && left === 0) return { row: 1e9, left: 1e9 };
    return { row: Math.round(top / ROW_BAND), left: Math.round(left) };
  }
  formFields.forEach(f => { f._pos = _visualPos(f._el); });
  formFields.sort((a, b) => (a._pos.row - b._pos.row) || (a._pos.left - b._pos.left));
  formFields.forEach((f, i) => { f.index = i; delete f._pos; });

  // ── Fingerprint ──
  const labelSig = labelList.sort().slice(0, 10).join('|');
  const raw = `${hostname}::${title}::${labelSig}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
  const formKey = Math.abs(hash).toString(36);

  // ── Semantic formKey — stable across DOM changes, based on normalized labels ──
  const semanticLabels = formFields
    .map(f => (f.label || '').toLowerCase().replace(/[^a-z\s]/g, '').trim())
    .filter(l => l.length > 2)
    .sort()
    .slice(0, 15);
  const semRaw = `${hostname}|${semanticLabels.join('|')}`;
  let semHash = 0;
  for (let i = 0; i < semRaw.length; i++) { semHash = ((semHash << 5) - semHash) + semRaw.charCodeAt(i); semHash |= 0; }
  const semanticFormKey = 's_' + Math.abs(semHash).toString(36);

  // ── Build formal IR (PageModel) BEFORE stripping _el ──
  // _el references are still available here for aria/state extraction
  var pageModel = null;
  if (typeof window.ccModels !== 'undefined' && window.ccModels.createPageModel) {
    pageModel = window.ccModels.createPageModel(
      { formFields: formFields, formKey: formKey, semanticFormKey: semanticFormKey },
      { url: location.href, hostname: hostname, title: title }
    );
  }

  // ── Strip DOM references (not serializable) ──
  formFields.forEach(f => { delete f._el; });

  return { formFields, formKey, semanticFormKey, pageModel };
}

// ── Correction observer (injected after autofill) ─────────────────────────────
function injectCorrectionObserver(mapping, filledBySource, profile, backendUrl, formKey) {
  const corrections = [];
  const enrichments = [];

  // Watch autofilled fields for corrections
  for (const [selector, { value }] of Object.entries(mapping)) {
    try {
      const el = selector.startsWith('form-field-')
        ? document.querySelectorAll('input,select,textarea')[parseInt(selector.split('-')[2])]
        : document.querySelector(selector);
      if (!el) continue;
      const originalValue = value;
      const info = filledBySource[selector];
      if (!info) continue;

      el.addEventListener('change', () => {
        const newVal = el.value;
        if (newVal === originalValue) return;
        const correctedKey = Object.entries(profile).find(([, v]) => v === newVal)?.[0];
        if (!correctedKey) { console.debug('[CC] correction: no profileKey for value', newVal); return; }
        if (corrections.some(c => c.semanticKey === info.semanticKey && c.newKey === correctedKey)) return;
        corrections.push({ semanticKey: info.semanticKey, oldKey: info.profileKey, newKey: correctedKey });
        sessionStorage.setItem('_cc_corrections', JSON.stringify(corrections));
        if (!backendUrl || !formKey) return;
        clearTimeout(el._ccTimer);
        el._ccTimer = setTimeout(() => {
          const pending = JSON.parse(sessionStorage.getItem('_cc_corrections') || '[]');
          const updates = {};
          for (const c of pending) {
            if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
          }
          if (!Object.keys(updates).length) return;
          fetch(backendUrl + '/mappings/' + formKey, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates, formKey }),
          }).then(() => {
            sessionStorage.removeItem('_cc_corrections');
          }).catch(e => console.warn('[CC] correction save failed', e));
        }, 1500);
      });
    } catch { /* skip */ }
  }

  // Watch UNFILLED fields for profile enrichment
  const skipLabels = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  const skipTypes = ['select', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
  document.querySelectorAll('input,textarea').forEach(el => {
    if (skipTypes.includes(el.type)) return;
    const selector = el.id ? (el.id.match(/^\d/) ? `[id="${el.id}"]` : `#${el.id}`) : `[name="${el.name}"]`;
    if (mapping[selector]) return;
    const label = (() => {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const td = el.closest('td'); if (td?.previousElementSibling) return td.previousElementSibling.textContent.trim();
      return el.placeholder || '';
    })();
    if (!label || skipLabels.test(label)) return;
    const normalized = label.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const semanticAliases = {
      'full name': 'name', 'candidate name': 'name', 'applicant name': 'name',
      'date of birth': 'dob', 'fathers name': 'father_name', 'mothers name': 'mother_name',
      'aadhaar no': 'aadhaar_number', 'mobile no': 'mobile', 'email id': 'email',
      'pin code': 'pincode', 'permanent address': 'address',
    };
    const semanticKey = semanticAliases[normalized] || normalized;
    el.addEventListener('blur', () => {
      const val = el.value.trim();
      if (!val || val.length < 2) return;
      const isValid = (() => {
        if (semanticKey === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
        if (semanticKey === 'pincode') return /^\d{6}$/.test(val);
        if (semanticKey === 'mobile') return /^\d{10}$/.test(val);
        if (semanticKey === 'aadhaar_number') return /^\d{12}$/.test(val);
        if (['name','father_name','mother_name'].includes(semanticKey)) return /^[a-zA-Z\s\.]{2,60}$/.test(val);
        return val.length >= 2 && val.length <= 200;
      })();
      if (!isValid) return;
      if (profile[semanticKey]) return;
      enrichments.push({ semanticKey, value: val, label });
      sessionStorage.setItem('_cc_enrichments', JSON.stringify(enrichments));
    });
  });
}
