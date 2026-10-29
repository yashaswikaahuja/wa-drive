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
const { scan } = root.CcScanStandardFields;

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
  return Object.assign({
    type: 'text', id: '', name: '', value: '', className: '',
    placeholder: '', tagName: 'INPUT', _label: '', _skip: false,
    closest: () => null,
    querySelectorAll: () => [],
  }, props);
}

function makeDoc(elements) {
  return { querySelectorAll(sel) { return sel.includes('input[type="text"]') ? elements : []; } };
}

// ── Skip types ────────────────────────────────────────────────────────────────
console.log('\nSkip types');
for (const t of ['hidden','submit','button','search','password','image','reset']) {
  const { formFields } = scan(makeDoc([makeInput({ type: t })]), helpers);
  assert(`type="${t}" skipped`, formFields.length, 0);
}

// ── Skip context ──────────────────────────────────────────────────────────────
console.log('\nSkip context');
{ const { formFields } = scan(makeDoc([makeInput({ _skip: true, _label: 'Name' })]), helpers);
  assert('element in skip context not captured', formFields.length, 0); }

// ── Skip meta (search/captcha/otp) ────────────────────────────────────────────
console.log('\nSkip meta');
for (const kw of ['search', 'captcha', 'otp', 'csrf', 'recaptcha']) {
  const { formFields } = scan(makeDoc([makeInput({ id: kw, _label: 'Field' })]), helpers);
  assert(`id="${kw}" skipped`, formFields.length, 0);
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

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
