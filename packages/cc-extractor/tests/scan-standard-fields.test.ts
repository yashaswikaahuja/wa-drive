/**
 * scan-standard-fields.test.ts — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(path.join(__dirname, '../src/scan-standard-fields.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const root = {};
new Function('globalThis', src)(root);
const { scan, guessCanonicalKey } = root.CcScanStandardFields;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

const helpers = {
  isInSkipContext: (el) => !!el._skip,
  getLabel: (el) => el._label || '',
  isGoodLabel: (s) => !!(s && s.trim().length >= 2 && /[a-zA-Z0-9]/.test(s)),
};

function makeInput(props) {
  const el = Object.assign({
    type: 'text', id: '', name: '', value: '', className: '',
    placeholder: '', tagName: 'INPUT', _label: '', _skip: false,
    closest: () => null,
    querySelectorAll: () => [],
    getAttribute(k) { return this[k] != null && this[k] !== '' ? String(this[k]) : null; },
  }, props);
  return el;
}

function makeDoc(elements) {
  return { querySelectorAll(sel) { return sel.includes('input[type="text"]') ? elements : []; } };
}

// ── Skip types ────────────────────────────────────────────────────────────────
console.log('\nSkip types');
for (const t of ['hidden','button','password','image','reset']) {
  const { formFields } = scan(makeDoc([makeInput({ type: t })]), helpers);
  assert(`type="${t}" skipped`, formFields.length, 0);
}
{
  const { formFields } = scan(makeDoc([makeInput({ type: 'submit', id: 'go', value: 'Submit', _label: 'Submit' })]), helpers);
  assert('submit captured', formFields.length, 1);
  assert('submit humanGate', formFields[0].humanGate, 'submit');
}

// ── Skip context ──────────────────────────────────────────────────────────────
console.log('\nSkip context');
{ const { formFields } = scan(makeDoc([makeInput({ _skip: true, _label: 'Name' })]), helpers);
  assert('element in skip context not captured', formFields.length, 0); }

// ── Skip meta (csrf/recaptcha still skipped; captcha/otp are human gates) ──
console.log('\nSkip meta');
for (const kw of ['csrf', 'recaptcha']) {
  const { formFields } = scan(makeDoc([makeInput({ id: kw, _label: 'Field' })]), helpers);
  assert(`id="${kw}" skipped`, formFields.length, 0);
}
for (const kw of ['captcha', 'otp']) {
  const { formFields } = scan(makeDoc([makeInput({ id: kw, _label: 'Field' })]), helpers);
  assert(`id="${kw}" captured as humanGate`, formFields.length, 1);
  assert(`id="${kw}" humanGate type`, formFields[0].humanGate, kw);
  assert(`id="${kw}" fillMode skip`, formFields[0].fillMode, 'skip');
}
{
  const { formFields } = scan(makeDoc([makeInput({ id: 'mobileotp', type: 'text', _label: 'mobileotp' })]), helpers);
  assert('id=mobileotp captured', formFields.length, 1);
  assert('id=mobileotp humanGate otp', formFields[0].humanGate, 'otp');
  assert('id=mobileotp fillMode skip', formFields[0].fillMode, 'skip');
}
{
  const { formFields } = scan(makeDoc([makeInput({ id: 'filter', name: 'filter', _label: 'Filter' })]), helpers);
  assert('id="filter" skipped', formFields.length, 0);
}

// ── Not on screen ──────────────────────────────────────────────────────────────
console.log('\nNot on screen');
{
  const hidden = makeInput({ name: 'aadhaar', _label: 'Aadhaar' });
  const helpersHidden = Object.assign({}, helpers, {
    isVisuallyPresent: () => false,
  });
  const { formFields } = scan(makeDoc([hidden]), helpersHidden);
  assert('hidden aadhaar input is not captured', formFields.length, 0);
}
{
  const panchayat = Object.assign(makeInput({ tagName: 'SELECT', id: '56886', type: '', _label: 'Panchayat' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const helpersHiddenSel = Object.assign({}, helpers, { isVisuallyPresent: () => false });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [panchayat] : []; } };
  const { formFields } = scan(doc, helpersHiddenSel);
  assert('hidden panchayat select is captured', formFields.length, 1);
  assert('panchayat canonicalKey', formFields[0].canonicalKey, 'panchayat');
  assert('panchayat optionsDynamic', formFields[0].optionsDynamic, true);
}
{
  const label = { id: 'yes-label' };
  const hiddenBox = makeInput({ type: 'checkbox', id: 'yes', name: 'yes', _label: 'I agree to terms' });
  hiddenBox.ownerDocument = { querySelector(sel) { return sel === 'label[for="yes"]' ? label : null; } };
  const helpersHiddenBox = Object.assign({}, helpers, {
    isVisuallyPresent: (el) => el === label,
  });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [hiddenBox] : []; } };
  const { formFields } = scan(doc, helpersHiddenBox);
  assert('hidden checkbox kept when its label is visible', formFields.length, 1);
  assert('hidden checkbox is agreement', formFields[0].type, 'checkbox-agreement');
}

// ── Text input ────────────────────────────────────────────────────────────────
console.log('\nText input');
{ const { formFields, labelList } = scan(makeDoc([makeInput({ id: 'fname', _label: 'First Name' })]), helpers);
  assert('field captured', formFields.length, 1);
  assert('type=text', formFields[0].type, 'text');
  assert('selector=#fname', formFields[0].selector, '#fname');
  assert('numeric id gets [id=] selector', scan(makeDoc([makeInput({ id: '123', _label: 'X' })]), helpers).formFields[0].selector, '[id="123"]');
  assert('label in labelList', labelList.includes('firstname'), true); }

// ── No id, has name ───────────────────────────────────────────────────────────
{ const { formFields } = scan(makeDoc([makeInput({ name: 'city', _label: 'City' })]), helpers);
  assert('name-only selector=[name=city]', formFields[0].selector, '[name="city"]'); }

// ── Positional selector uses the document index ───────────────────────────────
console.log('\nPositional selector');
{
  const header = makeInput({ _skip: true, _label: 'From station' });
  const name = makeInput({ _label: 'Full Name as per Govt. ID' });
  const age = makeInput({ _label: 'Age' });
  const gender = Object.assign(makeInput({ tagName: 'SELECT', type: '', _label: 'Passenger Gender' }), {
    querySelectorAll: () => [{ textContent: 'FEMALE' }],
  });
  const { formFields } = scan(makeDoc([header, name, age, gender]), helpers);
  const byLabel = {};
  formFields.forEach((f) => { byLabel[f.label] = f.selector; });
  assert('skipped header is not field 0', byLabel['From station'], undefined);
  assert('name keeps document index 1', byLabel['Full Name as per Govt. ID'], 'form-field-1');
  assert('gender keeps document index 3', byLabel['Passenger Gender'], 'form-field-3');
}

// ── Page search box ───────────────────────────────────────────────────────────
console.log('\nPage search');
{
  const headerSearch = makeInput({ _skip: true, name: 'search_query', _label: 'Search' });
  const name = makeInput({ _label: 'Full Name as per Govt. ID' });
  const { formFields } = scan(makeDoc([headerSearch, name]), helpers);
  const byLabel = {};
  formFields.forEach((f) => { byLabel[f.label] = f; });
  assert('header search box is captured', byLabel.Search.selector, '[name="search_query"]');
  assert('header search type is search', byLabel.Search.type, 'search');
  assert('name index stays 1 beside a search box', byLabel['Full Name as per Govt. ID'].selector, 'form-field-1');
  assert('search box does not take form-field-0', formFields.some((f) => f.selector === 'form-field-0'), false);
}
{
  const box = makeInput({ type: 'search', id: 'site-search', _label: 'Search' });
  const { formFields } = scan(makeDoc([box]), helpers);
  assert('type=search captured', formFields.length, 1);
  assert('type=search selector=#site-search', formFields[0].selector, '#site-search');
  assert('type=search reported as search', formFields[0].type, 'search');
  assert('type=search fillMode skip', formFields[0].fillMode, 'skip');
}
{
  const poisoned = makeInput({ type: 'search', id: 'captcha', _label: 'Search' });
  const { formFields } = scan(makeDoc([poisoned]), helpers);
  assert('search box named captcha is a captcha gate', formFields.length, 1);
  assert('search captcha humanGate', formFields[0].humanGate, 'captcha');
}
{
  const box = makeInput({ type: 'search', _label: 'Search' });
  const doc = {
    querySelectorAll(sel) {
      if (String(sel).includes('input[type="search"]')) return [box];
      return [];
    },
  };
  const { formFields } = scan(doc, helpers);
  assert('unnamed search uses type selector', formFields[0].selector, 'input[type="search"]');
  assert('search fillMode skip', formFields[0].fillMode, 'skip');
}

// ── Select ────────────────────────────────────────────────────────────────────
console.log('\nSelect');
{
  const sel = Object.assign(makeInput({ tagName: 'SELECT', id: 'state', type: '', _label: 'State' }), {
    querySelectorAll: () => [
      { textContent: '-- Select --' }, { textContent: 'Delhi' }, { textContent: 'Mumbai' }
    ],
  });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [sel] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('select captured', formFields.length, 1);
  assert('type=dropdown', formFields[0].type, 'dropdown');
  assert('placeholder option filtered', JSON.stringify(formFields[0].options), JSON.stringify(['Delhi','Mumbai']));
  assert('select has locators', Array.isArray(formFields[0].locators) && formFields[0].locators.length > 0, true);
  assert('select canonicalKey=state', formFields[0].canonicalKey, 'state');
  assert('optionDetails has value+labels', formFields[0].optionDetails[0].labelEn, 'Delhi');
}

console.log('\nNumber input');
{
  const n = makeInput({ type: 'number', id: 'age', _label: 'Age' });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [n] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('number captured', formFields.length, 1);
  assert('type=number', formFields[0].type, 'number');
}

console.log('\nRange slider');
{
  const n = makeInput({ type: 'range', id: 'slider', min: '0', max: '100', value: '25', _label: 'Slider' });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [n] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('range captured', formFields.length, 1);
  assert('type=slider', formFields[0].type, 'slider');
  assert('slider selector=#slider', formFields[0].selector, '#slider');
}
{
  const n = makeInput({ type: 'range', min: '0', max: '100', value: '25', _label: 'Slider' });
  const doc = {
    querySelectorAll(s) {
      if (String(s).includes('input[type="range"]') || String(s).includes('input[type="text"]')) return [n];
      return [];
    },
  };
  const { formFields } = scan(doc, helpers);
  assert('unnamed range uses form-field index', formFields[0].selector, 'form-field-0');
}

// ── Radio grouping ────────────────────────────────────────────────────────────
console.log('\nRadio grouping');
{
  const r = (value, label) => Object.assign(makeInput({ type: 'radio', name: 'gender', value, _label: label }), { closest: () => null });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [r('male','Male'), r('female','Female')] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('two radios → one group', formFields.length, 1);
  assert('type=radio-group', formFields[0].type, 'radio-group');
  assert('options=[Male,Female]', JSON.stringify(formFields[0].options), JSON.stringify(['Male','Female']));
  assert('selector=[name=gender]', formFields[0].selector, '[name="gender"]');
}

// ── Agreement checkbox ────────────────────────────────────────────────────────
console.log('\nAgreement checkbox');
{
  const cb = makeInput({ type: 'checkbox', name: 'terms', value: '1', _label: 'I agree to terms' });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [cb] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('stays individual', formFields.length, 1);
  assert('type=checkbox-agreement', formFields[0].type, 'checkbox-agreement');
}

// ── Non-agreement checkbox grouping ──────────────────────────────────────────
console.log('\nCheckbox grouping');
{
  const c = (value, label) => makeInput({ type: 'checkbox', name: 'hobby', value, _label: label });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [c('reading','Reading'), c('sports','Sports')] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('two checkboxes → one group', formFields.length, 1);
  assert('type=checkbox-group', formFields[0].type, 'checkbox-group');
  assert('options=[Reading,Sports]', JSON.stringify(formFields[0].options), JSON.stringify(['Reading','Sports']));
}

// ── Contenteditable (iframe body) ────────────────────────────────────────────
console.log('\nContenteditable');
{
  const body = {
    tagName: 'BODY', type: '', id: 'tinymce', name: '', value: '', className: '',
    placeholder: '', _label: '', _skip: false, isContentEditable: true,
    innerText: 'hello', textContent: 'hello',
    getAttribute: (k) => k === 'contenteditable' ? 'true' : '',
    closest: () => null, querySelectorAll: () => [],
  };
  const doc = { querySelectorAll(s) { return s.includes('contenteditable') ? [body] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('contenteditable captured', formFields.length, 1);
  assert('type=contenteditable', formFields[0].type, 'contenteditable');
  assert('selector=#tinymce', formFields[0].selector, '#tinymce');
}

console.log('\nLocators, cascade, Hindi auto, rules');
{
  const name = makeInput({ id: '78250', _label: 'Name of Applicant', required: true, maxLength: 60 });
  const hindi = makeInput({ id: '17287', _label: 'आवेदक / आवेदिका का नाम' });
  const pin = makeInput({ id: 'pin', _label: 'PIN Code', maxLength: 6 });
  const { formFields } = scan(makeDoc([name, hindi, pin]), helpers);
  const byId = {};
  formFields.forEach((f) => { byId[f.id] = f; });
  assert('name fillMode fill', byId['78250'].fillMode, 'fill');
  assert('name locators include id', byId['78250'].locators.some((l) => l.type === 'id'), true);
  assert('name locators include xpath', byId['78250'].locators.some((l) => l.type === 'xpath' && l.value.includes('78250')), true);
  assert('name canonicalKey', byId['78250'].canonicalKey, 'name');
  assert('hindi fillMode auto', byId['17287'].fillMode, 'auto');
  assert('hindi transliterate', byId['17287'].transliterate, true);
  assert('hindi canonicalKey', byId['17287'].canonicalKey, 'name_hindi');
  assert('pin digits rule', byId.pin.rules && byId.pin.rules.digits, 6);
}
{
  const genderA = Object.assign(makeInput({ type: 'radio', name: '17290', value: 'M', _label: 'पुरुष / Male' }), { closest: () => null });
  const genderB = Object.assign(makeInput({ type: 'radio', name: '17290', value: 'F', _label: 'स्त्री / Female' }), { closest: () => null });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [genderA, genderB] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('gender canonicalKey', formFields[0].canonicalKey, 'gender');
  assert('gender optionDetails value', formFields[0].optionDetails[0].value, 'M');
}
{
  const block = Object.assign(makeInput({ tagName: 'SELECT', id: 'block', type: '', _label: 'Block' }), {
    querySelectorAll: () => [{ textContent: 'Mohra', value: '1' }],
  });
  const thana = Object.assign(makeInput({ tagName: 'SELECT', id: '65015', type: '', _label: 'थाना / Police Station' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const panchayat = Object.assign(makeInput({ tagName: 'SELECT', id: '56886', type: '', _label: 'Panchayat' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const office = Object.assign(makeInput({ tagName: 'SELECT', id: 'applLoc', type: '', _label: 'Apply to the Office' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [block, thana, panchayat, office] : []; } };
  const { formFields } = scan(doc, helpers);
  const byKey = {};
  formFields.forEach((f) => { byKey[f.canonicalKey] = f; });
  assert('thana is police_station not post_office', byKey.police_station && byKey.police_station.id, '65015');
  assert('thana optionsDynamic', byKey.police_station.optionsDynamic, true);
  assert('panchayat present', !!byKey.panchayat, true);
  assert('panchayat dependsOn', byKey.panchayat.dependsOn, 'address.block');
  assert('panchayat waitForOptions', byKey.panchayat.rules && byKey.panchayat.rules.waitForOptions, true);
  assert('office is dropdown', byKey.apply_to_office.type, 'dropdown');
  assert('office relationHint', byKey.apply_to_office.relationHint, 'per_application');
}
{
  const district = Object.assign(makeInput({ tagName: 'SELECT', id: '17297', type: '', _label: 'जिला / District *' }), {
    querySelectorAll: () => [{ textContent: 'GAYA/गया', value: '196' }],
  });
  const subDiv = Object.assign(makeInput({ tagName: 'SELECT', id: '17296', type: '', _label: 'अनुमंडल / Sub-Division *' }), {
    querySelectorAll: () => [{ textContent: 'GAYA SADAR/गया सदर', value: '17416' }, { textContent: 'TEKARI/टेकारी', value: '17419' }],
  });
  const thanaLoaded = Object.assign(makeInput({ tagName: 'SELECT', id: '65015', type: '', _label: 'थाना / Police Station *' }), {
    querySelectorAll: () => [{ textContent: 'Kotwali/कोतवाली', value: '1257021' }, { textContent: 'Civil lines/सिविल लाईन', value: '1257025' }],
  });
  const village = makeInput({ id: '17299', _label: 'ग्राम (Village) / मोहल्ला (Town) *' });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [district, subDiv, village, thanaLoaded] : []; } };
  const { formFields } = scan(doc, helpers);
  const byKey = {};
  formFields.forEach((f) => { byKey[f.canonicalKey] = f; });
  assert('loaded sub_division is still dynamic', byKey.sub_division.optionsDynamic, true);
  assert('sub_division dependsOn district', byKey.sub_division.dependsOn, 'address.district');
  assert('sub_division waitForOptions', byKey.sub_division.rules && byKey.sub_division.rules.waitForOptions, true);
  assert('loaded police_station is still dynamic', byKey.police_station.optionsDynamic, true);
  assert('police_station dependsOn district not village', byKey.police_station.dependsOn, 'address.district');
}
{
  const child = Object.assign(makeInput({ tagName: 'SELECT', id: 'board', type: '', _label: 'Exam Board' }), {
    querySelectorAll: () => [{ textContent: 'CBSE', value: '1' }, { textContent: 'BSEB', value: '2' }],
  });
  child['data-url'] = '/api/boards';
  const { formFields } = scan(makeDoc([child]), helpers);
  assert('data-url select is dynamic even with loaded options', formFields[0].optionsDynamic, true);
}
{
  const parent = Object.assign(makeInput({ tagName: 'SELECT', id: 'cat', type: '', _label: 'Category' }), {
    querySelectorAll: () => [{ textContent: 'A', value: 'a' }],
    getAttribute(k) { return k === 'onchange' ? 'loadSub("subcat")' : (this[k] != null && this[k] !== '' ? String(this[k]) : null); },
  });
  const child = Object.assign(makeInput({ tagName: 'SELECT', id: 'subcat', type: '', _label: 'Subcategory' }), {
    querySelectorAll: () => [{ textContent: 'A1', value: 'a1' }, { textContent: 'A2', value: 'a2' }],
  });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [parent, child] : []; } };
  const { formFields } = scan(doc, helpers);
  const byId = {};
  formFields.forEach((f) => { byId[f.id] = f; });
  assert('onchange-wired child is dynamic', byId.subcat.optionsDynamic, true);
  assert('onchange-wired child dependsOn parent', byId.subcat.dependsOn, '#cat');
}

console.log('\nReview #2 sections, fillMode, noise, human gates');
{
  const addrDist = Object.assign(makeInput({ tagName: 'SELECT', id: '11', type: '', _label: 'District' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const apply = Object.assign(makeInput({ tagName: 'SELECT', id: 'applLoc', type: '', _label: 'Apply to the Office' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const offState = Object.assign(makeInput({ tagName: 'SELECT', id: '40', type: '', _label: 'STATE' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const offDist = Object.assign(makeInput({ tagName: 'SELECT', id: '41', type: '', _label: 'DISTRICT' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const circle = Object.assign(makeInput({ tagName: 'SELECT', id: '42', type: '', _label: 'CIRCLE' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [addrDist, apply, offState, offDist, circle] : []; } };
  const { formFields } = scan(doc, helpers);
  const byCat = {};
  formFields.forEach((f) => { byCat[f.catalogKey || f.canonicalKey] = f; });
  assert('address.district catalogKey', !!byCat['address.district'], true);
  assert('office.district catalogKey', !!byCat['office.district'], true);
  assert('address and office district not the same field', byCat['address.district'].id !== byCat['office.district'].id, true);
  assert('circle canonicalKey', byCat['office.circle'] && byCat['office.circle'].canonicalKey, 'circle');
  assert('office.district dependsOn office.state', byCat['office.district'].dependsOn, 'office.state');
}
{
  const res = Object.assign(makeInput({ tagName: 'SELECT', id: '41566', type: '', _label: 'Residence Type' }), {
    querySelectorAll: () => [{ textContent: 'स्थायी', value: '1' }, { textContent: 'अस्थायी', value: '2' }],
  });
  const { formFields } = scan(makeDoc([res]), helpers);
  assert('residence_type fillMode fill', formFields[0].fillMode, 'fill');
  assert('residence_type canonicalKey', formFields[0].canonicalKey, 'residence_type');
}
{
  const decl = makeInput({ tagName: 'TEXTAREA', id: 'decl', type: 'textarea', _label: 'Self Declaration' });
  const { formFields } = scan(makeDoc([decl]), helpers);
  assert('self declaration fillMode skip', formFields[0].fillMode, 'skip');
}
{
  const photo = makeInput({ type: 'file', id: '90837', _label: 'Photo' });
  const { formFields } = scan(makeDoc([photo]), helpers);
  assert('photo humanGate upload', formFields[0].humanGate, 'upload');
  assert('photo fillMode skip', formFields[0].fillMode, 'skip');
}
{
  const purpose = makeInput({ id: 'purpose', _label: 'Purpose' });
  const { formFields } = scan(makeDoc([purpose]), helpers);
  assert('purpose relationHint', formFields[0].relationHint, 'per_application');
  assert('purpose needsReview', formFields[0].needsReview, true);
}
{
  const muni = Object.assign(makeInput({ tagName: 'SELECT', id: 'muni', type: '', _label: 'Municipality' }), {
    querySelectorAll: () => [{ textContent: 'Please Select', value: '' }],
  });
  const helpersHidden = Object.assign({}, helpers, { isVisuallyPresent: () => false });
  const { formFields } = scan(makeDoc([muni]), helpersHidden);
  assert('municipality kept when hidden', formFields.length, 1);
  assert('municipality showWhen', formFields[0].showWhen && formFields[0].showWhen.local_body_type, 'Municipality');
}
{
  const noise = Object.assign(makeInput({ tagName: 'SELECT', id: 'orig', type: '', _label: 'Original Code' }), {
    querySelectorAll: () => [{ textContent: 'A', value: '1' }],
  });
  const helpersHidden = Object.assign({}, helpers, { isVisuallyPresent: () => false });
  const { formFields } = scan(makeDoc([noise]), helpersHidden);
  assert('hidden Original Code dropped', formFields.length, 0);
}
{
  const nameless = makeInput({ type: 'file', id: '90867', _label: '90867' });
  const helpersHidden = Object.assign({}, helpers, { isVisuallyPresent: () => false });
  const { formFields } = scan(makeDoc([nameless]), helpersHidden);
  assert('hidden numeric file dropped', formFields.length, 0);
}

console.log('\nSSC/RRB canonical keys and label bleed');
assert('Full Name → name', guessCanonicalKey('Full Name', 'registration_fullname', 'registration_fullname', 'text', null), 'name');
assert('Re-type Full Name → name', guessCanonicalKey('Re-type Full Name', 'registration_retypefullname', 'registration_retypefullname', 'text', null), 'name');
assert('Candidate Name numbered → name', guessCanonicalKey('2. Candidate Name (As per Matriculation Certificate)', '', '', 'text', null), 'name');
assert('Father’s Name stays father', guessCanonicalKey('Father’s Name *', 'fatherFullName', 'fatherFullName', 'text', null), 'father_name');
assert('Gender ng-dropdown', guessCanonicalKey('4. Gender', '', 'ng-dd-10018', 'ng-dropdown', []), 'gender');
assert('Education board', guessCanonicalKey('8. Matriculation (10th class) Education Board', '', 'ng-dd-10022', 'ng-dropdown', []), 'board_10th');
assert('Year of Passing', guessCanonicalKey('10. Year of Passing', '', 'ng-dd-10024', 'ng-dropdown', []), 'year_of_passing');
assert('Highest qualification', guessCanonicalKey('11. Highest Level of Education Qualification', '', 'ng-dd-10026', 'ng-dropdown', []), 'highest_education_qualification');
assert('Date Of Birth → dob', guessCanonicalKey('Date Of Birth', 'effectiveDate', 'jquerryEffectiveDate', 'text', null, 'DD/MM/YYYY'), 'dob');
assert('dateBirth id → dob', guessCanonicalKey('Re-type Date Of Birth *', 'dateBirth', 'dateBirth', 'text', null, 'DD/MM/YYYY'), 'dob');
assert('Mobile Number → mobile', guessCanonicalKey('Mobile Number', '', 'registrationFormControlInput2', 'tel', null), 'mobile');
assert('type=tel with selector label → mobile', guessCanonicalKey('#registrationFormControlInput2', '', 'registrationFormControlInput2', 'tel', null), 'mobile');
assert('mobileotp is not mobile', guessCanonicalKey('mobileotp', 'mobileotp', 'mobileotp', 'text', null), null);
assert('aadhaar checkbox is not aadhaar_number', guessCanonicalKey('1.1. Enter Your Aadhaar Details (UID / VID)', 'agree', 'agree', 'checkbox', null), null);
{
  const dob = makeInput({
    id: 'dateBirth', name: 'dateBirth', _label: 'Country Of Nationality',
    placeholder: 'DD/MM/YYYY As recorded in Matriculation (10th class)  Certificate/MarkSheet',
  });
  const { formFields } = scan(makeDoc([dob]), helpers);
  assert('country heading on date widget relabeled', /date of birth/i.test(formFields[0].label), true);
  assert('country heading on date widget canonical dob', formFields[0].canonicalKey, 'dob');
}
{
  const father = makeInput({
    id: 'registration_confirmfathername', name: 'registration_confirmfathername',
    _label: 'Country Of Nationality',
    placeholder: "Re-type Father's Name As recorded in Matriculation (10th class)  Certificate/MarkSheet",
  });
  const { formFields } = scan(makeDoc([father]), helpers);
  assert('country heading on father retype uses placeholder', /father/i.test(formFields[0].label), true);
  assert('father retype canonical', formFields[0].canonicalKey, 'father_name');
}
{
  const full = makeInput({ id: 'registration_fullname', name: 'registration_fullname', _label: 'Full Name' });
  const { formFields } = scan(makeDoc([full]), helpers);
  assert('Full Name canonicalKey name', formFields[0].canonicalKey, 'name');
  assert('Full Name needsReview false', formFields[0].needsReview, false);
}
{
  const agree = makeInput({ type: 'checkbox', id: 'agree', name: '', _label: '1.1. Enter Your Aadhaar Details (UID / VID)' });
  const doc = { querySelectorAll(s) { return s.includes('input') ? [agree] : []; } };
  const { formFields } = scan(doc, helpers);
  assert('nameless #agree is agreement', formFields[0].type, 'checkbox-agreement');
  assert('nameless #agree not aadhaar', formFields[0].canonicalKey, null);
}
{
  const picker = makeInput({
    id: 'jquerryEffectiveDate', name: 'effectiveDate', _label: 'Date Of Birth',
    placeholder: 'DD/MM/YYYY', readOnly: true,
  });
  const { formFields } = scan(makeDoc([picker]), helpers);
  assert('readonly datepicker still fill', formFields[0].fillMode, 'fill');
  assert('readonly datepicker canonical dob', formFields[0].canonicalKey, 'dob');
}
{
  const legend = { textContent: 'Country Of Nationality' };
  const dob = makeInput({
    id: 'dateBirth', name: 'dateBirth', _label: 'Country Of Nationality',
    placeholder: 'DD/MM/YYYY As recorded in Matriculation (10th class)  Certificate/MarkSheet',
    closest: () => ({ querySelector: () => legend }),
  });
  const { formFields } = scan(makeDoc([dob]), helpers);
  assert('legend nearby is not kept as DOB label', /country of nationality/i.test(formFields[0].label), false);
  assert('retype date id becomes Date Of Birth', /date of birth/i.test(formFields[0].label), true);
}
{
  const yes = makeInput({ type: 'radio', id: 'changedName_yes', name: 'changedName', value: 'on', _label: 'Yes' });
  const no = makeInput({ type: 'radio', id: 'changedName_no', name: 'changedName', value: 'on', _label: 'No' });
  const { formFields } = scan(makeDoc([yes, no]), helpers);
  assert('changed-name radios captured', formFields.length, 1);
  assert('changed-name group not labeled Yes', /changed/i.test(formFields[0].label), true);
}
{
  const dot = makeInput({
    type: 'tel', id: 'otp_0_z75zljhfnrmvz9qqsk', _label: 'slide-dot-1',
  });
  const { formFields } = scan(makeDoc([dot]), helpers);
  assert('carousel slide-dot skipped', formFields.length, 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
