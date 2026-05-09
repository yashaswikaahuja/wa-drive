const { JSDOM } = require('/tmp/node_modules/jsdom');
const SITES = require('./test_sites.js');

// ── Replicate getDisplayText logic from background.js ──
function getDisplayText(root) {
  const labelText = (
    root.querySelector('.label, label, mat-label')?.textContent || ''
  ).trim();

  const el = root.querySelector('.select-type') ||
             root.querySelector('.value-area') ||
             root.querySelector('[class*="selected-value"]') ||
             root.querySelector('[class*="placeholder"]');
  if (el) return el.textContent.trim();

  return root.textContent.replace(labelText, '').trim();
}

// ── Replicate root-finding logic from teachOneField ──
function findRoot(document, field) {
  const compClass = field.componentClass || 'ng-dropdown';

  // 1. domIndex
  if (typeof field.domIndex === 'number') {
    let root = document.querySelectorAll(`div.${compClass}`)[field.domIndex] || null;
    if (!root) {
      const all = Array.from(document.querySelectorAll(
        `div.${compClass},[class*="dropdown"],[class*="select"],[class*="picker"]`
      )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
      root = all[field.domIndex] || null;
    }
    if (root) return { root, method: 'domIndex' };
  }

  // 2. label text search
  const baseLabel = field.label.replace(/\s*\(\d+\)$/, '').trim().slice(0, 15);
  let found = null;
  document.querySelectorAll(`div.${compClass}, mat-select, [role=combobox], ng-select`).forEach(el => {
    const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() ||
                el.getAttribute('aria-label') || '';
    if (lbl && baseLabel && lbl.includes(baseLabel)) found = el;
  });
  if (found) return { root: found, method: 'labelSearch' };

  // 3. click-to-identify fallback — simulate by picking first dropdown-like element
  const candidates = Array.from(document.querySelectorAll(
    '[class*="dropdown"],[class*="select"],[class*="picker"],[class*="chosen"],[class*="react-select"],[class*="v-select"],[class*="p-dropdown"],[class*="ui-selectmenu"],[class*="ng-select"],mat-select,mat-form-field,ng-select'
  )).filter(el => el.tagName !== 'SELECT' && el.tagName !== 'INPUT');
  if (candidates[0]) return { root: candidates[0], method: 'clickToIdentify' };

  return { root: null, method: 'none' };
}

// ── Simulate user selecting an option (mutates DOM) ──
function simulateSelection(root, selectValue, site) {
  // Different sites update different elements
  const label = root.querySelector('.label, label, mat-label');
  const labelText = label?.textContent?.trim() || '';

  // Try to find and update the display element
  const displaySelectors = [
    '.select-type', '.value-area', '.select2-selection__rendered',
    '.filter-option-inner-inner', '.mat-select-value span',
    '.ng-value-container .ng-placeholder', '.selected-value',
    '.react-select__placeholder', '.ui-selectmenu-text',
    '.dropdown-toggle', '.v-select__selection',
    '.p-dropdown-label', '.opsc-value', '.jpsc-selected',
    '.custom-select__trigger span', '.chosen-single span',
    'button span', '.ng-select-container .ng-placeholder',
  ];

  let updated = false;
  for (const sel of displaySelectors) {
    const el = root.querySelector(sel);
    if (el && el.textContent.trim() !== labelText) {
      el.textContent = selectValue;
      updated = true;
      break;
    }
  }

  // Fallback: update first non-label text node
  if (!updated) {
    // Just append a span with the value to simulate Angular/React re-render
    const span = root.ownerDocument.createElement('span');
    span.className = 'selected-display-value';
    span.textContent = selectValue;
    root.appendChild(span);
  }
}

// ── Run tests ──
let passed = 0, failed = 0, warned = 0;
const results = [];

for (const site of SITES) {
  const dom = new JSDOM(`<html><body>${site.html}</body></html>`);
  const document = dom.window.document;
  const body = document.body;

  // Simulate field object as popup.js would create it
  const field = {
    label: site.label,
    domIndex: 0,
    componentClass: null, // unknown site — no adapter yet
    type: 'ng-dropdown',
  };

  // Step 1: Find root
  const { root, method } = findRoot(document, field);

  if (!root) {
    results.push({ site: site.site, status: 'FAIL', reason: 'root not found', method });
    failed++;
    continue;
  }

  // Step 2: Snapshot initial value
  const initialValue = getDisplayText(root);

  // Step 3: Simulate user selecting an option
  simulateSelection(root, site.selectValue, site.site);

  // Step 4: Check if getDisplayText detects the change
  const afterValue = getDisplayText(root);
  const placeholder = /^(select|choose|--|please|select option|none|pick|-+)/i;
  const changed = afterValue && afterValue !== initialValue && !placeholder.test(afterValue);

  if (changed && afterValue.includes(site.selectValue)) {
    results.push({ site: site.site, status: 'PASS', method, initial: initialValue, after: afterValue });
    passed++;
  } else if (changed) {
    results.push({ site: site.site, status: 'WARN', method, initial: initialValue, after: afterValue, expected: site.selectValue });
    warned++;
  } else {
    results.push({ site: site.site, status: 'FAIL', reason: `no change detected: initial="${initialValue}" after="${afterValue}"`, method });
    failed++;
  }
}

// Print results
console.log('\n' + '='.repeat(70));
console.log('TEACHING DETECTION TEST — 20 SITES');
console.log('='.repeat(70));
for (const r of results) {
  const icon = r.status === 'PASS' ? '✓' : r.status === 'WARN' ? '⚠' : '✗';
  const detail = r.status === 'PASS'
    ? `"${r.initial}" → "${r.after}" [${r.method}]`
    : r.status === 'WARN'
    ? `got "${r.after}" expected "${r.expected}" [${r.method}]`
    : r.reason + ` [${r.method}]`;
  console.log(`${icon} ${r.site.padEnd(45)} ${detail}`);
}
console.log('='.repeat(70));
console.log(`PASS: ${passed}  WARN: ${warned}  FAIL: ${failed}  TOTAL: ${SITES.length}`);
