/**
 * Tests for build-fill-record.js
 *
 * Run: node extension/autofill/executor/capabilities/build-fill-record.test.mjs
 *
 * Pure JS — no DOM, no framework, no async.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'build-fill-record.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const {
  buildFillRecord,
  buildFilledRecord,
  buildSkippedRecord,
  buildErrorRecord,
  buildWaitingHumanRecord,
} = globalLike.CcBuildFillRecord;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else {
    console.error('  ✗', desc);
    console.error('    expected:', JSON.stringify(expected));
    console.error('    actual:  ', JSON.stringify(actual));
    failed++;
  }
}
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}

const TS = 1000000;
const OPTS = { rv: '5.70', now: () => TS };

// ── buildFillRecord ────────────────────────────────────────────────────────────
console.log('\nbuildFillRecord:');
{
  const r = buildFillRecord({ selector: '#n', value: 'Ramesh', type: 'text', result: 'filled' }, OPTS);
  assert('stamps ts, rv, fillMode on base', r, {
    ts: TS,
    rv: '5.70',
    fillMode: 'sequential',
    selector: '#n',
    value: 'Ramesh',
    type: 'text',
    result: 'filled',
  });
}

// Default fillMode
{
  const r = buildFillRecord({ result: 'filled' }, { rv: '5.70', now: () => TS });
  ok('default fillMode is sequential', r.fillMode === 'sequential');
}

// Custom fillMode
{
  const r = buildFillRecord({ result: 'filled' }, { rv: '5.70', fillMode: 'retry', now: () => TS });
  ok('custom fillMode is respected', r.fillMode === 'retry');
}

// Default rv is empty string
{
  const r = buildFillRecord({ result: 'filled' }, { now: () => TS });
  ok('default rv is empty string', r.rv === '');
}

// Caller fields override envelope defaults
{
  const r = buildFillRecord({ result: 'filled', ts: 999, rv: 'override', fillMode: 'custom' }, OPTS);
  ok('caller ts overrides stamp', r.ts === 999);
  ok('caller rv overrides stamp', r.rv === 'override');
  ok('caller fillMode overrides stamp', r.fillMode === 'custom');
}

// ts is a number when using real Date.now
{
  const r = buildFillRecord({ result: 'filled' }, { rv: '' });
  ok('ts is a number (real Date.now)', typeof r.ts === 'number' && r.ts > 0);
}

// ── buildFilledRecord ─────────────────────────────────────────────────────────
console.log('\nbuildFilledRecord:');
{
  const r = buildFilledRecord({ selector: '#s', value: 'Bihar', strategy: 'native-select', durationMs: 123 }, OPTS);
  assert('buildFilledRecord shape', r, {
    ts: TS, rv: '5.70', fillMode: 'sequential',
    result: 'filled',
    selector: '#s', value: 'Bihar', strategy: 'native-select', durationMs: 123,
  });
}
{
  // Caller can override result (unusual but allowed)
  const r = buildFilledRecord({ result: 'skipped' }, OPTS);
  ok('caller result overrides filled default', r.result === 'skipped');
}

// ── buildSkippedRecord ────────────────────────────────────────────────────────
console.log('\nbuildSkippedRecord:');
{
  const r = buildSkippedRecord({ selector: '#x', failReason: 'no-element' }, OPTS);
  ok('result is skipped', r.result === 'skipped');
  ok('failReason preserved', r.failReason === 'no-element');
}

// ── buildErrorRecord ──────────────────────────────────────────────────────────
console.log('\nbuildErrorRecord:');
{
  const r = buildErrorRecord({ selector: '#e', error: 'TypeError: cannot read' }, OPTS);
  ok('result is error', r.result === 'error');
  ok('error message preserved', r.error === 'TypeError: cannot read');
}

// ── buildWaitingHumanRecord ───────────────────────────────────────────────────
console.log('\nbuildWaitingHumanRecord:');
{
  const r = buildWaitingHumanRecord({ selector: '#f', failReason: 'filename_only_no_url' }, OPTS);
  ok('result is waiting_human', r.result === 'waiting_human');
  ok('selector preserved', r.selector === '#f');
}

// ── Does not mutate base ──────────────────────────────────────────────────────
console.log('\nImmutability:');
{
  const base = { selector: '#m', value: 'X', result: 'filled' };
  buildFillRecord(base, OPTS);
  ok('base object not mutated', !('ts' in base) && !('rv' in base));
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
