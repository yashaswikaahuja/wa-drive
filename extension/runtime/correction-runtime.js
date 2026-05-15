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
        // Debounce: batch corrections within 1.5s window
        clearTimeout(el._ccTimer);
        el._ccTimer = setTimeout(() => {
          const pending = JSON.parse(sessionStorage.getItem('_cc_corrections') || '[]');
          const updates = {};
          for (const c of pending) {
            if (c.newKey) updates[c.semanticKey] = { profileKey: c.newKey, delta: { fills: 0, corrections: 1 } };
          }
          if (!Object.keys(updates).length) return;
          console.debug('[CC] saving corrections (batched):', updates);
          fetch(backendUrl + '/mappings/' + formKey, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates, formKey }),
          }).then(() => {
            console.debug('[CC] corrections saved ok');
            sessionStorage.removeItem('_cc_corrections');
          }).catch(e => console.warn('[CC] correction save failed', e));
        }, 1500);
      });
    } catch { /* skip */ }
  }

  // Watch UNFILLED fields for profile enrichment
  const skipLabels = /captcha|otp|token|verification|code|password|confirm|repeat|retype/i;
  const skipTypes = ['select', 'checkbox', 'radio', 'hidden', 'submit', 'button'];
  const allInputs = document.querySelectorAll('input,textarea');

  allInputs.forEach(el => {
    if (skipTypes.includes(el.type)) return;
    // Skip if already autofilled
    const selector = el.id ? `#${el.id}` : `[name="${el.name}"]`;
    if (mapping[selector]) return;

    // Get label
    const label = (() => {
      if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l) return l.textContent.trim(); }
      const td = el.closest('td'); if (td?.previousElementSibling) return td.previousElementSibling.textContent.trim();
      return el.placeholder || '';
    })();
    if (!label || skipLabels.test(label)) return;

    // Normalize label to semantic key
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

      // Type validation
      const isValid = (() => {
        if (semanticKey === 'dob') return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
        if (semanticKey === 'pincode') return /^\d{6}$/.test(val);
        if (semanticKey === 'mobile') return /^\d{10}$/.test(val);
        if (semanticKey === 'aadhaar_number') return /^\d{12}$/.test(val);
        if (['name','father_name','mother_name'].includes(semanticKey)) return /^[a-zA-Z\s\.]{2,60}$/.test(val);
        return val.length >= 2 && val.length <= 200; // generic
      })();

      if (!isValid) return;

      // Don't enrich if profile already has this key
      if (profile[semanticKey]) return;

      enrichments.push({ semanticKey, value: val, label });
      sessionStorage.setItem('_cc_enrichments', JSON.stringify(enrichments));
    });
  });
}

