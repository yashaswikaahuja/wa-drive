// Real-browser test of the extension fill engine (extractor + rule-engine).
// Run from the frontend dir: node e2e/_fill-harness.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EXT = 'C:/Users/yasha/wa-drive/extension';
const extractorSrc = readFileSync(`${EXT}/autofill/extractor.js`, 'utf8');
const ruleSrc = readFileSync(`${EXT}/autofill/rule-engine.js`, 'utf8');
const fixture = `file://${EXT}/test/fixtures/govt-form.html`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };
const eqJSON = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
await page.goto(fixture);
await page.addScriptTag({ content: extractorSrc });
await page.addScriptTag({ content: ruleSrc });

// ── 1. Extraction: order + types + options ──────────────────────────────────
const fields = await page.evaluate(() => {
  const r = extractFormFieldsWithFingerprint();
  return r.formFields.map(f => ({ label: f.label, type: f.type, options: f.options || null, selector: f.selector, optionSelectors: f.optionSelectors || null }));
});

console.log('\n── Extracted fields (in order) ──');
fields.forEach((f, i) => console.log(`  ${i}. [${f.type}] ${f.label}${f.options ? '  {' + f.options.join(', ') + '}' : ''}`));

console.log('\n── Ordering ──');
const labels = fields.map(f => f.label);
const idx = l => labels.findIndex(x => x === l);
ok('Full Name before Date of Birth', idx('Full Name (as per certificate)') < idx('Date of Birth'));
ok('District before Pincode (same row L→R)', idx('District') >= 0 && idx('District') < idx('Pincode'));
ok('House No before City (CSS order:-1 beats DOM order)', idx('House No (visually first)') >= 0 && idx('House No (visually first)') < idx('City (visually second)'), `house=${idx('House No (visually first)')} city=${idx('City (visually second)')}`);

console.log('\n── Types & options ──');
const byLabel = l => fields.find(f => f.label === l) || {};
ok('Gender is radio-group', byLabel('Gender').type === 'radio-group', byLabel('Gender').type);
eqJSON('Gender options', byLabel('Gender').options, ['Male', 'Female', 'Transgender']);
ok('Category is dropdown', byLabel('Category').type === 'dropdown', byLabel('Category').type);
eqJSON('Category options', byLabel('Category').options, ['General', 'OBC (Non-Creamy Layer)', 'SC', 'ST']);
ok('Languages is checkbox-group', byLabel('Languages Known').type === 'checkbox-group', byLabel('Languages Known').type);
ok('Ex-Serviceman is radio-group', byLabel('Are you an Ex-Serviceman?').type === 'radio-group', byLabel('Are you an Ex-Serviceman?').type);
ok('Agreement is checkbox-agreement', (fields.find(f => /confirm the information/i.test(f.label)) || {}).type === 'checkbox-agreement');
ok('State detected as ng-dropdown', (byLabel('State').type || '') === 'ng-dropdown', byLabel('State').type);

// ── 2. Rule evaluation ──────────────────────────────────────────────────────
console.log('\n── Rule evaluation ──');
const profile = { gender: 'Female', category: 'OBC', languages: 'Hindi, English', occupation: 'Teacher', dob: '05/03/1998', district: 'Patna', pincode: '800001' };
const translations = { OBC: 'OBC (Non-Creamy Layer)' };

const genderAct = await page.evaluate(([f, p, t]) => ccEvaluateField({ fillMode: 'match', profileKey: 'gender' }, f, p, t), [byLabel('Gender'), profile, translations]);
eqJSON('gender → Female', genderAct, { kind: 'option', option: 'Female' });

const catAct = await page.evaluate(([f, p, t]) => ccEvaluateField({ fillMode: 'match', profileKey: 'category' }, f, p, t), [byLabel('Category'), profile, translations]);
eqJSON('category → translated', catAct, { kind: 'option', option: 'OBC (Non-Creamy Layer)' });

const langAct = await page.evaluate(([f, p, t]) => ccEvaluateField({ fillMode: 'match', profileKey: 'languages' }, f, p, t), [byLabel('Languages Known'), profile, translations]);
eqJSON('languages → Hindi+English', langAct, { kind: 'checkOptions', options: ['Hindi', 'English'] });

const exsmAct = await page.evaluate(([f, p, t]) => ccEvaluateField({ fillMode: 'condition', rules: [{ when: [{ key: 'occupation', op: 'eq', value: 'Ex-Serviceman' }], then: 'Yes' }], fallback: 'No' }, f, p, t), [byLabel('Are you an Ex-Serviceman?'), profile, translations]);
eqJSON('ex-serviceman(Teacher) → No', exsmAct, { kind: 'option', option: 'No' });

// ── 3. Apply fills to the real DOM, then read back ──────────────────────────
console.log('\n── Apply + read back ──');
const result = await page.evaluate(([flds, prof, trans]) => {
  const savedByLabel = {
    'Full Name (as per certificate)': { fillMode: 'match', profileKey: 'name' },
    'Date of Birth': { fillMode: 'match', profileKey: 'dob' },
    'Gender': { fillMode: 'match', profileKey: 'gender' },
    'Category': { fillMode: 'match', profileKey: 'category' },
    'District': { fillMode: 'match', profileKey: 'district' },
    'Pincode': { fillMode: 'match', profileKey: 'pincode' },
    'Languages Known': { fillMode: 'match', profileKey: 'languages' },
    'Are you an Ex-Serviceman?': { fillMode: 'condition', rules: [{ when: [{ key: 'occupation', op: 'eq', value: 'Ex-Serviceman' }], then: 'Yes' }], fallback: 'No' },
    'I confirm the information provided is correct': { fillMode: 'always' },
  };
  prof.name = 'Asha Kumari';
  for (const f of flds) {
    const s = savedByLabel[f.label]; if (!s) continue;
    const act = ccEvaluateField(s, f, prof, trans);
    if (act.kind === 'value') { const el = document.querySelector(f.selector); if (el) { el.value = act.value; el.dispatchEvent(new Event('input', { bubbles: true })); } }
    else if (act.kind === 'option') {
      const grp = ccTypeGroup(f.type);
      if (grp === 'radio' && f.optionSelectors) { const i = (f.options || []).indexOf(act.option); const el = i >= 0 && document.querySelector(f.optionSelectors[i]); if (el) el.click(); }
      else { const el = document.querySelector(f.selector); if (el && el.tagName === 'SELECT') { const opt = [...el.options].find(o => o.text.trim() === act.option); if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); } } }
    }
    else if (act.kind === 'check') { const el = document.querySelector(f.selector); if (el && el.checked !== act.check) el.click(); }
    else if (act.kind === 'checkOptions') { for (const o of act.options) { const i = (f.options || []).indexOf(o); const el = i >= 0 && document.querySelector(f.optionSelectors[i]); if (el && !el.checked) el.click(); } }
  }
  return {
    fullname: document.querySelector('#fullname').value,
    dob: document.querySelector('#dob').value,
    genderF: document.querySelector('[name="gender"][value="F"]').checked,
    category: document.querySelector('#category').value,
    langHi: document.querySelector('[name="languages"][value="hi"]').checked,
    langEn: document.querySelector('[name="languages"][value="en"]').checked,
    langUr: document.querySelector('[name="languages"][value="ur"]').checked,
    exsmNo: document.querySelector('[name="exsm"][value="no"]').checked,
    agree: document.querySelector('#agree').checked,
  };
}, [fields, profile, translations]);

ok('fullname filled', result.fullname === 'Asha Kumari', result.fullname);
ok('dob filled', result.dob === '05/03/1998', result.dob);
ok('gender Female checked', result.genderF === true);
ok('category = OBC (Non-Creamy Layer)', result.category === 'OBC (Non-Creamy Layer)', result.category);
ok('Hindi checked', result.langHi === true);
ok('English checked', result.langEn === true);
ok('Urdu NOT checked', result.langUr === false);
ok('Ex-serviceman = No checked', result.exsmNo === true);
ok('agreement checked', result.agree === true);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
