const { JSDOM } = require('/tmp/node_modules/jsdom');
const SITES = require('./test_sites.js');

function getDisplayText(root) {
  const labelText = (root.querySelector('.label, label, mat-label')?.textContent || '').trim();
  const el = root.querySelector('.select-type') || root.querySelector('.value-area') ||
    root.querySelector('[class*="selected-value"]') || root.querySelector('[class*="placeholder"]') ||
    root.querySelector('[class*="selection__rendered"]') || root.querySelector('[class*="filter-option"]') ||
    root.querySelector('[class*="chosen-single"] span') || root.querySelector('.p-dropdown-label') ||
    root.querySelector('[class*="trigger"] span') || root.querySelector('[class*="selected"] span');
  if (el) return el.textContent.trim();
  const clone = root.cloneNode(true);
  clone.querySelectorAll('ul,ol,[class*="options"],[class*="dropdown-list"],[class*="drop-list"],[class*="menu"],[class*="items"]').forEach(e => e.remove());
  return clone.textContent.replace(labelText, '').trim();
}

function findRoot(document, field) {
  const compClass = field.componentClass || 'ng-dropdown';
  if (typeof field.domIndex === 'number') {
    let root = document.querySelectorAll('div.' + compClass)[field.domIndex] || null;
    if (!root) {
      const all = Array.from(document.querySelectorAll(
        'div.' + compClass + ',[class*="dropdown"],[class*="select"],[class*="picker"],[class*="chosen"],[class*="react-select"],[class*="v-select"],[class*="p-dropdown"],[class*="ui-selectmenu"],[class*="ng-select"],mat-select,ng-select'
      )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
      root = all[field.domIndex] || null;
    }
    if (root) return { root, method: 'domIndex' };
  }
  const baseLabel = field.label.trim().slice(0, 15);
  let found = null;
  document.querySelectorAll('div.' + compClass + ', mat-select, [role=combobox], ng-select').forEach(el => {
    const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
    if (lbl && baseLabel && lbl.includes(baseLabel)) found = el;
  });
  if (found) return { root: found, method: 'labelSearch' };
  const candidates = Array.from(document.querySelectorAll(
    '[class*="dropdown"],[class*="select"],[class*="picker"],[class*="chosen"],[class*="react-select"],[class*="v-select"],[class*="p-dropdown"],[class*="ui-selectmenu"],[class*="ng-select"],mat-select,ng-select'
  )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
  if (candidates[0]) return { root: candidates[0], method: 'clickToIdentify' };
  return { root: null, method: 'none' };
}

function simulateSelection(root, selectValue) {
  const label = root.querySelector('.label, label, mat-label');
  const labelText = label?.textContent?.trim() || '';
  const displaySelectors = ['.select-type','.value-area','.select2-selection__rendered','.filter-option-inner-inner','.mat-select-value span','.selected-value','.react-select__placeholder','.ui-selectmenu-text','.v-select__selection','.p-dropdown-label','.opsc-value','.jpsc-selected','.custom-select__trigger span','.chosen-single span','button span','.dropdown-header','.dropdown-toggle'];
  let updated = false;
  for (const sel of displaySelectors) {
    const el = root.querySelector(sel);
    if (el && el.textContent.trim() !== labelText) { el.textContent = selectValue; updated = true; break; }
  }
  if (!updated) {
    const span = root.ownerDocument.createElement('span');
    span.className = 'selected-display-value';
    span.textContent = selectValue;
    root.appendChild(span);
  }
}

let passed = 0, failed = 0;
const results = [];
for (const site of SITES) {
  const dom = new JSDOM('<html><body>' + site.html + '</body></html>');
  const document = dom.window.document;
  const field = { label: site.label, domIndex: 0, componentClass: null, type: 'ng-dropdown' };
  const { root, method } = findRoot(document, field);
  if (!root) { results.push({ site: site.site, status: 'FAIL', reason: 'root not found', method }); failed++; continue; }
  const initialValue = getDisplayText(root);
  simulateSelection(root, site.selectValue);
  const afterValue = getDisplayText(root);
  const placeholder = /^(select|choose|--|please|select option|none|pick|-+)/i;
  const changed = afterValue && afterValue !== initialValue && !placeholder.test(afterValue);
  if (changed && afterValue.includes(site.selectValue)) { results.push({ site: site.site, status: 'PASS', method, initial: initialValue, after: afterValue }); passed++; }
  else { results.push({ site: site.site, status: 'FAIL', reason: 'no change: initial="' + initialValue.slice(0,30) + '" after="' + afterValue.slice(0,30) + '"', method }); failed++; }
}
console.log('\n' + '='.repeat(70));
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : '✗';
  const detail = r.status === 'PASS' ? ' + r.initial.slice(0,20) +  →  + r.after.slice(0,20) +  [' + r.method + ']' : r.reason + ' [' + r.method + ']';
  console.log(icon + ' ' + r.site.slice(0,45).padEnd(45) + ' ' + detail);
}
console.log('='.repeat(70));
console.log('PASS: ' + passed + '  FAIL: ' + failed + '  TOTAL: ' + SITES.length);
