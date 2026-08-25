/**
 * Tests for fill-one-select.js
 * Run: node extension/autofill/executor/capabilities/fill-one-select.test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/fill-one-select.js'), 'utf8');

let _timers = [];
class MockEvent { constructor(t, o) { this.type = t; } }

const globalLike = {
  window: {
    ccMatchOption: null,
    HTMLSelectElement: { prototype: {} },
  },
  document: { body: { getAttribute: () => null } },
  Event: MockEvent,
  setTimeout: (fn, ms) => { _timers.push({ fn, ms }); return _timers.length; },
  setInterval: (fn, ms) => 99,
  clearInterval: () => {},
};
Object.defineProperty(globalLike.window.HTMLSelectElement.prototype, 'value', {
  set: function(v) { this._val = v; }, get: function() { return this._val || ''; }, configurable: true
});
globalLike.Object = { getOwnPropertyDescriptor: () => ({ set: function(v) { this.value = v; } }) };

new Function('globalThis', 'Object', 'Event', 'setTimeout', 'setInterval', 'clearInterval', 'document', 'window', src)(
  globalLike, globalLike.Object, globalLike.Event, globalLike.setTimeout,
  globalLike.setInterval, globalLike.clearInterval, globalLike.document, globalLike.window
);
const { fillSelect } = globalLike.CcFillOneSelect;

let passed = 0, failed = 0;
function ok(desc, val) { if (val) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— got:', val); failed++; } }
function is(desc, a, b) { if (a === b) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— exp:', b, 'got:', a); failed++; } }

function makeSelect(opts) {
  const evts = [];
  const el = {
    tagName: 'SELECT', value: '', selectedIndex: -1, onchange: null,
    options: opts.map((o, i) => ({ value: o.v, text: o.t, selected: false, index: i })),
    focus: () => {}, blur: () => {},
    dispatchEvent: (e) => evts.push(e.type),
    _evts: evts,
  };
  return el;
}

// ── non-select returns null ───────────────────────────────────────────────────
console.log('\nPass-through:');
is('INPUT → null', fillSelect({ tagName: 'INPUT' }, '#x', 'v', {}), null);

// ── exact match via ccMatchOption ─────────────────────────────────────────────
console.log('\nExact match:');
{
  _timers = [];
  const el = makeSelect([{ v: '', t: 'Select...' }, { v: 'BR', t: 'Bihar' }]);
  globalLike.window.ccMatchOption = (val, opts) => opts.find(o => o.text.trim().toLowerCase() === val.toLowerCase()) || null;
  const r = fillSelect(el, '#s', 'Bihar', {});
  is('returns 1', r, 1);
  ok('selectedIndex set', el.selectedIndex === 1);
  ok('re-apply timers scheduled', _timers.length >= 2);
  globalLike.window.ccMatchOption = null;
}

// ── no ccMatchOption → retry interval ────────────────────────────────────────
{
  _timers = [];
  const el = makeSelect([{ v: 'BR', t: 'Bihar' }]);
  globalLike.window.ccMatchOption = null;
  const r = fillSelect(el, '#s', 'Bihar', {});
  is('returns 1 (async retry)', r, 1);
}

// ── month mapping extraValues ─────────────────────────────────────────────────
console.log('\nMonth mapping:');
{
  const el = makeSelect([{ v: '8', t: 'August' }, { v: '9', t: 'September' }]);
  const mapping = { '#s': { monthNum: 8, monthShort: 'Aug' } };
  globalLike.window.ccMatchOption = (val, opts, cfg) => {
    ok('extraValues passed', cfg && cfg.extraValues && cfg.extraValues.includes('8'));
    return null;
  };
  fillSelect(el, '#s', 'August', mapping);
  globalLike.window.ccMatchOption = null;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
