/**
 * scan-custom-choice.test.ts — DemoQA tree / custom radio widgets (#349)
 *
 * Run: node --experimental-strip-types packages/cc-extractor/tests/scan-custom-choice.test.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(path.join(__dirname, '../src/scan-custom-choice.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const root = {};
new Function('globalThis', src)(root);
const { scan } = root.CcScanCustomChoice;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

const helpers = {
  isInSkipContext: (el) => !!el._skip,
  getLabel: (el) => el._label || '',
  isGoodLabel: (s) => !!(s && s.trim().length >= 2 && /[a-z0-9]/i.test(s)),
};

function makeEl(props) {
  const el = Object.assign({
    tagName: 'LABEL',
    id: '',
    className: '',
    textContent: '',
    _label: '',
    _skip: false,
    getAttribute: (a) => {
      if (a === 'for') return el.htmlFor || null;
      if (a === 'role') return el.role || null;
      if (a === 'aria-label') return el._label || null;
      return props[a] !== undefined ? props[a] : null;
    },
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    classList: { contains: (c) => String(el.className).split(/\s+/).indexOf(c) !== -1 },
    parentElement: null,
  }, props);
  if (!el.classList) {
    el.classList = { contains: (c) => String(el.className).split(/\s+/).indexOf(c) !== -1 };
  }
  return el;
}

function makeDoc(nodes) {
  return {
    querySelectorAll(sel) {
      const parts = String(sel).split(',').map((s) => s.trim());
      return nodes.filter((el) => {
        if (el._skipQuery) return false;
        if (parts.includes('[role="checkbox"]') && el.role === 'checkbox') return true;
        if (parts.includes('[role="radio"]') && el.role === 'radio') return true;
        if (parts.includes('.rct-checkbox') && /\brct-checkbox\b/.test(el.className)) return true;
        if (parts.includes('.rct-title') && /\brct-title\b/.test(el.className)) return true;
        if (parts.includes('label.custom-control-label') && el.tagName === 'LABEL' && /\bcustom-control-label\b/.test(el.className)) return true;
        if (parts.includes('label.form-check-label') && el.tagName === 'LABEL' && /\bform-check-label\b/.test(el.className)) return true;
        return false;
      });
    },
  };
}

console.log('\ncustom-control radio');
{
  const el = makeEl({
    tagName: 'LABEL',
    className: 'custom-control-label',
    htmlFor: 'yesradio',
    _label: 'Yes',
    textContent: 'Yes',
  });
  el.parentElement = { querySelector: () => ({ type: 'radio' }) };
  const { formFields } = scan(makeDoc([el]), [], helpers, 20000);
  assert('radio captured', formFields.length, 1);
  assert('type=radio', formFields[0].type, 'radio');
  assert('label Yes', formFields[0].label, 'Yes');
  assert('selector from for', formFields[0].selector, 'label[for="yesradio"]');
}

console.log('\nDemoQA tree checkbox');
{
  const title = makeEl({
    tagName: 'SPAN',
    className: 'rct-title',
    textContent: 'Desktop',
    _label: '',
  });
  const host = makeEl({
    tagName: 'LABEL',
    className: 'rct-text',
    textContent: 'Desktop',
    _label: 'Desktop',
  });
  title.closest = (sel) => (sel === 'label' ? host : null);
  const { formFields } = scan(makeDoc([title]), [], helpers, 20000);
  assert('tree title captured', formFields.length, 1);
  assert('type=checkbox', formFields[0].type, 'checkbox');
  assert('label Desktop', formFields[0].label, 'Desktop');
}

console.log('\ndedupe vs existing fields');
{
  const el = makeEl({
    tagName: 'LABEL',
    className: 'custom-control-label',
    id: 'male',
    htmlFor: 'gender-male',
    _label: 'Male',
    textContent: 'Male',
  });
  el.matches = (sel) => sel === '#male';
  const existing = [{ selector: '#male', _el: el }];
  const { formFields } = scan(makeDoc([el]), existing, helpers, 20000);
  assert('already listed skipped', formFields.length, 0);
}

console.log('\nnav chrome skipped');
{
  const el = makeEl({
    tagName: 'LABEL',
    className: 'custom-control-label',
    _label: 'Menu',
    textContent: 'Menu',
    _skip: true,
  });
  const { formFields } = scan(makeDoc([el]), [], helpers, 20000);
  assert('skip context not captured', formFields.length, 0);
}

console.log('\nrole=checkbox');
{
  const el = makeEl({
    tagName: 'DIV',
    role: 'checkbox',
    _label: 'Notes',
    textContent: 'Notes',
  });
  const { formFields } = scan(makeDoc([el]), [], helpers, 20000);
  assert('role checkbox captured', formFields.length, 1);
  assert('role type=checkbox', formFields[0].type, 'checkbox');
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
