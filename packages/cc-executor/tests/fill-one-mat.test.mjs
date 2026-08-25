/**
 * Tests for fill-one-mat.js
 * Run: node extension/autofill/executor/capabilities/fill-one-mat.test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/fill-one-mat.js'), 'utf8');

// Mock document for mat-select queries
let _mockOpts = [];
let _bodyClicked = false;
let _timers = [];
const globalLike = {
  document: {
    querySelectorAll: (sel) => sel.includes('mat-option') ? _mockOpts : [],
    body: { click: () => { _bodyClicked = true; } },
  },
  setTimeout: (fn, ms) => { _timers.push(fn); return _timers.length; },
};

new Function('globalThis', 'document', 'setTimeout', src)(globalLike, globalLike.document, globalLike.setTimeout);
const { fillMat } = globalLike.CcFillOneMat;

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}
function is(desc, a, b) {
  if (a === b) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected:', b, 'got:', a); failed++; }
}

function makeEl(opts) {
  const clicks = [];
  return Object.assign({
    tagName: 'MAT-SELECT',
    textContent: '',
    classList: { contains: () => false },
    querySelector: () => null,
    click: () => clicks.push('el'),
    _clicks: clicks,
  }, opts);
}

// ── Non-mat type returns null ─────────────────────────────────────────────────
console.log('\nPass-through:');
is('non-mat returns null', fillMat(makeEl(), 'x', 'select'), null);
is('text returns null', fillMat(makeEl(), 'x', 'text'), null);

// ── mat-select ────────────────────────────────────────────────────────────────
console.log('\nmat-select:');
{
  const triggerClicks = [];
  const el = makeEl({
    querySelector: (sel) => sel.includes('mat-select-trigger') ? { click: () => triggerClicks.push(1) } : null,
  });
  _timers = [];
  const r = fillMat(el, 'Bihar', 'mat-select');
  is('returns 1 immediately', r, 1);
  ok('trigger clicked', triggerClicks.length === 1);
  ok('timer scheduled', _timers.length === 1);

  // Simulate timer: exact match
  const optClicks = [];
  _mockOpts = [
    { textContent: ' Maharashtra ', click: () => optClicks.push('MH') },
    { textContent: ' Bihar ', click: () => optClicks.push('BR') },
  ];
  _timers[0](); // fire the timer
  ok('exact match option clicked', optClicks[0] === 'BR');
}
{
  // No match → body click
  _timers = [];
  _bodyClicked = false;
  const el = makeEl({ querySelector: () => ({ click: () => {} }) });
  fillMat(el, 'zzznomatch', 'mat-select');
  _mockOpts = [];
  _timers[0]();
  ok('no match → body click', _bodyClicked);
}

// ── mat-checkbox ──────────────────────────────────────────────────────────────
console.log('\nmat-checkbox:');
{
  const clicks = [];
  const checkbox = { checked: false };
  const el = makeEl({
    querySelector: (s) => s.includes('checkbox') ? checkbox : null,
    classList: { contains: () => false },
  });
  // shouldCheck=true, isChecked=false → should click
  Object.assign(checkbox, { click: () => clicks.push(1) });
  fillMat(el, 'yes', 'mat-checkbox');
  ok('clicks checkbox when unchecked and shouldCheck=true', clicks.length === 1);
}
{
  const clicks = [];
  const checkbox = { checked: true, click: () => clicks.push(1) };
  const el = makeEl({ querySelector: () => checkbox, classList: { contains: () => true } });
  fillMat(el, 'yes', 'mat-checkbox');
  ok('no click when already checked and shouldCheck=true', clicks.length === 0);
}
{
  is('returns 1 for mat-checkbox', fillMat(makeEl({ querySelector: () => null, classList: { contains: () => false } }), 'true', 'mat-checkbox'), 1);
}

// ── mat-radio ─────────────────────────────────────────────────────────────────
console.log('\nmat-radio:');
{
  const clicks = [];
  const el = makeEl({
    textContent: 'Male',
    querySelector: () => ({ click: () => clicks.push(1) }),
  });
  is('returns 1 on label match', fillMat(el, 'Male', 'mat-radio'), 1);
  ok('radio input clicked', clicks.length === 1);
}
{
  // Avoid substring false-positives: 'female'.includes('male') is true under partial match.
  const el = makeEl({ textContent: 'Female', querySelector: () => ({ click: () => {} }) });
  is('returns 0 on no label match', fillMat(el, 'Other', 'mat-radio'), 0);
}
{
  // partial match: label.includes(v)
  const clicks = [];
  const el = makeEl({ textContent: 'Male (पुरुष)', querySelector: () => ({ click: () => clicks.push(1) }) });
  is('partial match returns 1', fillMat(el, 'male', 'mat-radio'), 1);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
