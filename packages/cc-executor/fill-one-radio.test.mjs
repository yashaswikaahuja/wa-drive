/**
 * Tests for fill-one-radio.js
 * Run: node extension/autofill/executor/capabilities/fill-one-radio.test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'src/fill-one-radio.js'), 'utf8');

const events = [];
class MockEvent { constructor(t, o) { this.type = t; this.bubbles = o && o.bubbles; } }

const globalLike = {
  document: {
    querySelectorAll: () => [],
    querySelector: () => null,
  },
  Event: MockEvent,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  DataTransfer: class { constructor() { this.items = { add: () => {} }; this.files = []; } },
  File: class { constructor(b, n, o) { this.name = n; this.type = o && o.type; } },
};

new Function('globalThis', 'document', 'Event', 'atob', 'DataTransfer', 'File', src)(
  globalLike, globalLike.document, globalLike.Event, globalLike.atob, globalLike.DataTransfer, globalLike.File
);
const { fillRadio } = globalLike.CcFillOneRadio;

let passed = 0, failed = 0;
function ok(desc, val) { if (val) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— got:', val); failed++; } }
function is(desc, a, b) { if (a === b) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— exp:', b, 'got:', a); failed++; } }

function makeEl(opts) {
  const clicks = [], evts = [];
  return Object.assign({ tagName: 'INPUT', type: 'radio', name: 'g1', id: 'r1', value: 'Bihar', checked: false,
    focus: () => {}, querySelector: () => null,
    dispatchEvent: (e) => evts.push(e.type),
    _clicks: clicks, _evts: evts,
  }, opts);
}

// ── radio-click ───────────────────────────────────────────────────────────────
console.log('\nradio-click:');
{
  const el = makeEl({ type: 'radio' });
  is('returns 1', fillRadio(el, '#r', 'x', 'radio-click', 'radio', {}), 1);
  ok('checked set', el.checked === true);
}

// ── checkbox ──────────────────────────────────────────────────────────────────
console.log('\ncheckbox:');
{
  const el = makeEl({ type: 'checkbox', checked: false });
  is('yes → checked, returns 1', fillRadio(el, '#c', 'yes', null, 'checkbox', {}), 1);
  ok('checked=true', el.checked === true);
}
{
  const el = makeEl({ type: 'checkbox', checked: true });
  fillRadio(el, '#c', 'yes', null, 'checkbox', {});
  ok('already checked, no change', el.checked === true);
}
{
  const el = makeEl({ type: 'checkbox', checked: false });
  is('non-boolean value → 0', fillRadio(el, '#c', 'Ramesh', null, 'checkbox', {}), 0);
}

// ── pass-through ──────────────────────────────────────────────────────────────
console.log('\nPass-through:');
is('unknown type → null', fillRadio(makeEl(), '#x', 'v', 'text-input', 'text', {}), null);

// ── file: non-base64 → 0 ─────────────────────────────────────────────────────
console.log('\nFile:');
{
  const el = makeEl({ type: 'file' });
  is('http URL → 0 (deferred)', fillRadio(el, '#f', 'http://example.com/a.pdf', null, null, {}), 0);
  is('empty value → 0', fillRadio(el, '#f', '', null, null, {}), 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
