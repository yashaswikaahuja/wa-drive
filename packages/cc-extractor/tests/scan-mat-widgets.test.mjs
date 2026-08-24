/**
 * scan-mat-widgets.test.mjs — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/scan-mat-widgets.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { scan } = root.CcScanMatWidgets;

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

let _attrs = {};
function makeEl(tagName, props) {
  _attrs = {};
  return Object.assign({
    tagName, id: '', name: '', value: '', _label: '', _skip: false,
    textContent: '',
    getAttribute: (a) => props[a] || null,
    setAttribute: (k, v) => { _attrs[k] = v; },
    closest: () => null,
  }, props);
}

function makeDoc(matSelects = [], matCheckboxes = [], matRadios = []) {
  return {
    querySelectorAll(sel) {
      if (sel.includes('mat-select')) return matSelects;
      if (sel.includes('mat-checkbox')) return matCheckboxes;
      if (sel.includes('mat-radio-button')) return matRadios;
      return [];
    }
  };
}

// ── mat-select ────────────────────────────────────────────────────────────────
console.log('\nmat-select');
{
  const el = makeEl('MAT-SELECT', { id: 'state', _label: 'State' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('captured', formFields.length, 1);
  assert('type=mat-select', formFields[0].type, 'mat-select');
  assert('selector=#state', formFields[0].selector, '#state');
}

// ── mat-select no id → gets data-cc-id ───────────────────────────────────────
{
  const el = makeEl('MAT-SELECT', { _label: 'City' });
  scan(makeDoc([el]), [], helpers, 10000);
  assert('data-cc-id assigned when no id', _attrs['data-cc-id'], 'mat-select-10000');
}

// ── mat-select skipped if in skip context ─────────────────────────────────────
{
  const el = makeEl('MAT-SELECT', { _label: 'State', _skip: true });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('skip context mat-select not captured', formFields.length, 0);
}

// ── SELECT inside mat-form-field already captured → skip ─────────────────────
{
  const el = makeEl('SELECT', { id: 'city', _label: 'City' });
  const existing = [{ selector: '#city' }];
  const { formFields } = scan(makeDoc([el]), existing, helpers, 10000);
  assert('already-captured select skipped', formFields.length, 0);
}

// ── mat-select no label → skip ────────────────────────────────────────────────
{
  const el = makeEl('MAT-SELECT', { _label: '' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('mat-select with no label skipped', formFields.length, 0);
}

// ── mat-checkbox ──────────────────────────────────────────────────────────────
console.log('\nmat-checkbox');
{
  const el = makeEl('MAT-CHECKBOX', { id: 'cb1', _label: 'Accept terms' });
  const { formFields } = scan(makeDoc([], [el]), [], helpers, 10000);
  assert('captured', formFields.length, 1);
  assert('type=mat-checkbox', formFields[0].type, 'mat-checkbox');
}

// ── mat-radio-button ──────────────────────────────────────────────────────────
console.log('\nmat-radio-button');
{
  const el = makeEl('MAT-RADIO-BUTTON', { id: 'rb1', textContent: 'Male' });
  const { formFields } = scan(makeDoc([], [], [el]), [], helpers, 10000);
  assert('captured', formFields.length, 1);
  assert('type=mat-radio', formFields[0].type, 'mat-radio');
  assert('value=label text', formFields[0].value, 'Male');
}

// ── index increments across types ────────────────────────────────────────────
console.log('\nIndex continuity');
{
  const ms = makeEl('MAT-SELECT', { id: 'ms1', _label: 'State' });
  const mc = makeEl('MAT-CHECKBOX', { id: 'mc1', _label: 'Terms' });
  const { formFields } = scan(makeDoc([ms], [mc]), [], helpers, 10000);
  assert('mat-select index=10000', formFields[0].index, 10000);
  assert('mat-checkbox index=10001', formFields[1].index, 10001);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
