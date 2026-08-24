// Paste this entire script into the browser console on bed.upessc.org/otr/register/
// It will show exactly what the extension sees and what it would fill

(function() {
  const profile = {
    name: 'SANDHYA KUMARI', dob: '14/01/2000', father_name: 'SUDHIR PRASAD',
    mother_name: 'LALITA DEVI', gender: 'FEMALE', mobile: '8727854089',
    email: 'sandhyakumarisanya@gmail.com', aadhaar_number: '729027826597',
    state: 'Bihar', district: 'Gaya', pincode: '823311',
  };

  const results = { found: [], missed: [], dropdowns: [] };

  // ── 1. What inputs does the extractor find? ──
  function isInSkipContext(el) {
    return !!(el.closest('nav,header,footer,[role="navigation"],[role="search"],[role="banner"]'));
  }
  function isGoodLabel(s) {
    if (!s) return false;
    return s.replace(/[*:\s]/g, '').length >= 2;
  }
  function getLabel(el) {
    if (el.id) { const l = document.querySelector(`label[for="${el.id}"]`); if (l && isGoodLabel(l.textContent.trim())) return l.textContent.trim(); }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && isGoodLabel(ariaLabel)) return ariaLabel.trim();
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) { const clone = wrappingLabel.cloneNode(true); clone.querySelectorAll('input,select,textarea').forEach(e => e.remove()); const t = clone.textContent.trim(); if (isGoodLabel(t)) return t; }
    const td = el.closest('td');
    if (td) { const prev = td.previousElementSibling; if (prev && isGoodLabel(prev.textContent.trim())) return prev.textContent.trim().slice(0, 60); }
    const container = el.closest('.form-group,.form-field,.field-wrapper,.input-group,mat-form-field,[class*="form-row"],[class*="field-row"]');
    if (container) { const l = container.querySelector('label,mat-label,.label,.field-label,.control-label'); if (l && isGoodLabel(l.textContent.trim())) return l.textContent.trim(); }
    let prev = el.previousElementSibling;
    if (prev && ['LABEL','SPAN','DIV','P'].includes(prev.tagName)) {
      const t = prev.textContent.trim();
      if (isGoodLabel(t) && t.length < 80 && !prev.querySelector('input,select,textarea')) return t;
    }
    if (el.placeholder && isGoodLabel(el.placeholder) && el.placeholder.length < 60) return el.placeholder;
    return '';
  }

  // Scan all inputs
  const inputs = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
  console.log(`\n=== EXTRACTOR SCAN: ${inputs.length} raw inputs found ===`);
  
  inputs.forEach((el, i) => {
    if (['hidden','submit','button','search','password','file','image','reset'].includes(el.type)) return;
    if (isInSkipContext(el)) return;
    const meta = ((el.id||'')+' '+(el.name||'')+' '+(el.className||'')).toLowerCase();
    if (/search|query|filter|captcha|otp|token|csrf|recaptcha/i.test(meta)) return;
    const label = getLabel(el);
    const selector = el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : `form-field-${i}`;
    console.log(`  [${i}] type=${el.type||'text'} selector=${selector} label="${label}" placeholder="${el.placeholder||''}"`);
  });

  // ── 2. What custom dropdowns does the scanner find? ──
  console.log('\n=== CUSTOM DROPDOWN SCAN ===');
  let dropdownEls = Array.from(document.querySelectorAll('div.ng-dropdown'));
  if (dropdownEls.length === 0) {
    const candidates = document.querySelectorAll('[class*="dropdown"],[class*="select"],[class*="picker"],[class*="combo"]');
    candidates.forEach(el => {
      if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
      if (el.querySelector('select')) return;
      const hasOptions = el.querySelector('li,[class*="option"],[class*="item"]') || el.getAttribute('role') === 'combobox' || (el.querySelector('button > span') && el.classList.contains('relative'));
      if (hasOptions) dropdownEls.push(el);
    });
  }
  // Also check div.relative
  document.querySelectorAll('div.relative').forEach(el => {
    if (el.querySelector('select') || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    if (el.querySelector('button > span')) dropdownEls.push(el);
  });
  
  console.log(`Found ${dropdownEls.length} custom dropdown elements:`);
  dropdownEls.forEach((el, i) => {
    const lbl = el.querySelector('.label,label,mat-label')?.textContent?.trim() || el.getAttribute('aria-label') || el.previousElementSibling?.textContent?.trim() || '';
    const btnSpan = el.querySelector('button > span:first-child');
    const currentVal = btnSpan?.textContent?.trim() || el.querySelector('.select-type,.value-area')?.textContent?.trim() || '';
    console.log(`  [${i}] class="${el.className.slice(0,50)}" label="${lbl}" currentVal="${currentVal}"`);
  });

  // ── 3. Check if Vue inputs are reactive ──
  console.log('\n=== VUE REACTIVITY TEST ===');
  const textInputs = Array.from(document.querySelectorAll('input[type="text"]')).filter(el => !isInSkipContext(el));
  if (textInputs[0]) {
    const el = textInputs[0];
    const label = getLabel(el);
    console.log(`Testing first text input: label="${label}" id="${el.id}" name="${el.name}"`);
    const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (niv) niv.set.call(el, 'TEST_VALUE');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      console.log(`After set: el.value="${el.value}" (should be TEST_VALUE)`);
      // Reset
      if (niv) niv.set.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, 100);
  }

  // ── 4. Check gender select ──
  console.log('\n=== GENDER SELECT ===');
  const genderSel = document.querySelector('select');
  if (genderSel) {
    console.log(`Found select: options=[${Array.from(genderSel.options).map(o=>o.value+':'+o.text).join(', ')}]`);
    console.log(`Current value: "${genderSel.value}"`);
  } else {
    console.log('No native <select> found');
  }

  console.log('\n=== DONE — copy this output and share ===');
})();
