/**
 * Phase 1.3 — Browser Test Harness
 *
 * Loads the CyberControl extension UNPACKED in Chromium via Playwright,
 * then exercises real extraction → mapping → execution flows against
 * fixture HTML pages.
 *
 * Run: node extension/test/browser/run.mjs
 * Requires: npx playwright install chromium (one-time)
 */

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const EXT_DIR = resolve(__dirname, '../..');
const FIXTURES = resolve(__dirname, '../fixtures');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// ── Locate Chromium ─────────────────────────────────────────────────
// Try system Chrome first, then Playwright's bundled Chromium
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean);

let executablePath = CHROME_PATHS.find(p => existsSync(p)) || undefined;

// ── Build script injection list (mirrors popup.js order) ────────────
const SHARED_SCRIPTS = [
  'shared/option-match.js',
  'shared/dom-utils.js',
  'shared/network-idle.js',
  'shared/llm-client.js',
  'shared/select-apply.js',
  'models/ir.js',
  'capabilities/registry.js',
  'autofill/plugins/interface.js',
  'autofill/plugins/cascade-select.js',
  'autofill/plugins/ng-dropdown.js',
  'autofill/plugins/keystroke-input.js',
  'autofill/rule-engine.js',
  'autofill/extractor.js',
  'autofill/mapper.js',
  'autofill/executor.js',
];

async function injectExtension(page) {
  for (const script of SHARED_SCRIPTS) {
    const path = join(EXT_DIR, script);
    if (!existsSync(path)) { console.warn(`  SKIP: ${script} not found`); continue; }
    await page.addScriptTag({ content: readFileSync(path, 'utf8') });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════

async function testExtraction(browser) {
  console.log('\n═══ Suite: Extraction (govt-form.html) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/govt-form.html`);
  await injectExtension(page);

  const result = await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    return {
      fieldCount: r.formFields.length,
      formKey: r.formKey,
      semanticFormKey: r.semanticFormKey,
      hasPageModel: !!(r.pageModel),
      pageModelVersion: r.pageModel ? r.pageModel.version : null,
      fields: r.formFields.map(f => ({ label: f.label, type: f.type, selector: f.selector })),
      pageModelFields: r.pageModel ? r.pageModel.forms[0].fields.length : 0,
    };
  });

  ok('Extracts multiple fields', result.fieldCount >= 6);
  ok('FormKey generated', result.formKey.length > 0);
  ok('SemanticFormKey generated', result.semanticFormKey.startsWith('s_'));
  ok('PageModel produced', result.hasPageModel === true);
  ok('PageModel version is 1.0.0', result.pageModelVersion === '1.0.0');
  ok('PageModel field count matches', result.pageModelFields === result.fieldCount);
  ok('Full Name field extracted', result.fields.some(f => f.label.includes('Full Name')));
  ok('Category dropdown detected', result.fields.some(f => f.type === 'dropdown' && f.label === 'Category'));
  ok('Gender radio group detected', result.fields.some(f => f.type === 'radio-group'));
  ok('Agreement checkbox detected', result.fields.some(f => f.type === 'checkbox-agreement'));

  // Verify determinism
  const result2 = await page.evaluate(() => extractFormFieldsWithFingerprint().semanticFormKey);
  ok('Extraction is deterministic', result.semanticFormKey === result2);

  await page.close();
}

async function testCapabilityDispatch(browser) {
  console.log('\n═══ Suite: Capability Dispatch (govt-form.html) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/govt-form.html`);
  await injectExtension(page);

  // fill_text
  const fillResult = await page.evaluate(async () => {
    const el = document.getElementById('fullname');
    return await window.ccCapabilities.dispatch(
      { action: 'fill_text', value: 'Kamaljeet Singh', timeout_ms: 3000 },
      { element: el, widgetType: 'input-text' }
    );
  });
  ok('fill_text succeeds', fillResult.status === 'success');

  const actualValue = await page.$eval('#fullname', el => el.value);
  ok('fill_text actually sets value', actualValue === 'Kamaljeet Singh');

  // select_option
  const selectResult = await page.evaluate(async () => {
    const el = document.getElementById('category');
    return await window.ccCapabilities.dispatch(
      { action: 'select_option', value: 'OBC', timeout_ms: 3000 },
      { element: el, widgetType: 'native-select' }
    );
  });
  ok('select_option succeeds', selectResult.status === 'success');

  const selectedValue = await page.$eval('#category', el => el.value);
  ok('select_option actually selects', selectedValue !== '');

  // click (radio)
  const clickResult = await page.evaluate(async () => {
    const el = document.querySelector('input[name="gender"][value="M"]');
    return await window.ccCapabilities.dispatch(
      { action: 'click', timeout_ms: 3000 },
      { element: el, widgetType: 'input-radio' }
    );
  });
  ok('click dispatches on radio', clickResult.status === 'success');

  const radioChecked = await page.$eval('input[name="gender"][value="M"]', el => el.checked);
  ok('click actually checks radio', radioChecked === true);

  // check (checkbox)
  const checkResult = await page.evaluate(async () => {
    const el = document.getElementById('agree');
    return await window.ccCapabilities.dispatch(
      { action: 'check', value: 'true', timeout_ms: 3000 },
      { element: el, widgetType: 'input-checkbox' }
    );
  });
  ok('check succeeds on checkbox', checkResult.status === 'success');

  const checkboxChecked = await page.$eval('#agree', el => el.checked);
  ok('check actually checks checkbox', checkboxChecked === true);

  // wait_time
  const t0 = Date.now();
  const waitResult = await page.evaluate(async () => {
    return await window.ccCapabilities.dispatch(
      { action: 'wait_time', options: { ms: 100 }, timeout_ms: 3000 },
      {}
    );
  });
  ok('wait_time succeeds', waitResult.status === 'success');
  ok('wait_time actually waits', Date.now() - t0 >= 90);

  await page.close();
}

async function testCascadeDropdown(browser) {
  console.log('\n═══ Suite: Cascade Select (cascade-form.html) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/cascade-form.html`);
  await injectExtension(page);

  // Select state → should populate districts after delay
  await page.evaluate(async () => {
    const el = document.getElementById('state');
    await window.ccCapabilities.dispatch(
      { action: 'select_option', value: 'Bihar', timeout_ms: 3000 },
      { element: el, widgetType: 'native-select' }
    );
  });

  // Wait for cascade to populate
  await page.evaluate(async () => {
    await window.ccCapabilities.dispatch(
      { action: 'wait_time', options: { ms: 350 }, timeout_ms: 5000 }, {}
    );
  });

  const districtCount = await page.$eval('#district', el => el.options.length);
  ok('Cascade populates districts after state select', districtCount > 1);

  const districtOptions = await page.$eval('#district', el =>
    Array.from(el.options).map(o => o.textContent)
  );
  ok('Districts include Patna', districtOptions.includes('Patna'));

  // Now select district → should populate blocks
  await page.evaluate(async () => {
    const el = document.getElementById('district');
    await window.ccCapabilities.dispatch(
      { action: 'select_option', value: 'Patna', timeout_ms: 3000 },
      { element: el, widgetType: 'native-select' }
    );
  });

  await page.evaluate(async () => {
    await window.ccCapabilities.dispatch(
      { action: 'wait_time', options: { ms: 350 }, timeout_ms: 5000 }, {}
    );
  });

  const blockCount = await page.$eval('#block', el => el.options.length);
  ok('Cascade populates blocks after district select', blockCount > 1);

  await page.close();
}

async function testMultiStep(browser) {
  console.log('\n═══ Suite: Multi-Step Form ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/multi-step-form.html`);
  await injectExtension(page);

  // Step 1 fields should be visible
  const step1Visible = await page.$eval('#name', el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  ok('Step 1 fields are visible', step1Visible);

  // Step 2 fields should be hidden
  const step2Visible = await page.$eval('#qualification', el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  ok('Step 2 fields are initially hidden', !step2Visible);

  // Fill step 1 and advance
  await page.evaluate(async () => {
    const el = document.getElementById('name');
    await window.ccCapabilities.dispatch(
      { action: 'fill_text', value: 'Kamaljeet', timeout_ms: 3000 },
      { element: el, widgetType: 'input-text' }
    );
  });
  await page.click('button:has-text("Next")');

  // Now step 2 should be visible
  const step2Now = await page.$eval('#qualification', el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  ok('Step 2 visible after navigation', step2Now);

  // Extract on step 2 should find the qualification field
  const extractResult = await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    return r.formFields.map(f => f.label);
  });
  ok('Extraction finds step 2 fields', extractResult.some(l => l.includes('Qualification') || l.includes('University')));

  await page.close();
}

async function testAngularWidgets(browser) {
  console.log('\n═══ Suite: Angular Widgets (angular-form.html) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/angular-form.html`);
  await injectExtension(page);

  // ── Extraction ──────────────────────────────────────────────────
  const extraction = await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    return {
      fieldCount: r.formFields.length,
      fields: r.formFields.map(f => ({ label: f.label, type: f.type, selector: f.selector })),
      pageModel: r.pageModel,
    };
  });

  ok('Angular form extracts fields', extraction.fieldCount >= 5);
  ok('Detects mat-input (Applicant Name)', extraction.fields.some(f => f.label && f.label.includes('Applicant')));
  ok('Detects date field (DOB)', extraction.fields.some(f => f.label && f.label.includes('Date of Birth')));
  ok('Detects mobile (tel)', extraction.fields.some(f => f.label && f.label.includes('Mobile')));
  ok('Detects email', extraction.fields.some(f => f.label && f.label.includes('Email')));
  ok('Detects file upload field exists on page', !!await page.$('input[type="file"]'));
  ok('PageModel detects angular-material framework',
    extraction.pageModel && extraction.pageModel.frameworks &&
    extraction.pageModel.frameworks.includes('angular-material'));

  // ── fill_text on mat-input ──────────────────────────────────────
  const fillName = await page.evaluate(async () => {
    const el = document.getElementById('applicantName');
    return await window.ccCapabilities.dispatch(
      { action: 'fill_text', value: 'Sudhir Prasad', timeout_ms: 3000 },
      { element: el, widgetType: 'mat-input' }
    );
  });
  ok('fill_text on mat-input succeeds', fillName.status === 'success');
  const nameVal = await page.$eval('#applicantName', el => el.value);
  ok('mat-input actually has value', nameVal === 'Sudhir Prasad');

  // ── fill_text on datepicker ─────────────────────────────────────
  const fillDob = await page.evaluate(async () => {
    const el = document.getElementById('dob');
    return await window.ccCapabilities.dispatch(
      { action: 'fill_text', value: '15-03-1990', timeout_ms: 3000 },
      { element: el, widgetType: 'mat-input' }
    );
  });
  ok('fill_text on datepicker succeeds', fillDob.status === 'success');
  const dobVal = await page.$eval('#dob', el => el.value);
  ok('Datepicker has date value', dobVal === '15-03-1990');

  // ── fill_text on tel input ──────────────────────────────────────
  const fillMobile = await page.evaluate(async () => {
    const el = document.getElementById('mobile');
    return await window.ccCapabilities.dispatch(
      { action: 'fill_text', value: '9876543210', timeout_ms: 3000 },
      { element: el, widgetType: 'input-tel' }
    );
  });
  ok('fill_text on tel input succeeds', fillMobile.status === 'success');
  const mobileVal = await page.$eval('#mobile', el => el.value);
  ok('Tel input has value', mobileVal === '9876543210');

  // ── mat-select interaction (click to open, click option) ────────
  await page.click('mat-select#genderSelect');
  await page.click('mat-option[value="male"]');
  const genderVal = await page.$eval('#genderSelect', el => el.getAttribute('data-value'));
  ok('mat-select option selectable', genderVal === 'male');
  const genderText = await page.$eval('#genderSelect .mat-select-value', el => el.textContent);
  ok('mat-select shows selected text', genderText.trim() === 'Male');

  // ── ng-select interaction ───────────────────────────────────────
  await page.click('#stateNgSelect .ng-select-container');
  await page.click('#stateNgSelect .ng-option[data-value="bihar"]');
  const stateVal = await page.$eval('#stateNgSelect', el => el.getAttribute('data-value'));
  ok('ng-select selects state', stateVal === 'bihar');

  // Verify cascade: districts should be populated
  await page.waitForTimeout(100);
  const districtOpts = await page.$$eval('#districtNgSelect .ng-option', opts => opts.map(o => o.textContent));
  ok('ng-select cascade populates districts', districtOpts.length >= 3);
  ok('Districts include Patna', districtOpts.includes('Patna'));

  // Select district
  await page.click('#districtNgSelect .ng-select-container');
  await page.click('#districtNgSelect .ng-option:first-child');
  const distVal = await page.$eval('#districtNgSelect', el => el.getAttribute('data-value'));
  ok('ng-select selects district', distVal && distVal.length > 0);

  // ── mat-checkbox ────────────────────────────────────────────────
  await page.click('mat-checkbox#declarationCheck');
  const cbChecked = await page.$eval('#declarationCheck', el => el.classList.contains('mat-checkbox-checked'));
  ok('mat-checkbox toggles checked', cbChecked === true);

  // ── Angular button click ────────────────────────────────────────
  const btnResult = await page.evaluate(async () => {
    const el = document.getElementById('saveDraft');
    return await window.ccCapabilities.dispatch(
      { action: 'click', timeout_ms: 3000 },
      { element: el, widgetType: 'button' }
    );
  });
  ok('Angular button click dispatches', btnResult.status === 'success');

  // ── Aadhaar field with aria-describedby ─────────────────────────
  const aadhaarModel = await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    if (!r.pageModel) return null;
    return r.pageModel.forms[0].fields.find(f => f.label && f.label.includes('Aadhaar'));
  });
  ok('Aadhaar field found in PageModel', !!aadhaarModel);
  ok('Aadhaar has ariaDescribedBy', aadhaarModel && aadhaarModel.ariaDescribedBy === 'aadhaar-help');

  await page.close();
}

async function testPageModel(browser) {
  console.log('\n═══ Suite: PageModel IR ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/govt-form.html`);
  await injectExtension(page);

  const model = await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    return r.pageModel;
  });

  ok('PageModel is produced', model !== null);
  ok('PageModel has version', model.version === '1.0.0');
  ok('PageModel has URL', model.url.includes('govt-form.html'));
  ok('PageModel has hostname or is file URL', model.hostname !== '' || model.url.startsWith('file://'));
  ok('PageModel forms[0] exists', model.forms.length >= 1);
  ok('Fields have fieldId', model.forms[0].fields.every(f => f.fieldId));
  ok('Fields have label', model.forms[0].fields.filter(f => f.label).length > 3);
  ok('Fields have type', model.forms[0].fields.every(f => f.type));
  ok('Dropdown field has options', model.forms[0].fields.some(f => f.options && f.options.length > 0));

  // Verify aria/state enrichment (fields with real _el)
  const nameField = model.forms[0].fields.find(f => f.label && f.label.includes('Full Name'));
  ok('Name field found in PageModel', !!nameField);
  ok('Name field has inputType', nameField && nameField.inputType === 'text');
  ok('Name field visible=true', nameField && nameField.visible === true);

  // Serialization
  const serialized = JSON.stringify(model);
  ok('PageModel JSON-serializable', typeof serialized === 'string' && serialized.length > 100);

  await page.close();
}

// ═══════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════

console.log('CyberControl Browser Tests');
console.log('Extension:', EXT_DIR);
console.log('Fixtures:', FIXTURES);
if (executablePath) console.log('Chrome:', executablePath);
else console.log('Chrome: using Playwright bundled Chromium');

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  await testExtraction(browser);
  await testCapabilityDispatch(browser);
  await testCascadeDropdown(browser);
  await testMultiStep(browser);
  await testAngularWidgets(browser);
  await testPageModel(browser);

} catch (e) {
  console.error('\n🔴 Browser launch failed:', e.message);
  console.error('   Install Chromium: npx playwright install chromium');
  process.exit(1);
} finally {
  if (browser) await browser.close();
}

console.log('\n═════════════════════════════════════');
console.log(`Browser Tests: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
