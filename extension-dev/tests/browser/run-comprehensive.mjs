/**
 * CyberControl — Comprehensive Input Type Tests
 * Exercises ALL input types from the CyberControl Test Portal fixture.
 *
 * Covers: text, password, email, number, tel, url, search, date,
 * datetime-local, time, month, week, color, range, file, hidden,
 * checkbox, radio, select, multi-select, textarea, buttons,
 * cascading dropdowns, custom searchable dropdown, OTP/PIN widgets,
 * wizard multi-step, repeating sections, drag-drop upload,
 * delayed DOM fields, dynamic add/remove.
 *
 * Run: node extension-dev/tests/browser/run-comprehensive.mjs
 * Requires: npx playwright install chromium
 */

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures');
const PORTAL = resolve(FIXTURES, 'comprehensive-portal.html');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

// Locate Chrome/Chromium
const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  process.env.CHROME_PATH,
].filter(Boolean);
let executablePath = CHROME_PATHS.find(p => existsSync(p)) || undefined;

async function run() {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(`file://${PORTAL}`);
  await page.waitForTimeout(600); // let delayed fields appear

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: All Input Types (s-all tab)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: All Input Types ═══');

  // Navigate to "All Inputs" tab
  await page.click('button[data-s="s-all"]');
  await page.waitForTimeout(100);

  // Text
  await page.fill('#i-text', 'Hello World');
  ok('text input fill', await page.$eval('#i-text', el => el.value) === 'Hello World');

  // Password
  await page.fill('#i-pw', 'Str0ng!Pass');
  ok('password input fill', await page.$eval('#i-pw', el => el.value) === 'Str0ng!Pass');

  // Email
  await page.fill('#i-email', 'test@example.com');
  ok('email input fill', await page.$eval('#i-email', el => el.value) === 'test@example.com');

  // Number
  await page.fill('#i-num', '42');
  ok('number input fill', await page.$eval('#i-num', el => el.value) === '42');

  // Tel
  await page.fill('#i-tel', '9876543210');
  ok('tel input fill', await page.$eval('#i-tel', el => el.value) === '9876543210');

  // URL
  await page.fill('#i-url', 'https://example.com');
  ok('url input fill', await page.$eval('#i-url', el => el.value) === 'https://example.com');

  // Search
  await page.fill('#i-search', 'query');
  ok('search input fill', await page.$eval('#i-search', el => el.value) === 'query');

  // Date
  await page.fill('#i-date', '2000-01-15');
  ok('date input fill', await page.$eval('#i-date', el => el.value) === '2000-01-15');

  // Datetime-local
  await page.fill('#i-dt', '2000-01-15T10:30');
  ok('datetime-local input fill', await page.$eval('#i-dt', el => el.value) === '2000-01-15T10:30');

  // Time
  await page.fill('#i-time', '14:30');
  ok('time input fill', await page.$eval('#i-time', el => el.value) === '14:30');

  // Month
  await page.fill('#i-month', '2025-06');
  ok('month input fill', await page.$eval('#i-month', el => el.value) === '2025-06');

  // Week
  await page.fill('#i-week', '2025-W20');
  ok('week input fill', await page.$eval('#i-week', el => el.value) === '2025-W20');

  // Color
  await page.evaluate(() => { document.querySelector('#i-color').value = '#ff5500'; });
  ok('color input fill', await page.$eval('#i-color', el => el.value) === '#ff5500');

  // Range
  await page.evaluate(() => {
    const el = document.querySelector('#i-range');
    el.value = 75;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  ok('range input fill', await page.$eval('#i-range', el => el.value) === '75');

  // File
  ok('file input exists', await page.$('#i-file') !== null);

  // Hidden
  ok('hidden input has value', await page.$eval('#i-hid', el => el.value) === 'secret');

  // Checkbox
  await page.check('#i-cb');
  ok('checkbox check', await page.$eval('#i-cb', el => el.checked) === true);

  // Radio
  await page.check('input[name="i_rad"][value="b"]');
  ok('radio select', await page.$eval('input[name="i_rad"][value="b"]', el => el.checked) === true);

  // Select
  await page.selectOption('#i-sel', 'Two');
  ok('select option', await page.$eval('#i-sel', el => el.value) === 'Two');

  // Multi-select
  await page.selectOption('#i-msel', ['Red', 'Blue']);
  const multiVals = await page.$eval('#i-msel', el => Array.from(el.selectedOptions).map(o => o.value));
  ok('multi-select options', multiVals.includes('Red') && multiVals.includes('Blue'));

  // Textarea
  await page.fill('#i-ta', 'Multi\nLine\nText');
  ok('textarea fill', (await page.$eval('#i-ta', el => el.value)).includes('Multi'));

  // Disabled input (should not be fillable)
  ok('disabled input detected', await page.$eval('#i-dis', el => el.disabled) === true);

  // Readonly input
  ok('readonly input detected', await page.$eval('#i-ro', el => el.readOnly) === true);

  // Buttons
  ok('submit button exists', await page.$('#f-all button[type="submit"]') !== null);
  ok('reset button exists', await page.$('#f-all button[type="reset"]') !== null);
  ok('button element exists', await page.$('#i-btn') !== null);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: Government Form (cascades, conditional fields)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Gov Form & Cascades ═══');

  await page.click('button[data-s="s-gov"]');
  await page.waitForTimeout(400);

  // Text fields
  await page.fill('#g-name', 'Sandhya Kumari');
  ok('gov name fill', await page.$eval('#g-name', el => el.value) === 'Sandhya Kumari');

  await page.fill('#g-father', 'Sudhir Prasad');
  ok('gov father name', await page.$eval('#g-father', el => el.value) === 'Sudhir Prasad');

  // Date (native)
  await page.fill('#g-dob', '2000-05-15');
  ok('gov date of birth', await page.$eval('#g-dob', el => el.value) === '2000-05-15');

  // Select
  await page.selectOption('#g-gender', 'female');
  ok('gov gender select', await page.$eval('#g-gender', el => el.value) === 'female');

  // Cascading state→district→block→village
  await page.waitForSelector('#g-state:not([disabled])');
  await page.selectOption('#g-state', 'Maharashtra');
  await page.waitForTimeout(500);
  ok('cascade: state populated', await page.$eval('#g-state', el => el.value) === 'Maharashtra');

  await page.waitForSelector('#g-dist:not([disabled])');
  const distOptions = await page.$$eval('#g-dist option', opts => opts.length);
  ok('cascade: district populated after state', distOptions > 1);

  await page.selectOption('#g-dist', 'Pune');
  await page.waitForTimeout(500);
  await page.waitForSelector('#g-block:not([disabled])');
  const blockOptions = await page.$$eval('#g-block option', opts => opts.length);
  ok('cascade: block populated after district', blockOptions > 1);

  // Email
  await page.fill('#g-email', 'sandhya@test.com');
  ok('gov email fill', await page.$eval('#g-email', el => el.value) === 'sandhya@test.com');

  // Tel
  await page.fill('#g-mob', '9876543210');
  ok('gov mobile tel fill', await page.$eval('#g-mob', el => el.value) === '9876543210');

  // Number
  await page.fill('#g-inc', '250000');
  ok('gov income number fill', await page.$eval('#g-inc', el => el.value) === '250000');

  // Textarea
  await page.fill('#g-addr', '123 Main Street, Ward 5');
  ok('gov address textarea', (await page.$eval('#g-addr', el => el.value)).includes('Main Street'));

  // Conditional field: married shows spouse
  await page.selectOption('#g-mar', 'married');
  await page.waitForTimeout(100);
  ok('conditional: spouse section shown', await page.$eval('#g-spouse', el => el.classList.contains('show')));

  // File upload
  ok('gov photo file input', await page.$('#g-photo') !== null);
  ok('gov signature file input', await page.$('#g-signf') !== null);

  // Checkbox (declaration)
  await page.check('#g-dec');
  ok('gov declaration checkbox', await page.$eval('#g-dec', el => el.checked));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: Custom Widgets
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Custom Widgets ═══');

  await page.click('button[data-s="s-wid"]');
  await page.waitForTimeout(100);

  // Searchable dropdown
  await page.click('#cs-c .cs-trig');
  await page.waitForTimeout(100);
  ok('custom dropdown opens', await page.$eval('#cs-c .cs-drop', el => el.classList.contains('open')));

  await page.fill('#cs-c .cs-search', 'Ind');
  await page.click('.cs-opt[data-v="IN"]');
  ok('custom dropdown select India', await page.$eval('#cs-c-v', el => el.value) === 'IN');

  // OTP widget (6 digits)
  const otpBoxes = await page.$$('#otp-g .ob');
  ok('OTP: 6 digit boxes exist', otpBoxes.length === 6);
  for (let i = 0; i < 6; i++) {
    await otpBoxes[i].fill(String(i + 1));
  }
  ok('OTP: filled all digits', await page.$eval('#otp-v', el => el.value) === '123456');

  // PIN widget (4 digits, password type)
  const pinBoxes = await page.$$('#pin-g .pb');
  ok('PIN: 4 password boxes exist', pinBoxes.length === 4);
  ok('PIN: type is password', await pinBoxes[0].getAttribute('type') === 'password');

  // Switch/toggle (checkbox styled as switch — hidden checkbox, visible slider)
  await page.evaluate(() => { document.querySelector('#cc-sw').checked = true; });
  ok('switch toggle checked', await page.$eval('#cc-sw', el => el.checked));

  // Radio group
  await page.check('input[name="cc_plan"][value="basic"]');
  ok('widget radio select', await page.$eval('input[name="cc_plan"][value="basic"]', el => el.checked));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: Cascading Dropdowns (dedicated section)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Cascade Section ═══');

  await page.click('button[data-s="s-dyn"]');
  await page.waitForTimeout(100);

  await page.selectOption('#d-c', 'IN');
  await page.waitForTimeout(800);
  const dStateEnabled = await page.$eval('#d-s', el => !el.disabled);
  ok('cascade section: state enabled after country', dStateEnabled);

  await page.selectOption('#d-s', 'Maharashtra');
  await page.waitForTimeout(800);
  const dDistEnabled = await page.$eval('#d-d', el => !el.disabled);
  ok('cascade section: district enabled after state', dDistEnabled);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 5: Uploads
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Uploads ═══');

  await page.click('button[data-s="s-up"]');
  await page.waitForTimeout(100);

  ok('upload: photo input exists', await page.$('#up-ph') !== null);
  ok('upload: signature input exists', await page.$('#up-sg') !== null);
  ok('upload: aadhaar input exists', await page.$('#up-ad') !== null);
  ok('upload: pan input exists', await page.$('#up-pn') !== null);
  ok('upload: resume input exists', await page.$('#up-rs') !== null);
  ok('upload: drag-drop zone exists', await page.$('#dz') !== null);

  // Verify file input accept attributes
  ok('upload: photo accepts images', await page.$eval('#up-ph', el => el.accept) === 'image/*');
  ok('upload: resume accepts docs', (await page.$eval('#up-rs', el => el.accept)).includes('.pdf'));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: Wizard (multi-step form)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Multi-Step Wizard ═══');

  await page.click('button[data-s="s-wiz"]');
  await page.waitForTimeout(100);

  // Step 1 visible
  ok('wizard: step 1 visible', await page.$eval('.wiz-p[data-st="1"]', el => el.classList.contains('on')));

  await page.fill('#w-name', 'Test User');
  await page.fill('#w-dob', '1995-03-20');
  await page.click('#w-next');
  await page.waitForTimeout(100);

  // Step 2 visible
  ok('wizard: step 2 after next', await page.$eval('.wiz-p[data-st="2"]', el => el.classList.contains('on')));

  await page.fill('#w-mob', '9123456789');
  await page.fill('#w-email', 'test@test.com');
  await page.click('#w-next');
  await page.waitForTimeout(100);

  ok('wizard: step 3 (address)', await page.$eval('.wiz-p[data-st="3"]', el => el.classList.contains('on')));

  // Go back
  await page.click('#w-prev');
  await page.waitForTimeout(100);
  ok('wizard: back to step 2', await page.$eval('.wiz-p[data-st="2"]', el => el.classList.contains('on')));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 7: DOM Stress (delayed/dynamic fields)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: DOM Stress & Dynamic Fields ═══');

  await page.click('button[data-s="s-str"]');
  await page.waitForTimeout(1200); // wait for 500ms and 1000ms delayed fields

  ok('delayed 500ms field visible', await page.$eval('#dl-500', el => el.classList.contains('vis')));
  ok('delayed 1s field visible', await page.$eval('#dl-1000', el => el.classList.contains('vis')));

  // Dynamic field add
  await page.click('#str-add');
  await page.waitForTimeout(100);
  const dynFields = await page.$$('#str-dyn .fg');
  ok('dynamic field added', dynFields.length >= 1);

  // Dynamic field remove
  await page.click('#str-rm');
  await page.waitForTimeout(100);
  const dynAfter = await page.$$('#str-dyn .fg');
  ok('dynamic field removed', dynAfter.length < dynFields.length);

  // Conditional reveal
  await page.selectOption('#str-sel', 'show');
  await page.waitForTimeout(100);
  ok('conditional reveal works', await page.$eval('#str-extra', el => el.classList.contains('show')));

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 8: Repeating Sections
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Repeating Sections ═══');

  await page.click('button[data-s="s-rep"]');
  await page.waitForTimeout(100);

  const famBefore = await page.$$('#fam-box .rep');
  await page.click('#add-fam');
  await page.waitForTimeout(100);
  const famAfter = await page.$$('#fam-box .rep');
  ok('repeating: add family member', famAfter.length === famBefore.length + 1);

  const eduBefore = await page.$$('#edu-box .rep');
  await page.click('#add-edu');
  await page.waitForTimeout(100);
  const eduAfter = await page.$$('#edu-box .rep');
  ok('repeating: add education row', eduAfter.length === eduBefore.length + 1);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 9: Table (editable, sortable)
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Editable Table ═══');

  await page.click('button[data-s="s-tbl"]');
  await page.waitForTimeout(100);

  const rows = await page.$$('#tbl tbody tr');
  ok('table: has data rows', rows.length >= 4);

  // Table: editable cells
  const editableInput = await page.$('#tbl tbody .ed input');
  ok('table: editable input cells exist', editableInput !== null);

  // Table: sortable headers
  ok('table: sortable column headers', await page.$('#tbl th[data-c]') !== null);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 10: Real Portal Datepickers
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══ Suite: Real Portal Datepickers ═══');

  const DATEPICKER_FIXTURE = resolve(FIXTURES, 'real-portal-datepickers.html');
  await page.goto(`file://${DATEPICKER_FIXTURE}`);
  await page.waitForTimeout(1500); // let CDN libraries load

  // 1. ServicePlus split dropdowns (DD/MM/YYYY)
  await page.selectOption('#sp-day', '15');
  await page.selectOption('#sp-month', '05');
  await page.selectOption('#sp-year', '2000');
  await page.waitForTimeout(100);
  ok('datepicker: ServicePlus day select', await page.$eval('#sp-day', el => el.value) === '15');
  ok('datepicker: ServicePlus month select', await page.$eval('#sp-month', el => el.value) === '05');
  ok('datepicker: ServicePlus year select', await page.$eval('#sp-year', el => el.value) === '2000');
  ok('datepicker: ServicePlus combined value', await page.$eval('#sp-dob-combined', el => el.value) === '15/05/2000');

  // 2. Split text inputs (DD / MM / YYYY)
  await page.fill('#txt-day', '20');
  await page.fill('#txt-month', '03');
  await page.fill('#txt-year', '1995');
  await page.waitForTimeout(100);
  ok('datepicker: split text day', await page.$eval('#txt-day', el => el.value) === '20');
  ok('datepicker: split text month', await page.$eval('#txt-month', el => el.value) === '03');
  ok('datepicker: split text year', await page.$eval('#txt-year', el => el.value) === '1995');
  ok('datepicker: split text combined', await page.$eval('#txt-dob-combined', el => el.value) === '20/03/1995');

  // 3. flatpickr (set value via input — allowInput:true)
  await page.evaluate(() => {
    const el = document.querySelector('#fp-dob');
    el._flatpickr.setDate('15-08-2000', true);
  });
  ok('datepicker: flatpickr value set', (await page.$eval('#fp-dob', el => el.value)).includes('15'));

  // 4. jQuery UI (trigger via setDate)
  await page.evaluate(() => {
    $('#jq-dob').datepicker('setDate', new Date(2000, 4, 15));
  });
  ok('datepicker: jQuery UI value set', (await page.$eval('#jq-dob', el => el.value)).includes('15'));

  // 5. Bootstrap Datepicker
  await page.evaluate(() => {
    $('#bs-dob').datepicker('setDate', new Date(2000, 4, 15));
  });
  const bsVal = await page.$eval('#bs-dob', el => el.value);
  ok('datepicker: Bootstrap value set', bsVal.includes('15'));

  // 6. Material-style calendar (open, click a day)
  await page.click('#mat-cal-btn');
  await page.waitForTimeout(200);
  ok('datepicker: Material calendar opens', await page.$eval('#mat-cal', el => el.classList.contains('open')));

  // Click day 10
  await page.click('#mat-grid .day:nth-child(17)'); // 10th day (after 7 headers)
  await page.waitForTimeout(100);
  const matVal = await page.$eval('#mat-dob', el => el.value);
  ok('datepicker: Material date selected', matVal.length > 0);

  // 7. Native HTML5 date
  await page.fill('#native-dob', '2000-05-15');
  ok('datepicker: native date fill', await page.$eval('#native-dob', el => el.value) === '2000-05-15');

  // Native time
  await page.fill('#native-time', '14:30');
  ok('datepicker: native time fill', await page.$eval('#native-time', el => el.value) === '14:30');

  // Native datetime-local
  await page.fill('#native-dtl', '2000-05-15T14:30');
  ok('datepicker: native datetime-local', await page.$eval('#native-dtl', el => el.value) === '2000-05-15T14:30');

  // ═══════════════════════════════════════════════════════════════════

  await browser.close();

  console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
