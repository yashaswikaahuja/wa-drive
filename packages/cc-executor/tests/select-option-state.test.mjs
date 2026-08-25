/**
 * Tests for select-option-state.js
 *
 * Run: node extension/autofill/executor/capabilities/select-option-state.test.mjs
 *
 * Uses a minimal DOM mock — no jsdom, no test framework.
 * Tests are based on the existing behavior of select-helpers.js (behavioral reference).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/select-option-state.js'), 'utf8');

// Load the IIFE
const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const {
  isPlaceholderOption,
  realOptions,
  sampleOptions,
  readSelectActual,
  selectLoadMode,
  selectIsActive,
  isPlaceholderPlanned,
} = sandbox.CcSelectOptionState;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = actual === expected;
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}
function assertDeep(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── Minimal DOM helpers ───────────────────────────────────────────────────────
function makeOption(value, text) {
  return { value: value, text: text };
}
function makeSelect(options, selectedIndex, { disabled = false, offsetParent = {}, getClientRects } = {}) {
  const opts = options.map((o, i) => Object.assign({ index: i }, o));
  return {
    tagName: 'SELECT',
    options: opts,
    selectedIndex: selectedIndex != null ? selectedIndex : 0,
    disabled: disabled,
    offsetParent: offsetParent,
    getClientRects: getClientRects || (() => [{}]),
  };
}

// ── isPlaceholderOption ───────────────────────────────────────────────────────
console.log('\nisPlaceholderOption:');
assert('null → true',                    isPlaceholderOption(null), true);
assert('undefined → true',               isPlaceholderOption(undefined), true);
assert('empty value → true',             isPlaceholderOption(makeOption('', 'Select')), true);
assert('value "0" → true',               isPlaceholderOption(makeOption('0', 'Select State')), true);
assert('value "-1" → true',              isPlaceholderOption(makeOption('-1', 'Choose')), true);
assert('text "--" → true',               isPlaceholderOption(makeOption('1', '--')), true);
assert('text "select" → true',           isPlaceholderOption(makeOption('1', 'Select')), true);
assert('text "Select State" → true',     isPlaceholderOption(makeOption('1', 'Select State')), true);
assert('text "choose" → true',           isPlaceholderOption(makeOption('1', 'Choose District')), true);
assert('text "loading" → true',          isPlaceholderOption(makeOption('1', 'Loading...')), true);
assert('text "" → true',                 isPlaceholderOption(makeOption('1', '')), true);
assert('real option → false',            isPlaceholderOption(makeOption('JH', 'Jharkhand')), false);
assert('real option value "1" → false',  isPlaceholderOption(makeOption('1', 'Bihar')), false);
assert('real option text "Madhya Pradesh" → false', isPlaceholderOption(makeOption('MP', 'Madhya Pradesh')), false);

// ── realOptions ───────────────────────────────────────────────────────────────
console.log('\nrealOptions:');
const sel1 = makeSelect([
  makeOption('', 'Select State'),
  makeOption('JH', 'Jharkhand'),
  makeOption('BR', 'Bihar'),
]);
assert('null → []',             realOptions(null).length, 0);
assert('undefined → []',        realOptions(undefined).length, 0);
assert('no options → []',       realOptions({ options: null }).length, 0);
assert('returns real options',  realOptions(sel1).length, 2);
assert('first real option',     realOptions(sel1)[0].value, 'JH');

const selAllPlaceholder = makeSelect([
  makeOption('', 'Select District'),
  makeOption('0', '-- Choose --'),
]);
assert('all placeholders → []', realOptions(selAllPlaceholder).length, 0);

// ── sampleOptions ─────────────────────────────────────────────────────────────
console.log('\nsampleOptions:');
assert('null → []',            sampleOptions(null).length, 0);
assert('default n=8',          sampleOptions(sel1).length, 2); // only 2 real options
const bigSel = makeSelect([
  makeOption('', 'Select'),
  ...Array.from({length: 12}, (_, i) => makeOption(String(i+1), 'Option ' + (i+1))),
]);
assert('default n=8 caps at 8', sampleOptions(bigSel).length, 8);
assert('n=3 caps at 3',         sampleOptions(bigSel, 3).length, 3);
const sample = sampleOptions(sel1);
assertDeep('sample format', sample[0], { value: 'JH', text: 'Jharkhand' });

// Value/text truncation
const longSel = makeSelect([
  makeOption('a'.repeat(50), 'b'.repeat(70)),
]);
assert('value truncated to 40', sampleOptions(longSel)[0].value.length, 40);
assert('text truncated to 60',  sampleOptions(longSel)[0].text.length, 60);

// ── readSelectActual ──────────────────────────────────────────────────────────
console.log('\nreadSelectActual:');
assertDeep('null → {null,null}',       readSelectActual(null), { actualValue: null, actualOptionValue: null });
assertDeep('non-SELECT → {null,null}', readSelectActual({ tagName: 'INPUT' }), { actualValue: null, actualOptionValue: null });

// Placeholder selected
const selPlaceholderSelected = makeSelect([
  makeOption('', 'Select State'),
  makeOption('JH', 'Jharkhand'),
], 0);
assertDeep('placeholder selected → {actualValue:"", actualOptionValue:""}',
  readSelectActual(selPlaceholderSelected), { actualValue: '', actualOptionValue: '' });

// Real option selected
const selRealSelected = makeSelect([
  makeOption('', 'Select State'),
  makeOption('JH', 'Jharkhand'),
], 1);
assertDeep('real option selected',
  readSelectActual(selRealSelected), { actualValue: 'Jharkhand', actualOptionValue: 'JH' });

// selectedIndex out of range
const selNoSelection = makeSelect([makeOption('JH', 'Jharkhand')], -1);
selNoSelection.options[-1] = undefined; // simulate no selection
assertDeep('no selection → {actualValue:"", actualOptionValue:""}',
  readSelectActual(selNoSelection), { actualValue: '', actualOptionValue: '' });

// actualValue trims whitespace
const selWithSpaces = makeSelect([makeOption('JH', '  Jharkhand  ')], 0);
assert('actualValue trimmed', readSelectActual(selWithSpaces).actualValue, 'Jharkhand');

// ── selectLoadMode ────────────────────────────────────────────────────────────
console.log('\nselectLoadMode:');
assert('null → "unknown"',        selectLoadMode(null), 'unknown');
assert('INPUT → "unknown"',       selectLoadMode({ tagName: 'INPUT' }), 'unknown');
assert('empty select → "ajax"',   selectLoadMode(makeSelect([makeOption('', 'Select')])), 'ajax');
assert('all placeholders → "ajax"', selectLoadMode(selAllPlaceholder), 'ajax');
assert('has real options → "static"', selectLoadMode(sel1), 'static');

// ── selectIsActive ────────────────────────────────────────────────────────────
console.log('\nselectIsActive:');
assert('null → false', selectIsActive(null), false);
assert('disabled → false', selectIsActive(makeSelect([], 0, { disabled: true })), false);
assert('visible (offsetParent not null) → true',
  selectIsActive(makeSelect([], 0, { offsetParent: {} })), true);
// offsetParent null + no rects → false
assert('offsetParent null + empty rects → false',
  selectIsActive(makeSelect([], 0, { offsetParent: null, getClientRects: () => [] })), false);
// offsetParent null but has rects → true (some frameworks detach but element is visible)
assert('offsetParent null + has rects → true',
  selectIsActive(makeSelect([], 0, { offsetParent: null, getClientRects: () => [{}] })), true);
// getClientRects throws → treated as active (ignore)
assert('getClientRects throws → true (ignore)',
  selectIsActive(makeSelect([], 0, { offsetParent: null, getClientRects: () => { throw new Error('err'); } })), true);

// ── isPlaceholderPlanned ──────────────────────────────────────────────────────
console.log('\nisPlaceholderPlanned:');
assert('null → true',             isPlaceholderPlanned(null), true);
assert('undefined → true',        isPlaceholderPlanned(undefined), true);
assert('"" → true',               isPlaceholderPlanned(''), true);
assert('"--" → true',             isPlaceholderPlanned('--'), true);
assert('"0" → true',              isPlaceholderPlanned('0'), true);
assert('"select" → true',         isPlaceholderPlanned('select'), true);
assert('"Select" (case) → true',  isPlaceholderPlanned('Select'), true);
assert('"select state" → true',   isPlaceholderPlanned('select state'), true);
assert('"Select District" → true',isPlaceholderPlanned('Select District'), true);
assert('"please select" → true',  isPlaceholderPlanned('please select'), true);
assert('"Please Select Option" → true', isPlaceholderPlanned('Please Select Option'), true);
assert('"Jharkhand" → false',     isPlaceholderPlanned('Jharkhand'), false);
assert('"Bihar" → false',         isPlaceholderPlanned('Bihar'), false);
assert('"1" → false',             isPlaceholderPlanned('1'), false);
assert('"JH" → false',            isPlaceholderPlanned('JH'), false);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
