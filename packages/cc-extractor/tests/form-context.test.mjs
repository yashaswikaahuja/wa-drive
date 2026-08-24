/**
 * form-context.test.mjs — plain Node tests, no framework, no jsdom
 *
 * Tests CcFormContext.isInSkipContext, isGoodLabel, hasFormContext
 * using minimal DOM stubs.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/form-context.js'), 'utf8');

// Minimal globalThis shim
const root = {};
const fn = new Function('globalThis', src);
fn(root);
const { isInSkipContext, isGoodLabel, hasFormContext } = root.CcFormContext;

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
if (failed > 0) process.exit(1);
