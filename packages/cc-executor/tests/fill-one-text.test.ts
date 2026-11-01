/**
 * Tests for fill-one-text.js
 *
 * Run: node extension/autofill/executor/capabilities/fill-one-text.test.ts
 *
 * Uses minimal browser mocks — no jsdom.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/fill-one-text.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });

// ── Browser mocks ─────────────────────────────────────────────────────────────
function makeInput(tag, currentValue) {
  const events = [];
  const el = {
    tagName: tag || 'INPUT',
    value: currentValue || '',
    focused: false,
    getAttribute: () => null,
    focus: function () { this.focused = true; },
    dispatchEvent: function (e) { events.push(e.type || e); },
  };
  return { el, events };
}

const globalLike = {
  window: {
    HTMLInputElement: { prototype: { value: { set: function(v) { this._el.value = v; } } } },
    HTMLTextAreaElement: { prototype: { value: { set: function(v) { this._el.value = v; } } } },
    keystrokeFillSync: null,
  },
  document: { querySelectorAll: () => [] },
  Event: class Event { constructor(type, opts) { this.type = type; this.bubbles = opts && opts.bubbles; } },
  KeyboardEvent: class KeyboardEvent { constructor(type, opts) { this.type = type; this.key = opts && opts.key; } },
  fetch: () => Promise.resolve({ json: () => Promise.resolve(null) }),
};

// Wire up native setter to work with our mock elements
const niv = {
  set: function (v) {
    // find the element via closure
    this.value = v;
  }
};
globalLike.window.HTMLInputElement.prototype = {
  value: { get() { return this._val || ''; }, set(v) { this._val = v; } }
};

// Simpler approach: override getOwnPropertyDescriptor
const _getOwnPropDesc = Object.getOwnPropertyDescriptor;
globalLike.Object = { getOwnPropertyDescriptor: (proto, prop) => {
  if (prop === 'value') return { set: function(v) { this.value = v; } };
  return _getOwnPropDesc(proto, prop);
}};

const fn = new Function('globalThis', 'Object', 'Event', 'KeyboardEvent', 'fetch', 'document', 'window',
  src + '\nreturn globalThis.CcFillOneText;');
const CcFillOneText = fn(globalLike, globalLike.Object, globalLike.Event, globalLike.KeyboardEvent,
  globalLike.fetch, globalLike.document, globalLike.window);
const { fillText } = CcFillOneText;

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}

// ── keystrokeFillSync path ────────────────────────────────────────────────────
console.log('\nkeystrokeFillSync path:');
{
  const { el } = makeInput('INPUT', '');
  globalLike.window.keystrokeFillSync = (el, v) => { el.value = v; return true; };
  const r = fillText(el, 'Ramesh');
  ok('returns 1 on success', r === 1);
  ok('value set via keystroke', el.value === 'Ramesh');
  globalLike.window.keystrokeFillSync = null;
}
{
  const { el } = makeInput('INPUT', '');
  globalLike.window.keystrokeFillSync = () => false;
  const r = fillText(el, 'x');
  ok('returns 0 when keystrokeFillSync returns false', r === 0);
  globalLike.window.keystrokeFillSync = null;
}

// ── legacy fallback path ──────────────────────────────────────────────────────
console.log('\nLegacy fallback:');
{
  const { el, events } = makeInput('INPUT', '');
  globalLike.window.keystrokeFillSync = null;
  const r = fillText(el, 'Kumar');
  ok('returns 1 on legacy path', r === 1);
  ok('input event dispatched', events.includes('input'));
  ok('change event dispatched', events.includes('change'));
}

// ── textarea uses HTMLTextAreaElement ─────────────────────────────────────────
console.log('\nTextarea:');
{
  const { el } = makeInput('TEXTAREA', '');
  globalLike.window.keystrokeFillSync = (el, v) => { el.value = v; return true; };
  const r = fillText(el, 'some text');
  ok('textarea returns 1', r === 1);
  globalLike.window.keystrokeFillSync = null;
}

// ── contenteditable ───────────────────────────────────────────────────────────
console.log('\nContenteditable:');
{
  const events = [];
  const el = {
    tagName: 'BODY',
    isContentEditable: true,
    innerText: '',
    textContent: '',
    getAttribute: (k) => k === 'contenteditable' ? 'true' : null,
    focus: function () { this.focused = true; },
    dispatchEvent: function (e) { events.push(e.type || e); },
  };
  globalLike.window.keystrokeFillSync = () => false;
  const r = fillText(el, 'Your content goes here.');
  ok('contenteditable returns 1', r === 1);
  ok('innerText set', el.innerText === 'Your content goes here.');
  ok('skips keystrokeFillSync', events.includes('input'));
  globalLike.window.keystrokeFillSync = null;
}

// ── range slider ──────────────────────────────────────────────────────────────
console.log('\nRange slider:');
{
  const events = [];
  const el = {
    tagName: 'INPUT',
    type: 'range',
    min: '0',
    max: '100',
    value: '25',
    getAttribute: () => null,
    focus: function () { this.focused = true; },
    dispatchEvent: function (e) { events.push(e.type || e); },
  };
  globalLike.window.keystrokeFillSync = () => { throw new Error('should skip keystroke'); };
  const r = fillText(el, '80');
  ok('range returns 1', r === 1);
  ok('range value clamped in range', el.value === '80');
  ok('range input event', events.includes('input'));
  ok('range change event', events.includes('change'));
  const over = fillText(el, '140');
  ok('range clamps to max', over === 1 && el.value === '100');
  const under = fillText(el, '-4');
  ok('range clamps to min', under === 1 && el.value === '0');
  globalLike.window.keystrokeFillSync = null;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
