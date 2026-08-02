// Real-browser end-to-end test of the six-primitive engine.
// Run from frontend dir: node e2e/_engine-harness.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EXT = 'C:/Users/yasha/wa-drive/extension';
const files = [
  'autofill/plugins/interface.js',
  'autofill/plugins/keystroke-input.js',
  'autofill/plugins/ng-dropdown.js',
  'autofill/plugins/cascade-select.js',
  'autofill/plugins/button-click.js',
  'autofill/extractor.js',
  'autofill/rule-engine.js',
  'autofill/derive.js',
  'autofill/ai-resolve.js',
  'autofill/mapper.js',
  'autofill/executor.js',
  'core/memory.js',
  'core/world.js',
  'core/goal.js',
  'core/judgment.js',
  'core/action.js',
  'core/observation.js',
  'core/engine.js',
];
const fixture = `file://${EXT}/test/fixtures/govt-form.html`;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
page.on('console', m => { const t = m.text(); if (t.includes('[CCEngine]') || t.includes('[CC]')) console.log('    ⟨page⟩', t); });
await page.goto(fixture);
for (const f of files) await page.addScriptTag({ content: readFileSync(`${EXT}/${f}`, 'utf8') });

// Mock the backend: translations, saved mappings (rules), adapters.
await page.evaluate(() => {
  const saved = {
    _meta: { hostname: 'test.local' },
    'gender': { profileKey: 'gender', fillMode: 'match', type: 'radio-group', source: 'manual', fills: 5 },
    'category': { profileKey: 'category', fillMode: 'match', type: 'dropdown', source: 'manual', fills: 5 },
    'languages known': { profileKey: 'languages', fillMode: 'match', type: 'checkbox-group', source: 'manual', fills: 3 },
    'are you an exserviceman': { fillMode: 'condition', type: 'radio-group', source: 'manual', fills: 3,
      rules: [{ when: [{ key: 'occupation', op: 'eq', value: 'Ex-Serviceman' }], then: 'Yes' }], fallback: 'No' },
  };
  const translations = { OBC: 'OBC (Non-Creamy Layer)' };
  window.fetch = async (url) => ({
    ok: true,
    json: async () => {
      if (url.includes('/mappings/translations')) return translations;
      if (url.includes('/adapters/')) return {};
      if (url.includes('/mappings/')) return saved;
      return {};
    },
  });
});

// Run the engine with a realistic profile (no LLM key → deterministic only).
const result = await page.evaluate(async () => {
  const profile = {
    name: 'Asha Kumari', gender: 'Female', category: 'OBC',
    languages: 'Hindi, English', occupation: 'Teacher',
    dob: '05/03/1998', district: 'Patna', pincode: '800001',
  };
  const r = await window.CCEngine.run({
    profile, backendUrl: 'https://mock', accessToken: 'x',
    groqKey: '', llmBaseUrl: '', llmModel: '',
  });
  // Debug: what did fuzzy/plan produce?
  const dbg = window.__ccDebug || {};
  // Read back DOM
  const dom = {
    fullname: document.querySelector('#fullname').value,
    dob: document.querySelector('#dob').value,
    district: document.querySelector('#district').value,
    pincode: document.querySelector('#pincode').value,
    genderF: document.querySelector('[name="gender"][value="F"]').checked,
    genderM: document.querySelector('[name="gender"][value="M"]').checked,
    category: document.querySelector('#category').value,
    langHi: document.querySelector('[name="languages"][value="hi"]').checked,
    langEn: document.querySelector('[name="languages"][value="en"]').checked,
    langUr: document.querySelector('[name="languages"][value="ur"]').checked,
    exsmNo: document.querySelector('[name="exsm"][value="no"]').checked,
    exsmYes: document.querySelector('[name="exsm"][value="yes"]').checked,
    agree: document.querySelector('#agree').checked,
  };
  return { summary: r.summary ? { total: r.summary.total, filled: r.summary.filled, checkpoints: r.summary.checkpoints, unresolved: r.summary.unresolved } : null, ok: r.ok, error: r.error, dom, dbg };
});

console.log('\n── Engine summary ──');
console.log(' ', JSON.stringify(result.summary));
console.log('\n── DEBUG ──');
console.log('  mappingKeys:', JSON.stringify(result.dbg.mappingKeys));
console.log('  directChecks:', JSON.stringify(result.dbg.directChecks));
console.log('  skipped:', JSON.stringify(result.dbg.skipped));
for (const r of (result.dbg.resolutions||[])) console.log('   ·', r.status, r.kind||'', '|', r.id, '|', r.sel, '|', r.src);
console.log('\n── DOM read-back + assertions ──');
const d = result.dom;
ok('engine ran ok', result.ok === true, result.error);
ok('Full Name filled (fuzzy)', d.fullname === 'Asha Kumari', d.fullname);
ok('DOB filled (fuzzy)', d.dob === '05/03/1998', d.dob);
ok('District filled (fuzzy)', d.district === 'Patna', d.district);
ok('Pincode filled (fuzzy)', d.pincode === '800001', d.pincode);
ok('Gender=Female (memory rule → radio)', d.genderF === true && d.genderM === false);
ok('Category=OBC (Non-Creamy Layer) (memory + translation)', d.category === 'OBC (Non-Creamy Layer)', d.category);
ok('Languages Hindi+English (memory multi)', d.langHi && d.langEn && !d.langUr, `hi=${d.langHi} en=${d.langEn} ur=${d.langUr}`);
ok('Ex-serviceman=No (condition fallback)', d.exsmNo === true && d.exsmYes === false);
ok('Agreement checked (default)', d.agree === true);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
