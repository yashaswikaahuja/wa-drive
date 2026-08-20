/**
 * Tests for parse-date-value.js
 *
 * Run: node extension/autofill/executor/capabilities/parse-date-value.test.mjs
 *
 * Pure date parsing tests — no DOM, no framework.
 * Behavioral reference: fill-one-date.js (3 identical inline blocks).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'parse-date-value.js'), 'utf8');

const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const { parseDateValue } = sandbox.CcParseDateValue;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}
function assertDateObj(desc, result, y, m, d) {
  const ok = result.dateObj instanceof Date &&
    !isNaN(result.dateObj.getTime()) &&
    result.dateObj.getFullYear() === y &&
    result.dateObj.getMonth() + 1 === m &&
    result.dateObj.getDate() === d;
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected', y, m, d, 'got', result.dateObj); failed++; }
}
function assertNull(desc, result) {
  if (result.dateObj === null && result.isoDate === '' && result.isoMonth === '' && result.isoDatetime === '') {
    console.log('  ✓', desc); passed++;
  } else {
    console.error('  ✗', desc, '— expected all-empty, got', JSON.stringify(result));
    failed++;
  }
}

// ── DD/MM/YYYY (day-first, Indian format) ─────────────────────────────────────
console.log('\nDD/MM/YYYY format:');
const r1 = parseDateValue('15/08/2001');
assertDateObj('15/08/2001 → Date(2001,8,15)', r1, 2001, 8, 15);
assert('15/08/2001 isoDate', r1.isoDate, '2001-08-15');
assert('15/08/2001 isoMonth', r1.isoMonth, '2001-08');
assert('15/08/2001 isoDatetime', r1.isoDatetime, '2001-08-15T00:00');

const r2 = parseDateValue('01/01/2000');
assertDateObj('01/01/2000', r2, 2000, 1, 1);
assert('01/01/2000 isoDate', r2.isoDate, '2000-01-01');

// ── DD-MM-YYYY (hyphen separator) ─────────────────────────────────────────────
console.log('\nDD-MM-YYYY format:');
const r3 = parseDateValue('15-08-2001');
assertDateObj('15-08-2001', r3, 2001, 8, 15);
assert('15-08-2001 isoDate', r3.isoDate, '2001-08-15');

// ── DD.MM.YYYY (dot separator) ────────────────────────────────────────────────
console.log('\nDD.MM.YYYY format:');
const r4 = parseDateValue('15.08.2001');
assertDateObj('15.08.2001', r4, 2001, 8, 15);
assert('15.08.2001 isoDate', r4.isoDate, '2001-08-15');

// ── YYYY-MM-DD (ISO standard) ─────────────────────────────────────────────────
console.log('\nYYYY-MM-DD format:');
const r5 = parseDateValue('2001-08-15');
assertDateObj('2001-08-15', r5, 2001, 8, 15);
assert('2001-08-15 isoDate', r5.isoDate, '2001-08-15');

// ── YYYY/MM/DD ────────────────────────────────────────────────────────────────
console.log('\nYYYY/MM/DD format:');
const r6 = parseDateValue('2001/08/15');
assertDateObj('2001/08/15', r6, 2001, 8, 15);
assert('2001/08/15 isoDate', r6.isoDate, '2001-08-15');

// ── YYYY.MM.DD ────────────────────────────────────────────────────────────────
console.log('\nYYYY.MM.DD format:');
const r7 = parseDateValue('2001.08.15');
assertDateObj('2001.08.15', r7, 2001, 8, 15);
assert('2001.08.15 isoDate', r7.isoDate, '2001-08-15');

// ── Month padding ──────────────────────────────────────────────────────────────
console.log('\nSingle-digit month/day padding:');
const r8 = parseDateValue('5/3/2001');
assertDateObj('5/3/2001 (DD/MM/YYYY)', r8, 2001, 3, 5);
assert('5/3/2001 isoDate', r8.isoDate, '2001-03-05');

// ── isoMonth and isoDatetime ──────────────────────────────────────────────────
console.log('\nisoMonth and isoDatetime:');
const r9 = parseDateValue('15/08/2001');
assert('isoMonth is YYYY-MM', r9.isoMonth, '2001-08');
assert('isoDatetime is YYYY-MM-DDTHH:MM', r9.isoDatetime, '2001-08-15T00:00');

// ── Null / empty / invalid ────────────────────────────────────────────────────
console.log('\nNull / empty / invalid:');
assertNull('null', parseDateValue(null));
assertNull('undefined', parseDateValue(undefined));
assertNull('empty string', parseDateValue(''));
assertNull('"invalid"', parseDateValue('invalid'));
assertNull('"not-a-date"', parseDateValue('not-a-date'));

// ── DD/MM/YYYY takes priority over YYYY/MM/DD ─────────────────────────────────
console.log('\nFormat disambiguation:');
// '01/02/2003' should be parsed as DD/MM/YYYY → Feb 1, 2003 (not Jan 2, 2003)
const r10 = parseDateValue('01/02/2003');
assertDateObj('01/02/2003 is DD/MM/YYYY → Feb 1', r10, 2003, 2, 1);

// '2003/01/02' is YYYY/MM/DD → Jan 2, 2003
const r11 = parseDateValue('2003/01/02');
assertDateObj('2003/01/02 is YYYY/MM/DD → Jan 2', r11, 2003, 1, 2);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
