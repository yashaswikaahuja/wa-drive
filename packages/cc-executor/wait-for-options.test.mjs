/**
 * Tests for wait-for-options.js
 *
 * Run: node extension/autofill/executor/capabilities/wait-for-options.test.mjs
 *
 * No jsdom. Uses minimal mocks for querySelector and MutationObserver.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'src/wait-for-options.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const { waitForOptions } = globalLike.CcWaitForOptions;

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}

// ── Minimal mocks ─────────────────────────────────────────────────────────────
function makeSelect(values) {
  return {
    tagName: 'SELECT',
    options: values.map(v => ({ value: v, text: v })),
  };
}

function makeQs(elOrNull) {
  return () => elOrNull;
}

// Null observeTarget disables MutationObserver (no browser body needed)
const NO_OBSERVE = null;

// ── Already has options — resolves immediately ────────────────────────────────
console.log('\nImmediate resolve:');
{
  const el = makeSelect(['', 'Bihar', 'Jharkhand']);
  const result = await waitForOptions('#s', 1, 500, makeQs(el), NO_OBSERVE);
  ok('resolves with element when options present', result === el);
}

// ── Placeholder-only options — does not count ────────────────────────────────
{
  // '0' and '' are filtered out — only real options count
  const el = makeSelect(['', '0', '-1']);
  const result = await waitForOptions('#s', 1, 100, makeQs(el), NO_OBSERVE);
  ok('placeholder-only options → resolves null on timeout', result === null);
}

// ── No element → null on timeout ─────────────────────────────────────────────
{
  const result = await waitForOptions('#missing', 1, 100, makeQs(null), NO_OBSERVE);
  ok('missing element → null', result === null);
}

// ── minCount=2: needs 2 real options ─────────────────────────────────────────
console.log('\nminCount:');
{
  const el = makeSelect(['', 'Bihar']);  // 1 real option
  const result = await waitForOptions('#s', 2, 100, makeQs(el), NO_OBSERVE);
  ok('minCount=2 with 1 real option → null', result === null);
}
{
  const el = makeSelect(['', 'Bihar', 'Jharkhand']); // 2 real options
  const result = await waitForOptions('#s', 2, 500, makeQs(el), NO_OBSERVE);
  ok('minCount=2 with 2 real options → element', result === el);
}

// ── Real option filter ────────────────────────────────────────────────────────
console.log('\nReal option filter:');
{
  const el = makeSelect(['0', '', '-1', 'Bihar']);
  const result = await waitForOptions('#s', 1, 500, makeQs(el), NO_OBSERVE);
  ok('"0", "", "-1" filtered out; "Bihar" counts', result === el);
}

// ── Default timeout (polls until options arrive) ──────────────────────────────
console.log('\nPolling:');
{
  // Options arrive after 250ms (simulated by switching qs)
  let callCount = 0;
  const emptyEl = makeSelect([]);
  const fullEl  = makeSelect(['Bihar']);
  const qs = () => {
    callCount++;
    return callCount >= 3 ? fullEl : emptyEl; // arrives on 3rd poll
  };
  const result = await waitForOptions('#s', 1, 1000, qs, NO_OBSERVE);
  ok('resolves when options arrive on later poll', result === fullEl);
  ok('qs was called multiple times', callCount >= 3);
}

// ── Timeout elapsed → null ────────────────────────────────────────────────────
{
  const start = Date.now();
  const result = await waitForOptions('#s', 1, 150, makeQs(null), NO_OBSERVE);
  const elapsed = Date.now() - start;
  ok('returns null after timeout', result === null);
  ok('waited approximately the timeout', elapsed >= 140);
}

// ── Default minCount is 1 ─────────────────────────────────────────────────────
{
  const el = makeSelect(['Bihar']);
  const result = await waitForOptions('#s', undefined, 500, makeQs(el), NO_OBSERVE);
  ok('default minCount=1 works', result === el);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
