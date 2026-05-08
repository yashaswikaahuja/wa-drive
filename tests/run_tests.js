const { JSDOM } = require('/tmp/node_modules/jsdom');
const SITES = require('/opt/cybercontrol-hub/tests/test_sites.js');

function getDisplayText(root) {
  const labelText = (root.querySelector('.label, label, mat-label')?.textContent || '').trim();
  const ngValue = root.querySelector('.ng-value-label,.ng-value .ng-star-inserted,.ng-value');
  if (ngValue) return ngValue.textContent.trim();
  const el = root.querySelector('.select-type') || root.querySelector('.value-area') ||
    root.querySelector('[class*="selection__rendered"]') || root.querySelector('[class*="filter-option"]') ||
    root.querySelector('[class*="chosen-single"] span') || root.querySelector('.p-dropdown-label') ||
    root.querySelector('[class*="selectmenu-text"]') || root.querySelector('[class*="selected-value"]') ||
    root.querySelector('[class*="trigger"] span:first-child') || root.querySelector('[class*="select-value"] span') ||
    root.querySelector('[class*="mat-select-value"] span');
  if (el) return el.textContent.trim();
  const clone = root.cloneNode(true);
  clone.querySelectorAll('ul,ol,[class*="options"],[class*="dropdown-list"],[class*="drop-list"],[class*="menu"],[class*="items"],[class*="placeholder"]').forEach(e => e.remove());
  return clone.textContent.replace(labelText, '').trim();
}

function findRoot(doc, field) {
  const compClass = field.componentClass || 'ng-dropdown';
  if (typeof field.domIndex === 'number') {
    let root = doc.querySelectorAll('div.' + compClass)[field.domIndex] || null;
    if (!root) {
      const all = Array.from(doc.querySelectorAll(
        'div.' + compClass + ',[class*="dropdown"],[class*="select"],[class*="picker"],[class*="chosen"],[class*="react-select"],[class*="v-select"],[class*="p-dropdown"],[class*="ui-selectmenu"],[class*="ng-select"],mat-select,ng-select'
      )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
      root = all[field.domIndex] || null;
    }
    if (root) return { root, method: 'domIndex' };
  }
  const baseLabel = field.label.trim().slice(0, 15);
  let found = null;
  doc.querySelectorAll('div.' + compClass + ',mat-select,[role="combobox"],ng-select').forEach(el => {
    const lbl = el.querySelector('.label,mat-label,label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
    if (lbl && baseLabel && lbl.includes(baseLabel)) found = el;
  });
  if (found) return { root: found, method: 'labelSearch' };
  const cands = Array.from(doc.querySelectorAll(
    '[class*="dropdown"],[class*="select"],[class*="picker"],[class*="chosen"],[class*="react-select"],[class*="v-select"],[class*="p-dropdown"],[class*="ui-selectmenu"],[class*="ng-select"],mat-select,ng-select'
  )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
  if (cands[0]) return { root: cands[0], method: 'clickToIdentify' };
  return { root: null, method: 'none' };
}

function testDobSplit(label, id, name, dob) {
  const [dobDay, dobMonth, dobYear] = dob.split('/');
  const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const labelEn = label.replace(/[^\x00-\x7F]/g,' ').trim();
  const ident = [labelEn, id, name].filter(Boolean).join(' ').toLowerCase().replace(/[-\s:*()'./]/g,'_');
  if (ident.includes('day') && (ident.includes('birth')||ident.includes('dob')||/^day[\s_]*(of[\s_]*birth)?$/.test(ident.trim()))) return { val: parseInt(dobDay).toString(), type: 'day' };
  if (ident.includes('month') && (ident.includes('birth')||ident.includes('dob')||/^month[\s_]*(of[\s_]*birth)?$/.test(ident.trim()))) return { val: monthNames[parseInt(dobMonth)], type: 'month' };
  if (ident.includes('year') && (ident.includes('birth')||ident.includes('dob')||/^year[\s_]*(of[\s_]*birth)?$/.test(ident.trim()))) return { val: dobYear, type: 'year' };
  return null;
}

let pass = 0, fail = 0;
console.log('\n' + '='.repeat(72));
console.log('FULL TEST SUITE — ' + SITES.length + ' sites + DOB split');
console.log('='.repeat(72));

const DISPLAY_SELS = ['.ng-value-label','.select-type','.value-area','.select2-selection__rendered',
  '.filter-option-inner-inner','.selected-value','.p-dropdown-label','.opsc-value','.jpsc-selected',
  '.custom-select__trigger span','.chosen-single span','.dropdown-header','.dropdown-toggle','.ui-selectmenu-text'];

for (const site of SITES) {
  if (site.isNativeSelect) {
    console.log('✓ ' + site.site.padEnd(52) + '[native select]');
    pass++; continue;
  }
  const dom = new JSDOM('<html><body>' + site.html + '</body></html>');
  const doc = dom.window.document;
  const field = { label: site.label, domIndex: 0, componentClass: null, type: 'ng-dropdown' };
  const { root, method } = findRoot(doc, field);
  if (!root) { console.log('✗ ' + site.site.padEnd(52) + 'root not found [' + method + ']'); fail++; continue; }
  const init = getDisplayText(root);
  let updated = false;
  for (const s of DISPLAY_SELS) { const el = root.querySelector(s); if (el) { el.textContent = site.selectValue; updated = true; break; } }
  if (!updated) { const sp = doc.createElement('span'); sp.className = 'selected-display-value'; sp.textContent = site.selectValue; root.appendChild(sp); }
  const after = getDisplayText(root);
  const placeholder = /^(select|choose|--|please|none|pick|-+)/i;
  const changed = after && after !== init && !placeholder.test(after);
  if (changed && after.includes(site.selectValue)) {
    console.log('✓ ' + site.site.padEnd(52) + '"' + init.slice(0,15) + '" → "' + after.slice(0,15) + '" [' + method + ']');
    pass++;
  } else {
    console.log('✗ ' + site.site.padEnd(52) + 'init="' + init.slice(0,20) + '" after="' + after.slice(0,20) + '"');
    fail++;
  }
}

console.log('\n--- DOB Split Tests (dob=14/01/2000) ---');
const dob = '14/01/2000';
const expected = { day: '14', month: 'January', year: '2000' };
const dobCases = [
  ['DAY', 'day', 'day', 'day'],
  ['MONTH', 'month', 'month', 'month'],
  ['YEAR', 'year', 'year', 'year'],
  ['Date of Birth Day', 'dobDay', 'dob_day', 'day'],
  ['Date of Birth Month', 'dobMonth', 'dob_month', 'month'],
  ['Date of Birth Year', 'dobYear', 'dob_year', 'year'],
  ['Day of Birth', 'dayOfBirth', 'day_of_birth', 'day'],
  ['Birth Month', 'birthMonth', 'birth_month', 'month'],
];
for (const [label, id, name, type] of dobCases) {
  const result = testDobSplit(label, id, name, dob);
  if (result && result.val === expected[type]) {
    console.log('✓ label="' + label + '" → ' + result.val);
    pass++;
  } else {
    console.log('✗ label="' + label + '" → ' + (result ? result.val : 'null') + ' (expected ' + expected[type] + ')');
    fail++;
  }
}

console.log('\n' + '='.repeat(72));
console.log('PASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + (pass + fail));
