/**
 * Tests for build-fill-record.js
 *
 * Run: node extension/autofill/executor/capabilities/build-fill-record.test.mjs
 *
 * Pure JS — no DOM, no framework, no async.
 * Behavioral reference: inline ts/rv/fillMode stamp at every _ccRecords.push() site.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/build-fill-record.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const { buildFillRecord } = globalLike.CcBuildFillRecord;

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

// ── Core stamping ─────────────────────────────────────────────────────────────
console.log('\nCore stamping:');
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

// ── Defaults ──────────────────────────────────────────────────────────────────
console.log('\nDefaults:');
{
  const r = buildFillRecord({ result: 'filled' }, { now: () => TS });
  ok('default fillMode is sequential', r.fillMode === 'sequential');
  ok('default rv is empty string', r.rv === '');
}

// ── Custom opts ───────────────────────────────────────────────────────────────
console.log('\nCustom opts:');
{
  const r = buildFillRecord({ result: 'filled' }, { rv: '5.70', fillMode: 'retry', now: () => TS });
  ok('custom fillMode respected', r.fillMode === 'retry');
  ok('custom rv respected', r.rv === '5.70');
}

// ── Caller fields override envelope ──────────────────────────────────────────
console.log('\nCaller field precedence:');
{
  const r = buildFillRecord({ result: 'filled', ts: 999, rv: 'override', fillMode: 'custom' }, OPTS);
  ok('caller ts overrides stamp', r.ts === 999);
  ok('caller rv overrides stamp', r.rv === 'override');
  ok('caller fillMode overrides stamp', r.fillMode === 'custom');
}

// ── ts is a live number when no opts.now ──────────────────────────────────────
{
  const r = buildFillRecord({ result: 'filled' }, { rv: '' });
  ok('ts is a number (real Date.now)', typeof r.ts === 'number' && r.ts > 0);
}

// ── Immutability ──────────────────────────────────────────────────────────────
console.log('\nImmutability:');
{
  const base = { selector: '#m', value: 'X', result: 'filled' };
  buildFillRecord(base, OPTS);
  ok('base object not mutated', !('ts' in base) && !('rv' in base) && !('fillMode' in base));
}

// ── Real consumer patterns (as used at push sites) ────────────────────────────
console.log('\nReal consumer patterns:');

// button fill
{
  const r = buildFillRecord({
    selector: '#btn', value: null, type: 'button', result: 'filled',
    strategy: 'plugin:button-click', plugin: 'button-click',
    durationMs: 55,
  }, { rv: '5.70', now: () => TS });
  ok('button fill record shape', r.result === 'filled' && r.strategy === 'plugin:button-click' && r.ts === TS);
}

// ng-dropdown no-element skip
// Note: in the original code this site was MISSING fillMode (bug in original).
// buildFillRecord now adds fillMode: 'sequential' by default — this is an intentional fix.
{
  const r = buildFillRecord({
    selector: 'ng-dropdown-0', value: 'Bihar', type: 'select',
    result: 'skipped', failReason: 'no-element', strategy: 'ng-dropdown',
  }, { rv: '5.70', now: () => TS });
  ok('ng-dropdown no-element: fillMode now present (was missing in original)', r.fillMode === 'sequential');
}

// error catch
{
  const r = buildFillRecord({
    selector: '#e', value: 'x', type: 'text',
    result: 'error', error: 'TypeError',
  }, { rv: '5.70', now: () => TS });
  ok('error record shape', r.result === 'error' && r.error === 'TypeError' && r.rv === '5.70');
}

// waiting_human (file)
{
  const r = buildFillRecord({
    selector: '#f', value: null, type: 'file', label: 'Upload',
    result: 'waiting_human', failReason: 'filename_only_no_url',
    strategy: 'file-needs-human', durationMs: 0,
  }, { rv: '5.70', now: () => TS });
  ok('waiting_human record shape', r.result === 'waiting_human' && r.fillMode === 'sequential');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
