/**
 * Tests for fill-one-ng.js
 * Run: node extension/autofill/executor/capabilities/fill-one-ng.test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'fill-one-ng.js'), 'utf8');

class MockMouseEvent { constructor(t, o) { this.type = t; } }

const sessions = new Map();
const globalLike = {
  CcNgSessionManager: {
    cancelSession: (l, s) => { if (s && s.has(l)) s.delete(l); },
    createSession: (l, s) => {
      const sess = { id: 'x1', fieldKey: l, resolved: false, cancelled: false, pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };
      s.set(l, sess); return sess;
    },
    cleanupSession: (sess, s, l) => { if (s) s.delete(l); },
  },
  CcNgOptionScorer: { scoreOption: (ot, v) => ot.toLowerCase() === v.toLowerCase() ? 100 : 0 },
  CcBuildFillRecord: { buildFillRecord: (b, o) => Object.assign({ ts: Date.now(), rv: o.rv, fillMode: 'sequential' }, b) },
  window: { _ccReplaySessions: sessions, ccDomUtils: { isVisible: () => true } },
  document: {
    body: { click: () => {}, querySelectorAll: () => [] },
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  MouseEvent: MockMouseEvent,
  MutationObserver: class { constructor(cb) { this._cb = cb; } observe() {} disconnect() {} },
  sessionStorage: { setItem: () => {} },
  setInterval: (fn, ms) => { setTimeout(fn, 0); return 1; },
  clearInterval: () => {},
  setTimeout: (fn, ms) => { if (ms <= 0 || ms <= 50) fn(); return 1; },
  clearTimeout: () => {},
};

new Function('globalThis', 'window', 'document', 'MouseEvent', 'MutationObserver', 'sessionStorage',
  'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', src)(
  globalLike, globalLike.window, globalLike.document, globalLike.MouseEvent,
  globalLike.MutationObserver, globalLike.sessionStorage,
  globalLike.setInterval, globalLike.clearInterval, globalLike.setTimeout, globalLike.clearTimeout
);
const { fillNg } = globalLike.CcFillOneNg;

let passed = 0, failed = 0;
function ok(desc, val) { if (val) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— got:', val); failed++; } }
function is(desc, a, b) { if (a === b) { console.log('  ✓', desc); passed++; } else { console.error('  ✗', desc, '— exp:', b, 'got:', a); failed++; } }

function makeEl(opts) {
  return Object.assign({
    className: 'ng-dropdown', tagName: 'DIV',
    querySelector: () => ({ click: () => {}, textContent: '', getBoundingClientRect: () => ({left:0,top:0,bottom:0}) }),
    contains: () => false,
  }, opts);
}

// ── non-ng-dropdown → null ────────────────────────────────────────────────────
console.log('\nPass-through:');
is('text type → null', fillNg(makeEl(), '#x', 'v', 'text-input', 'text', {}), null);
is('select type → null', fillNg(makeEl(), '#x', 'v', null, 'select', {}), null);

// ── no adapter → 0 ───────────────────────────────────────────────────────────
console.log('\nNo adapter:');
{
  const rr = {};
  const r = fillNg(makeEl(), '#x', 'Bihar', 'ng-dropdown', 'ng-dropdown', {
    portalAdapters: {}, filledBySource: {}, _replayResults: rr, _ccRecords: [], RUNTIME_VERSION: '5.70', _flushRecords: () => {},
  });
  is('returns 0', r, 0);
  ok('no-adapter recorded', rr['#x'] === 'no-adapter');
}

// ── with adapter → 1 (fire-and-forget) ───────────────────────────────────────
console.log('\nWith adapter:');
{
  const records = [];
  const r = fillNg(makeEl(), '#f', 'Bihar', 'ng-dropdown', 'ng-dropdown', {
    portalAdapters: { 'ng-dropdown': { triggerSelector: '.trigger', optionSelector: 'li' } },
    filledBySource: { '#f': { label: 'State' } },
    _replayResults: {}, _ccRecords: records, RUNTIME_VERSION: '5.70', _flushRecords: () => {},
  });
  is('returns 1', r, 1);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
