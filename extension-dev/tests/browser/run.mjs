/**
 * Phase 1.3 — Browser Test Harness
 *
 * Loads the CyberControl extension UNPACKED in Chromium via Playwright,
 * then exercises real extraction → mapping → execution flows against
 * fixture HTML pages.
 *
 * Run: node extension-dev/tests/browser/run.mjs
 * Requires: npx playwright install chromium (one-time)
 */

import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const EXT_DIR = resolve(__dirname, '../../../extension');
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
  'shared/semantic-aliases.js',
  'models/ir.js',
  'capabilities/registry.js',
  'runtime/resolver.js',
  'runtime/runner.js',
  'autofill/plugins/interface.js',
  'autofill/plugins/cascade-select.js',
  'autofill/plugins/ng-dropdown.js',
  'autofill/plugins/keystroke-input.js',
  'runtime/plugin-bridge.js',
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
  // Phase 4.1: stub deleted legacy functions so tests that reference them degrade gracefully
  await page.evaluate(() => {
    if (typeof fuzzyMatch === 'undefined') window.fuzzyMatch = () => ({});
    if (typeof ccEvaluateField === 'undefined') window.ccEvaluateField = () => null;
  });
  // Inject test aliases (simulates service-provided aliases for test environment)
  await page.evaluate(() => {
    if (window.ccSemanticAliases && window.ccSemanticAliases.merge) {
      window.ccSemanticAliases.merge({
        'full_name': ['full name', 'name', 'applicant name', 'candidate name'],
        'father_name': ['father', "father's name", 'father name'],
        'dob': ['date of birth', 'dob', 'birth date'],
        'gender': ['gender', 'sex'],
        'email': ['email', 'e-mail', 'email id', 'email address'],
        'mobile': ['mobile', 'phone', 'mobile number', 'contact'],
        'aadhaar': ['aadhaar', 'aadhar', 'uidai'],
        'category': ['category', 'caste', 'reservation category'],
        'state': ['state'],
        'district': ['district'],
        'agree': ['agree', 'declaration', 'i agree', 'i declare'],
      });
    }
  });
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
  console.log('\n═══ Suite: Simulated Angular Widgets (CSS mockup — NOT real Angular) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/simulated-angular-form.html`);
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

async function testActionPlanRunner(browser) {
  console.log('\n═══ Suite: ActionPlan Runner (govt-form.html) ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/govt-form.html`);
  await injectExtension(page);

  // First, extract to set up resolver context
  await page.evaluate(() => {
    const r = extractFormFieldsWithFingerprint();
    // Set up the resolver with the extraction results
    const allFields = r.pageModel.forms[0].fields;
    const elements = r.formFields.map(f => document.querySelector(f.selector));
    window.ccResolver.setPageContext(r.pageModel, elements);
  });

  // Execute a linear plan against the real form
  const observation = await page.evaluate(async () => {
    const plan = {
      plan_id: 'browser_test_plan',
      session_id: 'browser_session',
      actions: [
        { action: 'fill_text', target: { semantic_key: 'full_name' }, value: 'Kamaljeet Singh', timeout_ms: 3000 },
        { action: 'select_option', target: { label: 'Category' }, value: 'OBC', timeout_ms: 3000 },
        { action: 'click', target: { label: 'Gender', hint: { name: 'gender' } }, timeout_ms: 3000 },
        { action: 'check', target: { label: 'I agree' }, value: 'true', timeout_ms: 3000 },
      ]
    };
    return await window.ccRunner.executeLinear(plan);
  });

  ok('ActionPlan: observation produced', observation !== null);
  ok('ActionPlan: plan_id preserved', observation.plan_id === 'browser_test_plan');
  ok('ActionPlan: protocol_version = 2', observation.protocol_version === 2);
  ok('ActionPlan: execution_path populated', observation.execution_path.length > 0);
  ok('ActionPlan: fill_text succeeded', observation.execution_path[0].status === 'success');
  ok('ActionPlan: page_state captured', observation.page_state !== null);

  // Verify DOM was actually modified
  const fullname = await page.$eval('#fullname', el => el.value);
  ok('ActionPlan DOM: name filled', fullname === 'Kamaljeet Singh');

  const category = await page.$eval('#category', el => el.value);
  ok('ActionPlan DOM: category selected', category !== '');

  // Execute a graph plan with checkpoint
  const obs2 = await page.evaluate(async () => {
    const graphPlan = {
      plan_id: 'graph_test',
      session_id: 'gs1',
      version: 2,
      entry_node: 'fill_dob',
      nodes: {
        fill_dob: { type: 'action', action: { action: 'fill_text', target: { semantic_key: 'dob' }, value: '15-03-1990', timeout_ms: 3000 } },
        cp: { type: 'checkpoint', checkpoint: { checkpoint_id: 'personal_done', label: 'Personal details complete', save_state: false } },
        done: { type: 'terminal', terminal: { status: 'complete', reason: null } },
      },
      edges: [
        { from: 'fill_dob', to: 'cp', condition: 'success' },
        { from: 'cp', to: 'done', condition: 'success' },
        { from: 'fill_dob', to: 'fail', condition: 'failure' },
      ]
    };
    return await window.ccRunner.execute(graphPlan);
  });

  ok('Graph plan: completed', obs2.execution_path.some(e => e.node_id === 'done'));
  ok('Graph plan: checkpoint recorded', obs2.checkpoints_reached.includes('personal_done'));

  // Test: failed target reports error properly
  const obs3 = await page.evaluate(async () => {
    return await window.ccRunner.executeLinear({
      plan_id: 'fail_test',
      actions: [
        { action: 'fill_text', target: { field_id: 'nonexistent_field_xyz' }, value: 'X', timeout_ms: 1000 },
      ]
    });
  });
  ok('Failed plan: error reported', obs3.execution_path[0].status === 'failed');
  ok('Failed plan: target_not_resolved error', obs3.execution_path[0].error && obs3.execution_path[0].error.includes('target_not_resolved'));

  await page.close();
}

async function testRunnerPrimary(browser) {
  console.log('\n═══ Suite: Runner as Primary Execution Path ═══');
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/govt-form.html`);
  await injectExtension(page);

  // Simulate the production flow: extract → build ActionPlan → run → check fallback
  const result = await page.evaluate(async () => {
    // Extract fields (mimics popup.js production flow)
    const { formFields, pageModel } = extractFormFieldsWithFingerprint();
    const elements = formFields.map(f => document.querySelector(f.selector));
    window.ccResolver.setPageContext(pageModel, elements);

    // Build ActionPlan from a mock mapping (same as popup.js would)
    const mapping = {};
    const directChecks = [];
    for (const f of formFields) {
      if (f.label && f.label.includes('Full Name')) {
        mapping[f.selector] = { value: 'Runner Primary Test', type: f.type };
      }
      if (f.type === 'dropdown' && f.label === 'Category') {
        mapping[f.selector] = { value: 'OBC', type: f.type };
      }
      if (f.type === 'radio-group') {
        const idx = (f.options || []).indexOf('Male');
        if (idx >= 0 && f.optionSelectors && f.optionSelectors[idx]) {
          directChecks.push({ selector: f.optionSelectors[idx], check: true });
        }
      }
      if (f.type === 'checkbox-agreement') {
        directChecks.push({ selector: f.selector, check: true });
      }
    }

    // Convert to ActionPlan (same logic as popup.js Phase 1.7)
    const actions = [];
    const actionFieldMap = [];
    for (const [selector, entry] of Object.entries(mapping)) {
      const field = formFields.find(f => f.selector === selector);
      if (!field) continue;
      const target = { field_id: field.id ? 'id:' + field.id : null, label: field.label };
      if (!target.field_id && field.name) target.field_id = 'name:' + field.name;
      if (field.type === 'dropdown') {
        actions.push({ action: 'select_option', target, value: entry.value, timeout_ms: 5000 });
      } else {
        actions.push({ action: 'fill_text', target, value: entry.value, timeout_ms: 3000 });
      }
      actionFieldMap.push(selector);
    }
    for (const dc of directChecks) {
      actions.push({ action: 'check', target: { css_selector: dc.selector }, value: 'true', timeout_ms: 3000 });
      actionFieldMap.push(dc.selector);
    }

    // Execute through runner (PRIMARY path)
    const obs = await window.ccRunner.executeLinear({
      plan_id: 'primary_test',
      session_id: 'test_session',
      actions,
    });

    // Determine what runner succeeded on
    const runnerSucceeded = new Set();
    const path = obs.execution_path.filter(e => e.node_id.startsWith('n'));
    for (let i = 0; i < path.length && i < actionFieldMap.length; i++) {
      if (path[i].status === 'success') runnerSucceeded.add(actionFieldMap[i]);
    }

    // What would need executor fallback?
    const fallbackNeeded = Object.keys(mapping).filter(s => !runnerSucceeded.has(s));
    const dcFallback = directChecks.filter(dc => !runnerSucceeded.has(dc.selector));

    return {
      totalActions: actions.length,
      runnerSucceededCount: runnerSucceeded.size,
      fallbackNeeded: fallbackNeeded.length,
      dcFallback: dcFallback.length,
      fullname: document.getElementById('fullname').value,
      category: document.getElementById('category').value,
      radioChecked: document.querySelector('input[name="gender"][value="M"]')?.checked || false,
      agreeChecked: document.getElementById('agree')?.checked || false,
    };
  });

  ok('Runner executes all actions', result.totalActions >= 4);
  ok('Runner succeeds on majority', result.runnerSucceededCount >= 3);
  ok('Runner fills text (name)', result.fullname === 'Runner Primary Test');
  ok('Runner selects dropdown (category)', result.category !== '');
  ok('Runner checks radio', result.radioChecked === true);
  ok('Runner checks checkbox (agreement)', result.agreeChecked === true);
  ok('No fallback needed (runner handled all)', result.fallbackNeeded === 0 && result.dcFallback === 0);

  await page.close();
}

// ═══ Issue #81 Regression: Dropdowns must SELECT options, not just click ═══
async function testDropdownSelection(browser) {
  console.log('\n═══ Suite: Dropdown Selection (Issue #81 regression) ═══');

  // Test 1: ng-select on simulated-angular-form.html
  const page1 = await browser.newPage();
  await page1.goto(`file://${FIXTURES}/simulated-angular-form.html`);
  await injectExtension(page1);

  const ngResult = await page1.evaluate(async () => {
    const { formFields } = extractFormFieldsWithFingerprint();
    const profile = { name: 'Test User', gender: 'Female', state: 'Bihar', district: 'Patna', mobile: '9876543210', email: 'test@test.com' };
    const mapping = fuzzyMatch(formFields, profile);
    const fbs = {};
    for (const [sel, v] of Object.entries(mapping)) { const f = formFields.find(ff => ff.selector === sel); fbs[sel] = { label: f?.label || sel, profileKey: '' }; }
    await fillFormFieldsSequential(mapping, fbs, {});
    await new Promise(r => setTimeout(r, 6000));
    return {
      gender: document.querySelector('mat-select#genderSelect')?.getAttribute('data-value'),
      state: document.querySelector('#stateNgSelect')?.getAttribute('data-value'),
      district: document.querySelector('#districtNgSelect')?.getAttribute('data-value'),
      // Check extractor doesn't produce duplicates for ng-select
      ngFields: formFields.filter(f => /state/i.test(f.label)).length,
    };
  });

  ok('mat-select selects option (Gender=female)', ngResult.gender === 'female', `got: ${ngResult.gender}`);
  ok('ng-select selects option (State=bihar)', ngResult.state === 'bihar', `got: ${ngResult.state}`);
  ok('ng-select cascade selects option (District=patna)', ngResult.district === 'patna', `got: ${ngResult.district}`);
  ok('Extractor: no duplicate ng-select entries for State', ngResult.ngFields <= 2, `got: ${ngResult.ngFields} entries`);
  await page1.close();

  // Test 2: Native cascade select on cascade-select.html
  const page2 = await browser.newPage();
  await page2.goto(`file://${FIXTURES}/cascade-select.html`);
  await injectExtension(page2);
  // Add block/pincode aliases for this test
  await page2.evaluate(() => {
    window.ccSemanticAliases.merge({ block: ['block','tehsil'], pincode: ['pincode','pin'] });
  });

  const cascadeResult = await page2.evaluate(async () => {
    const { formFields } = extractFormFieldsWithFingerprint();
    const profile = { name: 'Test User', state: 'Bihar', district: 'Muzaffarpur', block: 'Kanti', pincode: '842001' };
    const mapping = fuzzyMatch(formFields, profile);
    const fbs = {};
    for (const [sel, v] of Object.entries(mapping)) { const f = formFields.find(ff => ff.selector === sel); fbs[sel] = { label: f?.label || sel, profileKey: '' }; }
    await fillFormFieldsSequential(mapping, fbs, {});
    await new Promise(r => setTimeout(r, 8000));
    return {
      state: document.querySelector('#state')?.value,
      district: document.querySelector('#district')?.value,
      block: document.querySelector('#block')?.value,
      districtOpts: document.querySelector('#district')?.options?.length || 0,
      blockOpts: document.querySelector('#block')?.options?.length || 0,
    };
  });

  ok('Native cascade: State selected (BR)', cascadeResult.state === 'BR', `got: ${cascadeResult.state}`);
  ok('Native cascade: District options loaded', cascadeResult.districtOpts > 1, `opts: ${cascadeResult.districtOpts}`);
  ok('Native cascade: District selected (Muzaffarpur)', cascadeResult.district === 'Muzaffarpur', `got: ${cascadeResult.district}`);
  ok('Native cascade: Block options loaded', cascadeResult.blockOpts > 1, `opts: ${cascadeResult.blockOpts}`);
  ok('Native cascade: Block selected (Kanti)', cascadeResult.block === 'Kanti', `got: ${cascadeResult.block}`);
  await page2.close();
}

async function testPhase1Completeness(browser) {
  console.log('\n═══ Suite: Phase 1 Completeness (ng-select, mat-select, upload, human) ═══');

  // ── ng-select via capability dispatch ───────────────────────────
  const page = await browser.newPage();
  await page.goto(`file://${FIXTURES}/simulated-angular-form.html`);
  await injectExtension(page);

  const ngResult = await page.evaluate(async () => {
    const el = document.querySelector('#stateNgSelect');
    const wt = window.ccCapabilities.resolveWidgetType(el);
    const r = await window.ccCapabilities.dispatch({ action: 'select_option', value: 'Bihar', timeout_ms: 5000 }, { element: el, widgetType: wt });
    return { wt, status: r.status, actual: r.actual_value, dataValue: el.getAttribute('data-value') };
  });
  ok('ng-select: detected as ng-select widget', ngResult.wt === 'ng-select');
  ok('ng-select: select_option succeeds', ngResult.status === 'success');
  ok('ng-select: correct value selected', ngResult.dataValue === 'bihar');

  // ── mat-select via capability dispatch ──────────────────────────
  const matResult = await page.evaluate(async () => {
    const el = document.querySelector('#genderSelect');
    const wt = window.ccCapabilities.resolveWidgetType(el);
    const r = await window.ccCapabilities.dispatch({ action: 'select_option', value: 'Female', timeout_ms: 5000 }, { element: el, widgetType: wt });
    return { wt, status: r.status, actual: r.actual_value, dataValue: el.getAttribute('data-value') };
  });
  ok('mat-select: detected as mat-select widget', matResult.wt === 'mat-select');
  ok('mat-select: select_option succeeds', matResult.status === 'success');
  ok('mat-select: correct value selected', matResult.dataValue === 'female');

  // ── fill_text keystroke simulation ──────────────────────────────
  const keystrokeResult = await page.evaluate(async () => {
    const el = document.getElementById('applicantName');
    const events = [];
    el.addEventListener('keydown', (e) => events.push('kd:' + e.key));
    el.addEventListener('input', () => events.push('in'));
    el.addEventListener('change', () => events.push('ch'));
    el.addEventListener('blur', () => events.push('bl'));
    const r = await window.ccCapabilities.dispatch({ action: 'fill_text', value: 'AB', timeout_ms: 3000 }, { element: el, widgetType: 'input-text' });
    return { status: r.status, value: el.value, events };
  });
  ok('fill_text: keystroke events fired', keystrokeResult.events.includes('kd:A') && keystrokeResult.events.includes('kd:B'));
  ok('fill_text: input events fired per char', keystrokeResult.events.filter(e => e === 'in').length >= 2);
  ok('fill_text: change event fired', keystrokeResult.events.includes('ch'));
  ok('fill_text: blur event fired', keystrokeResult.events.includes('bl'));
  ok('fill_text: value set correctly', keystrokeResult.value === 'AB');

  // ── upload_file capability ──────────────────────────────────────
  const uploadResult = await page.evaluate(async () => {
    const el = document.querySelector('input[type="file"]');
    if (!el) return { error: 'no file input' };
    const wt = window.ccCapabilities.resolveWidgetType(el);
    const r = await window.ccCapabilities.dispatch({ action: 'upload_file', value: 'photo.jpg', timeout_ms: 3000 }, { element: el, widgetType: wt });
    return { status: r.status, actual: r.actual_value };
  });
  ok('upload_file: capability exists and executes', uploadResult.status === 'success' || uploadResult.status === 'waiting_human');

  // ── waiting_human handling ──────────────────────────────────────
  const humanResult = await page.evaluate(async () => {
    const r = await window.ccCapabilities.dispatch({ action: 'request_human', reason: 'otp', prompt: 'Enter OTP', timeout_ms: 3000 }, {});
    return { status: r.status, actual: r.actual_value };
  });
  ok('request_human: returns waiting_human', humanResult.status === 'waiting_human');

  // ── Runner handles waiting_human correctly ──────────────────────
  const humanPlanResult = await page.evaluate(async () => {
    const obs = await window.ccRunner.executeLinear({
      plan_id: 'human_test',
      session_id: 'test',
      actions: [
        { action: 'fill_text', target: { css_selector: '#applicantName' }, value: 'Before Human', timeout_ms: 3000 },
        { action: 'request_human', reason: 'otp', prompt: 'Enter OTP', timeout_ms: 0 },
      ]
    });
    const statuses = obs.execution_path.map(e => e.node_id + ':' + e.status);
    return { statuses, humanInteractions: obs.human_interactions.length };
  });
  ok('Runner: fills before human pause', humanPlanResult.statuses[0] === 'n0:success');
  ok('Runner: records human interaction', humanPlanResult.humanInteractions >= 1);

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
  await testActionPlanRunner(browser);
  await testRunnerPrimary(browser);
  // Phase 4.1: testDropdownSelection skipped — depends on deleted mapper.js fuzzyMatch
  // Legacy dropdown selection is tested via ActionPlanExecutor product path instead.
  await testPhase1Completeness(browser);

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
