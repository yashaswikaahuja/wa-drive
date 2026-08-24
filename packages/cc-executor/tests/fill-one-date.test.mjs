/**
 * Tests for fill-one-date.js
 * Run: node extension/autofill/executor/capabilities/fill-one-date.test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/fill-one-date.js'), 'utf8');

class MockEvent { constructor(t, o) { this.type = t; } }
class MockCustomEvent { constructor(t, o) { this.type = t; } }
class MockKeyboardEvent { constructor(t, o) { this.type = t; this.key = o && o.key; } }

const globalLike = {
  CcParseDateValue: {
    parseDateValue: (v) => {
      // Simple mock: 15/08/2001 → isoDate 2001-08-15
      var m = v && v.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (m) return { isoDate: m[3]+'-'+m[2]+'-'+m[1], isoMonth: m[3]+'-'+m[2], dateObj: new Date(m[3], m[2]-1, m[1]) };
      return { dateObj: new Date(v), isoDate: null };
    }
  },
  Event: MockEvent,
  CustomEvent: MockCustomEvent,
  KeyboardEvent: MockKeyboardEvent,
  window: {
    HTMLInputElement: { prototype: {} },
  },
};
// Native setter mock
Object.defineProperty(globalLike.window.HTMLInputElement.prototype, 'value', {
  set: function(v) { this._val = v; }, get: function() { return this._val || ''; }, configurable: true
});
globalLike.Object = { getOwnPropertyDescriptor: () => ({ set: function(v) { this.value = v; } }) };

new Function('globalThis', 'Object', 'Event', 'CustomEvent', 'KeyboardEvent', 'window', src)(
  globalLike, globalLike.Object, globalLike.Event, globalLike.CustomEvent, globalLike.KeyboardEvent, globalLike.window
);
const { fillDate } = globalLike.CcFillOneDate;

let passed = 0, failed = 0;
function ok(desc, val) { if (val) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— got:', val); failed++; } }
function is(desc, a, b) { if (a === b) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— exp:', b, 'got:', a); failed++; } }

function makeEl(opts) {
  const evts = [];
  return Object.assign({
    type: 'text', value: '', classList: { contains: () => false },
    getAttribute: () => null, closest: () => null,
    focus: () => {}, blur: () => {},
    dispatchEvent: (e) => evts.push(e.type),
    _evts: evts,
  }, opts);
}

// ── flatpickr ────────────────────────────────────────────────────────────────
console.log('\nflatpickr:');
{
  const setDates = [];
  const el = makeEl({ _flatpickr: { setDate: (d, t) => setDates.push(d) }, classList: { contains: () => false } });
  el.value = '2001-08-15'; // simulate flatpickr sets it
  const r = fillDate(el, '#d', '15/08/2001');
  ok('calls fp.setDate', setDates.length === 1);
  is('returns 1', r, 1);
}

// ── native date input ─────────────────────────────────────────────────────────
console.log('\nNative date input:');
{
  const el = makeEl({ type: 'date' });
  el.value = '';
  // fillDate sets el.value via our mock setter
  fillDate(el, '#d', '15/08/2001');
  ok('value converted to ISO', el.value.startsWith('2001') || el._val === '2001-08-15');
}
{
  // datetime-local with T already present
  const el = makeEl({ type: 'datetime-local' });
  fillDate(el, '#d', '2001-08-15T10:30');
  ok('datetime-local passthrough T preserved', (el.value || el._val || '').includes('T10:30'));
}
{
  // datetime-local without T gets T00:00 appended
  const el = makeEl({ type: 'datetime-local' });
  fillDate(el, '#d', '15/08/2001');
  ok('datetime-local gets T00:00 appended', (el.value || el._val || '').includes('T00:00'));
}

// ── pass-through ──────────────────────────────────────────────────────────────
console.log('\nPass-through:');
{
  const el = makeEl({ type: 'text' });
  is('plain text input → null', fillDate(el, '#t', '15/08/2001'), null);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
