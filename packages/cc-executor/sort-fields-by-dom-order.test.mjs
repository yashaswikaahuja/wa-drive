/**
 * Tests for sort-fields-by-dom-order.js
 *
 * Run: node extension/autofill/executor/capabilities/sort-fields-by-dom-order.test.mjs
 *
 * Uses a minimal DOM mock — no jsdom, no framework.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'src/sort-fields-by-dom-order.js'), 'utf8');

const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const { sortFieldsByDomOrder } = sandbox.CcSortFieldsByDomOrder;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── DOM mock helpers ──────────────────────────────────────────────────────────
// compareDocumentPosition(other): returns DOCUMENT_POSITION_FOLLOWING (4)
// if `other` comes after `this` in the document.
function makeEl(index) {
  return {
    _index: index,
    compareDocumentPosition: function (other) {
      // DOCUMENT_POSITION_FOLLOWING = 4 means `other` follows `this`
      return other._index > this._index ? 4 : 2;
    },
  };
}

// Map from selector string to element
function makeResolver(map) {
  return function (sel) { return map[sel] || null; };
}

// ── Sorting tests ─────────────────────────────────────────────────────────────
console.log('\nBasic DOM order sorting:');

const elA = makeEl(0); // first in DOM
const elB = makeEl(1); // second
const elC = makeEl(2); // third

const resolverABC = makeResolver({ '#a': elA, '#b': elB, '#c': elC });

// Already in order — should stay same
const entries1 = [['#a', {}], ['#b', {}], ['#c', {}]];
sortFieldsByDomOrder(entries1, resolverABC);
assert('already in order stays same', entries1.map(e => e[0]), ['#a', '#b', '#c']);

// Reverse order — should be sorted
const entries2 = [['#c', {}], ['#b', {}], ['#a', {}]];
sortFieldsByDomOrder(entries2, resolverABC);
assert('reverse order gets sorted', entries2.map(e => e[0]), ['#a', '#b', '#c']);

// Mixed order
const entries3 = [['#b', {}], ['#a', {}], ['#c', {}]];
sortFieldsByDomOrder(entries3, resolverABC);
assert('mixed order sorted correctly', entries3.map(e => e[0]), ['#a', '#b', '#c']);

console.log('\nNull elements:');

// One element missing — preserved relative order
const resolverWithNull = makeResolver({ '#a': elA, '#c': elC });
const entries4 = [['#a', {}], ['#missing', {}], ['#c', {}]];
sortFieldsByDomOrder(entries4, resolverWithNull);
// #missing resolves to null, preserved with stable sort behavior
// #a and #c should be sorted, #missing position is stable
assert('present elements sorted, missing preserved',
  entries4.filter(e => e[0] !== '#missing').map(e => e[0]), ['#a', '#c']);

// Both missing — preserved order
const resolverNone = makeResolver({});
const entries5 = [['#x', {}], ['#y', {}]];
sortFieldsByDomOrder(entries5, resolverNone);
assert('both null — order preserved', entries5.map(e => e[0]), ['#x', '#y']);

// Same element for both selectors
const resolverSame = makeResolver({ '#a': elA, '#alias': elA });
const entries6 = [['#a', {}], ['#alias', {}]];
sortFieldsByDomOrder(entries6, resolverSame);
assert('same element — order preserved', entries6.map(e => e[0]), ['#a', '#alias']);

console.log('\nEdge cases:');

// Empty array
const entries7 = [];
sortFieldsByDomOrder(entries7, resolverABC);
assert('empty array → []', entries7, []);

// Single entry
const entries8 = [['#a', {}]];
sortFieldsByDomOrder(entries8, resolverABC);
assert('single entry unchanged', entries8.map(e => e[0]), ['#a']);

// compareDocumentPosition not available on first element of a pair:
// The guard `typeof a.compareDocumentPosition !== 'function'` returns 0,
// preserving order. When the element with compareDocumentPosition is `a` and
// the one without is `b`, the behavior depends on what a.compareDocumentPosition(b)
// returns — this is a browser/DOM implementation detail, not something we control.
// In practice, all form elements in a real browser have compareDocumentPosition.
// Test: both elements lack it → order preserved.
const resolverNoCompare2 = makeResolver({ '#x': { _index: 1 }, '#y': { _index: 0 } });
const entries9 = [['#x', {}], ['#y', {}]];
sortFieldsByDomOrder(entries9, resolverNoCompare2);
assert('both elements lack compareDocumentPosition → order preserved', entries9.map(e => e[0]), ['#x', '#y']);

console.log('\nReturn value:');
const entries10 = [['#b', {}], ['#a', {}]];
const returned = sortFieldsByDomOrder(entries10, resolverABC);
assert('returns same array reference', returned === entries10, true);
assert('returned array is sorted', returned.map(e => e[0]), ['#a', '#b']);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
