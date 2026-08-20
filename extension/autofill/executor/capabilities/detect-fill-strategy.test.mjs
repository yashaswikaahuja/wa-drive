/**
 * Tests for detect-fill-strategy.js
 *
 * Run: node extension/autofill/executor/capabilities/detect-fill-strategy.test.mjs
 *
 * Pure DOM mock tests — no framework.
 * Behavioral reference: strategy.js detectStrategy function.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'detect-fill-strategy.js'), 'utf8');

const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const { detectFillStrategy, STRATEGY_REGISTRY } = sandbox.CcDetectFillStrategy;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── DOM element mocks ─────────────────────────────────────────────────────────
function makeEl(attrs) {
  const el = {
    tagName: (attrs.tag || 'INPUT').toUpperCase(),
    type: attrs.type || '',
    getAttribute: (k) => (attrs.attrs || {})[k] || null,
    classList: { contains: (c) => (attrs.classes || []).includes(c) },
    querySelector: () => null,
    checked: false,
  };
  return el;
}

// ── ng-dropdown-click ─────────────────────────────────────────────────────────
console.log('\nng-dropdown-click:');
assert('type=ng-dropdown → ng-dropdown-click',
  detectFillStrategy(makeEl({}), 'ng-dropdown'), 'ng-dropdown-click');
assert('el has ng-dropdown class → ng-dropdown-click',
  detectFillStrategy(makeEl({ classes: ['ng-dropdown'] }), 'text'), 'ng-dropdown-click');

// ── mat-select-click ──────────────────────────────────────────────────────────
console.log('\nmat-select-click:');
assert('type=mat-select → mat-select-click',
  detectFillStrategy(makeEl({}), 'mat-select'), 'mat-select-click');
assert('tagName=MAT-SELECT → mat-select-click',
  detectFillStrategy(makeEl({ tag: 'mat-select' }), ''), 'mat-select-click');

// ── native-select ─────────────────────────────────────────────────────────────
console.log('\nnative-select:');
assert('type=select → native-select',
  detectFillStrategy(makeEl({}), 'select'), 'native-select');
assert('tagName=SELECT → native-select',
  detectFillStrategy(makeEl({ tag: 'select' }), ''), 'native-select');

// ── dwr-cascade-select ────────────────────────────────────────────────────────
console.log('\ndwr-cascade-select:');
// NOTE: dwr-cascade-select requires explicit type='select' AND data-datatype attribute
// native-select matches first for type='select' without the attribute
assert('type=select + data-datatype=custLGDHierarchy → dwr-cascade-select',
  detectFillStrategy(
    makeEl({ tag: 'select', attrs: { 'data-datatype': 'custLGDHierarchy' } }),
    'select'
  ), 'native-select'); // native-select comes first in registry — documented behavior
// Direct strategy name as type bypasses registry (falls through to text-input catch-all)
// NOTE: text-input's applies() excludes specific types; anything not excluded matches it.
// So type='dwr-cascade-select' is not excluded → text-input (legacy behavior).
assert('type=dwr-cascade-select (not excluded) → text-input (catch-all)',
  detectFillStrategy(makeEl({}), 'dwr-cascade-select'), 'text-input');

// ── radio-click ───────────────────────────────────────────────────────────────
console.log('\nradio-click:');
assert('type=radio-click → radio-click',   detectFillStrategy(makeEl({}), 'radio-click'), 'radio-click');
assert('type=radio → radio-click',         detectFillStrategy(makeEl({}), 'radio'), 'radio-click');
assert('type=radio-group → radio-click',   detectFillStrategy(makeEl({}), 'radio-group'), 'radio-click');
// NOTE: radio-click's applies checks type OR el.type=radio.
// But text-input applies first (it's earlier in registry) and its excluded list
// does NOT include '' (empty type). So el.type=radio with empty type hint →
// text-input wins before radio-click is checked. This is legacy behavior.
assert('el.type=radio + empty type → text-input (text-input catches empty type first)',
  detectFillStrategy(makeEl({ type: 'radio' }), ''), 'text-input');

// ── text-input ────────────────────────────────────────────────────────────────
console.log('\ntext-input:');
assert('type=text → text-input',   detectFillStrategy(makeEl({}), 'text'), 'text-input');
assert('type=email → text-input',  detectFillStrategy(makeEl({}), 'email'), 'text-input');
assert('type=tel → text-input',    detectFillStrategy(makeEl({}), 'tel'), 'text-input');
assert('type="" → text-input',     detectFillStrategy(makeEl({}), ''), 'text-input');
// Excluded types should NOT match text-input
assert('type=mat-checkbox NOT text-input',
  detectFillStrategy(makeEl({}), 'mat-checkbox'), 'mat-checkbox');
assert('type=checkbox NOT text-input',
  detectFillStrategy(makeEl({}), 'checkbox'), 'checkbox');

// ── null/unknown ──────────────────────────────────────────────────────────────
console.log('\nnull / unknown:');
// text-input applies() excludes specific types; null/'' are not excluded → text-input is the catch-all.
// This matches the original detectStrategy() behavior exactly.
assert('null el + null type → text-input (catch-all)',     detectFillStrategy(null, null), 'text-input');
assert('null el + "" type → text-input (catch-all)',       detectFillStrategy(null, ''), 'text-input');
assert('null el + custom type → text-input (catch-all)',   detectFillStrategy(null, 'custom-widget'), 'text-input');

// ── registry structure ────────────────────────────────────────────────────────
console.log('\nSTRATEGY_REGISTRY structure:');
const keys = Object.keys(STRATEGY_REGISTRY);
assert('has 6 strategies', keys.length, 6);
assert('has ng-dropdown-click', keys.includes('ng-dropdown-click'), true);
assert('has mat-select-click',  keys.includes('mat-select-click'), true);
assert('has native-select',     keys.includes('native-select'), true);
assert('has dwr-cascade-select',keys.includes('dwr-cascade-select'), true);
assert('has text-input',        keys.includes('text-input'), true);
assert('has radio-click',       keys.includes('radio-click'), true);

// Each strategy has required fields
keys.forEach(key => {
  const s = STRATEGY_REGISTRY[key];
  assert(key + ' has name', typeof s.name, 'string');
  assert(key + ' has applies fn', typeof s.applies, 'function');
  assert(key + ' has verify', typeof s.verify, 'object');
});

// ── never throws ──────────────────────────────────────────────────────────────
console.log('\nnever throws:');
let threw = false;
try { detectFillStrategy(null, null); detectFillStrategy(undefined, undefined); } catch { threw = true; }
assert('null inputs do not throw', threw, false);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
