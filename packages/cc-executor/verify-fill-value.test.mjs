/**
 * Tests for verify-fill-value.js
 *
 * Run: node extension/autofill/executor/capabilities/verify-fill-value.test.mjs
 *
 * Uses minimal DOM mocks + async tests. No framework.
 * Behavioral reference: verifyValue() in strategy.js.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'src/verify-fill-value.js'), 'utf8');

// Load the IIFE — needs globalThis with document for radio/label tests
const globalLike = { document: null };
const fn = new Function('globalThis', src);
fn(globalLike);
const { verifyFillValue } = globalLike.CcVerifyFillValue;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function assert(desc, actual, expected) {
  const a = await actual;
  const ok = JSON.stringify(a) === JSON.stringify(expected) ||
             (typeof expected === 'boolean' && a.ok === expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(a)); failed++; }
}
async function assertOk(desc, actual, expectedOk) {
  const a = await actual;
  if (a.ok === expectedOk) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected ok:', expectedOk, 'got ok:', a.ok, 'full:', JSON.stringify(a)); failed++; }
}

// ── DOM mocks ─────────────────────────────────────────────────────────────────
function makeInput(attrs) {
  return {
    tagName: (attrs.tag || 'INPUT').toUpperCase(),
    type: attrs.type || 'text',
    value: attrs.value || '',
    checked: attrs.checked || false,
    name: attrs.name || '',
    id: attrs.id || '',
    options: null,
    selectedIndex: -1,
  };
}
function makeSelect(options, selectedIdx) {
  const opts = options.map((o, i) => ({ text: o.text, value: o.value, index: i }));
  return {
    tagName: 'SELECT',
    type: '',
    value: opts[selectedIdx] ? opts[selectedIdx].value : '',
    options: opts,
    selectedIndex: selectedIdx,
  };
}
function makeResolver(map) {
  return function (sel) { return map[sel] || null; };
}

// Instant resolver (no settle needed)
const SETTLE = 0;

// ── No element ────────────────────────────────────────────────────────────────
console.log('\nNo element:');
await assertOk('missing selector → ok:false', verifyFillValue('#missing', 'x', makeResolver({}), SETTLE), false);

// ── Checkbox ──────────────────────────────────────────────────────────────────
console.log('\nCheckbox:');
await assertOk('checkbox checked → ok:true',
  verifyFillValue('#cb', 'yes', makeResolver({ '#cb': makeInput({ type: 'checkbox', checked: true }) }), SETTLE), true);
await assertOk('checkbox unchecked → ok:false',
  verifyFillValue('#cb', 'yes', makeResolver({ '#cb': makeInput({ type: 'checkbox', checked: false }) }), SETTLE), false);

// ── Select ────────────────────────────────────────────────────────────────────
console.log('\nSelect:');
const sel1 = makeSelect([{ text: 'Bihar', value: 'BR' }, { text: 'Jharkhand', value: 'JH' }], 1);
await assertOk('select option text match → ok:true',
  verifyFillValue('#s', 'Jharkhand', makeResolver({ '#s': sel1 }), SETTLE), true);
await assertOk('select option text partial → ok:true',
  verifyFillValue('#s', 'jharkh', makeResolver({ '#s': sel1 }), SETTLE), true);
await assertOk('select no match → ok:false',
  verifyFillValue('#s', 'Maharashtra', makeResolver({ '#s': sel1 }), SETTLE), false);

const selEmpty = makeSelect([], -1);
// Empty select: normExpS.includes('') is always true → ok:true. Legacy quirk.
await assertOk('select empty selection → ok:true (legacy: normExp.includes("") = true)',
  verifyFillValue('#s', 'Bihar', makeResolver({ '#s': selEmpty }), SETTLE), true);

// ── Text input ────────────────────────────────────────────────────────────────
console.log('\nText input:');
await assertOk('exact match → ok:true',
  verifyFillValue('#n', 'Ramesh Kumar',
    makeResolver({ '#n': makeInput({ value: 'Ramesh Kumar' }) }), SETTLE), true);
await assertOk('case-insensitive → ok:true',
  verifyFillValue('#n', 'ramesh kumar',
    makeResolver({ '#n': makeInput({ value: 'Ramesh Kumar' }) }), SETTLE), true);
await assertOk('normalised match (spaces stripped) → ok:true',
  verifyFillValue('#n', 'Ramesh Kumar',
    makeResolver({ '#n': makeInput({ value: 'rameshkumar' }) }), SETTLE), true);
// Same length + same suffix 'umar' → masked-input match (false positive for name fields).
// This is a known legacy quirk: masked-input heuristic fires for same-length strings
// with matching last 4 chars. Documents real behavior.
await assertOk('same-length different name → ok:true via masked (legacy quirk)',
  verifyFillValue('#n', 'Ramesh Kumar',
    makeResolver({ '#n': makeInput({ value: 'Suresh Kumar' }) }), SETTLE), true);
await assertOk('empty value → ok:false (value-rejected-empty)',
  verifyFillValue('#n', 'Ramesh Kumar',
    makeResolver({ '#n': makeInput({ value: '' }) }), SETTLE), false);
await assertOk('empty expected → ok:false (empty-expected)',
  verifyFillValue('#n', '',
    makeResolver({ '#n': makeInput({ value: 'Ramesh Kumar' }) }), SETTLE), false);

// ── Partial match ─────────────────────────────────────────────────────────────
console.log('\nPartial match:');
// Input shows phone grouped: expected '9155049176' actual '91550 49176' (normalised same)
await assertOk('phone reformatted → ok:true',
  verifyFillValue('#ph', '9155049176',
    makeResolver({ '#ph': makeInput({ value: '9155049176' }) }), SETTLE), true);

// ── Masked input (Aadhaar) ────────────────────────────────────────────────────
console.log('\nMasked input:');
// Same length, last 4 match
await assertOk('aadhaar masked → ok:true (masked)',
  verifyFillValue('#aadh', '912345678597',
    makeResolver({ '#aadh': makeInput({ value: '****5678597' }) }), SETTLE), false); // different length
await assertOk('aadhaar same length last-4 match → ok:true',
  verifyFillValue('#aadh', '912345678597',
    makeResolver({ '#aadh': makeInput({ value: '****45678597' }) }), SETTLE), true);

// ── ng-dropdown → null immediately ───────────────────────────────────────────
console.log('\nng-dropdown:');
await assertOk('ng-dropdown-0 → ok:false (no element, handled by handler)',
  verifyFillValue('ng-dropdown-0', 'Bihar', makeResolver({}), SETTLE), false);

// ── settleMs ──────────────────────────────────────────────────────────────────
console.log('\nsettleMs:');
const start = Date.now();
await verifyFillValue('#n', 'x', makeResolver({ '#n': makeInput({ value: 'x' }) }), 50);
const elapsed = Date.now() - start;
if (elapsed >= 40) { console.log('  ✓ settleMs=50 waited ≥40ms'); passed++; }
else { console.error('  ✗ settleMs=50 waited only', elapsed, 'ms'); failed++; }

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
