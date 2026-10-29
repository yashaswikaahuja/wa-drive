/**
 * form-context.test.ts — plain Node tests, no framework, no jsdom
 *
 * Tests CcFormContext.isInSkipContext, isGoodLabel, hasFormContext
 * using minimal DOM stubs.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(path.join(__dirname, '../src/form-context.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });

// Minimal globalThis shim
const root = {};
const fn = new Function('globalThis', src);
fn(root);
const { isInSkipContext, isGoodLabel, hasFormContext, isVisuallyPresent } = root.CcFormContext;

let passed = 0;
let failed = 0;

function assert(desc, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ ${desc}`);
    console.error(`    expected: ${expected}`);
    console.error(`    actual:   ${actual}`);
    failed++;
  }
}

// ── isInSkipContext ────────────────────────────────────────────────────────────
console.log('\nisInSkipContext');

// Stub element that implements closest()
function makeEl(matchingSelector) {
  return {
    closest(sel) {
      return sel.split(',').some(s => s.trim() === matchingSelector) ? {} : null;
    }
  };
}

assert('nav element skipped',        isInSkipContext(makeEl('nav')), true);
assert('header element skipped',     isInSkipContext(makeEl('header')), true);
assert('footer element skipped',     isInSkipContext(makeEl('footer')), true);
assert('[role=navigation] skipped',  isInSkipContext(makeEl('[role="navigation"]')), true);
assert('[role=search] skipped',      isInSkipContext(makeEl('[role="search"]')), true);
assert('[role=banner] skipped',      isInSkipContext(makeEl('[role="banner"]')), true);
assert('main element not skipped',   isInSkipContext(makeEl('main')), false);
assert('form element not skipped',   isInSkipContext(makeEl('form')), false);
assert('div element not skipped',    isInSkipContext(makeEl('div')), false);

// ── isVisuallyPresent ──────────────────────────────────────────────────────────
console.log('\nisVisuallyPresent');

function painted(extra) {
  return Object.assign({
    id: 'aadhaar',
    getBoundingClientRect: () => ({ left: 10, top: 10, width: 120, height: 24 }),
    getClientRects: () => [{}],
    closest: () => null,
  }, extra);
}
const view = {
  innerWidth: 800,
  innerHeight: 600,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  elementFromPoint: (x, y) => view._top,
  _top: null,
};

{
  const el = painted();
  view._top = el;
  assert('painted control is present', isVisuallyPresent(el, view), true);
}
assert('zero-size control is noise', isVisuallyPresent(painted({
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
}), view), false);
{
  const el = painted();
  const covered = { id: 'overlay' };
  view._top = covered;
  assert('covered control is noise', isVisuallyPresent(el, view), false);
  view._top = el;
}
{
  const el = painted();
  const hiddenView = Object.assign({}, view, {
    getComputedStyle: () => ({ display: 'none', visibility: 'visible', opacity: '1' }),
  });
  assert('display:none is noise', isVisuallyPresent(el, hiddenView), false);
}
{
  const el = painted({
    getBoundingClientRect: () => ({ left: 10, top: 900, width: 120, height: 24 }),
  });
  view._top = { id: 'other' };
  assert('control below the fold stays', isVisuallyPresent(el, view), true);
  view._top = el;
}
assert('node stub without a box is kept', isVisuallyPresent({ closest: () => null }), true);

// ── isGoodLabel ────────────────────────────────────────────────────────────────
console.log('\nisGoodLabel');

assert('null is not good',           isGoodLabel(null), false);
assert('empty string is not good',   isGoodLabel(''), false);
assert('single char is not good',    isGoodLabel('A'), false);
assert('symbols only not good',      isGoodLabel('**'), false);
assert('two chars is good',          isGoodLabel('AB'), true);
assert('normal label is good',       isGoodLabel('Full Name'), true);
assert('label with numbers is good', isGoodLabel('Address 2'), true);

// With ccDomUtils injection
const mockDomUtils = { isGoodLabel: (s) => s === 'MOCK_GOOD' };
assert('delegates to ccDomUtils when provided — good',  isGoodLabel('MOCK_GOOD', mockDomUtils), true);
assert('delegates to ccDomUtils when provided — bad',   isGoodLabel('Full Name', mockDomUtils), false);

// ── hasFormContext ─────────────────────────────────────────────────────────────
console.log('\nhasFormContext');

// Stub document with <form>
const docWithForm = {
  querySelectorAll(sel) {
    if (sel === 'form') return [{}]; // one form
    return [];
  }
};
assert('page with <form> has form context', hasFormContext(docWithForm), true);

// Stub document with no <form> but 2 labeled inputs
function makeDocNoForm(inputs) {
  return {
    querySelectorAll(sel) {
      if (sel === 'form') return [];
      return inputs;
    }
  };
}

const labeledInput = {
  closest() { return null; }, // not in skip context
  placeholder: 'Enter name',
};
const unlabeledInput = {
  closest() { return null; },
  placeholder: '',
};
const navInput = {
  closest(sel) { return sel.includes('nav') ? {} : null; },
  placeholder: 'search',
};

assert('2 labeled inputs = has context',    hasFormContext(makeDocNoForm([labeledInput, labeledInput])), true);
assert('1 labeled input = no context',      hasFormContext(makeDocNoForm([labeledInput, unlabeledInput])), false);
assert('0 labeled inputs = no context',     hasFormContext(makeDocNoForm([])), false);
assert('nav inputs are skipped',            hasFormContext(makeDocNoForm([navInput, navInput])), false);

// With ccDomUtils that provides getLabel
const ccDomUtils = { getLabel: (el) => el._label || '', isGoodLabel: (s) => s.length >= 2 };
const inputWithLabel = { closest() { return null; }, _label: 'Full Name', placeholder: '' };
const inputNoLabel   = { closest() { return null; }, _label: '', placeholder: '' };
assert('ccDomUtils.getLabel used when provided',
  hasFormContext(makeDocNoForm([inputWithLabel, inputWithLabel]), ccDomUtils), true);
assert('ccDomUtils.getLabel — no label = no context',
  hasFormContext(makeDocNoForm([inputNoLabel, inputNoLabel]), ccDomUtils), false);

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
