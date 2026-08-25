/**
 * scan-ng-dropdowns.test.mjs — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/scan-ng-dropdowns.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { scan } = root.CcScanNgDropdowns;

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
function makeEl(props) {
  _attrs = {};
  return Object.assign({
    tagName: 'DIV', id: '', className: '', _label: '', _skip: false,
    textContent: '',
    getAttribute: (a) => props[a] !== undefined ? props[a] : null,
    setAttribute: (k, v) => { _attrs[k] = v; },
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    classList: { contains: () => false },
    parentElement: null,
  }, props);
}

function makeDoc(comboboxEls = [], containerEls = [], triggerEls = []) {
  return {
    body: {},
    querySelectorAll(sel) {
      if (sel.includes('role="combobox"')) return comboboxEls;
      if (sel.includes('ng-select')) return containerEls;
      if (sel.includes('value-area')) return triggerEls;
      return [];
    }
  };
}

// ── role=combobox captured ────────────────────────────────────────────────────
console.log('\nrole=combobox');
{
  const el = makeEl({ id: 'state', _label: 'State', role: 'combobox' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('captured', formFields.length, 1);
  assert('type=mat-select (non-ng)', formFields[0].type, 'mat-select');
  assert('selector=#state', formFields[0].selector, '#state');
}

// ── INPUT/SELECT with role=combobox skipped ───────────────────────────────────
{
  const el = makeEl({ tagName: 'INPUT', _label: 'Search', role: 'combobox' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('INPUT with role=combobox skipped', formFields.length, 0);
}

// ── Search meta skipped ───────────────────────────────────────────────────────
{
  const el = makeEl({ id: 'search-field', _label: 'Find', className: 'search' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('search className skipped', formFields.length, 0);
}

// ── ng-select tag → type=ng-dropdown ─────────────────────────────────────────
{
  const el = makeEl({ tagName: 'NG-SELECT', _label: 'Category' });
  const { formFields } = scan(makeDoc([el]), [], helpers, 10000);
  assert('ng-select tag → ng-dropdown', formFields[0].type, 'ng-dropdown');
}

// ── no id → data-cc-id assigned ──────────────────────────────────────────────
{
  const el = makeEl({ _label: 'District' });
  scan(makeDoc([el]), [], helpers, 10000);
  assert('data-cc-id assigned', _attrs['data-cc-id'], 'combobox-10000');
}

// ── ng container captured ─────────────────────────────────────────────────────
console.log('\nng-select containers');
{
  const el = makeEl({ _label: 'Gender', className: 'ng-select' });
  const { formFields } = scan(makeDoc([], [el]), [], helpers, 10000);
  assert('ng container captured', formFields.length, 1);
  assert('type=ng-dropdown', formFields[0].type, 'ng-dropdown');
  assert('selector uses ng-dd-N', formFields[0].selector, '[data-cc-id="ng-dd-10000"]');
}

// ── already captured element skipped ─────────────────────────────────────────
{
  const el = makeEl({ _label: 'State', className: 'ng-select' });
  el.matches = (sel) => sel === '[data-cc-id="ng-dd-existing"]';
  const existing = [{ selector: '[data-cc-id="ng-dd-existing"]' }];
  const { formFields } = scan(makeDoc([], [el]), existing, helpers, 10000);
  assert('already-captured skipped', formFields.length, 0);
}

// ── skip context ──────────────────────────────────────────────────────────────
{
  const el = makeEl({ _label: 'Nav Dropdown', className: 'ng-select', _skip: true });
  const { formFields } = scan(makeDoc([], [el]), [], helpers, 10000);
  assert('skip context not captured', formFields.length, 0);
}

// ── label in labelList ────────────────────────────────────────────────────────
{
  const el = makeEl({ _label: 'State', className: 'ng-select' });
  const { labelList } = scan(makeDoc([], [el]), [], helpers, 10000);
  assert('label added to labelList', labelList.includes('state'), true);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
