/**
 * Integration test — verifies shared modules load in browser context
 * and are callable by the extension's callers.
 *
 * Run: node extension/test/test-integration.js
 *
 * Uses JSDOM to simulate browser environment with all scripts loaded in order.
 * This mirrors the exact injection order from popup.js.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');

// Create a simulated browser context
const context = vm.createContext({
  window: {},
  document: {
    body: { dataset: {}, setAttribute: () => {}, getAttribute: () => null },
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  CSS: { escape: (s) => s },
  Event: class Event { constructor(t, o) { this.type = t; this.bubbles = o?.bubbles; } },
  FocusEvent: class FocusEvent { constructor(t, o) { this.type = t; } },
  MouseEvent: class MouseEvent { constructor(t, o) { this.type = t; this.bubbles = o?.bubbles; } },
  KeyboardEvent: class KeyboardEvent { constructor(t, o) { this.type = t; this.key = o?.key; } },
  InputEvent: class InputEvent { constructor(t, o) { this.type = t; } },
  CustomEvent: class CustomEvent { constructor(t, o) { this.type = t; } },
  MutationObserver: class MutationObserver { observe() {} disconnect() {} },
  Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
  Promise: Promise,
  fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"0":"name"}' } }] }) }),
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  JSON: JSON,
  Math: Math,
  Date: Date,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  RegExp: RegExp,
  Error: Error,
});

// Self-reference window = global
context.window = context;
context.self = context;
context.globalThis = context;

// Load scripts in the EXACT order popup.js injects them
const INJECTION_ORDER = [
  'shared/option-match.js',
  'shared/dom-utils.js',
  'shared/network-idle.js',
  'shared/llm-client.js',
  'shared/select-apply.js',
  'autofill/plugins/interface.js',
  'autofill/plugins/cascade-select.js',
  'autofill/plugins/ng-dropdown.js',
  'autofill/plugins/keystroke-input.js',
  'autofill/rule-engine.js',
];

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

console.log('Loading scripts in injection order...');
for (const file of INJECTION_ORDER) {
  const filePath = path.join(EXT, file);
  if (!fs.existsSync(filePath)) { console.error(`  MISSING: ${file}`); failed++; continue; }
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: file });
    console.log(`  loaded: ${file}`);
  } catch (e) {
    console.error(`  FAILED to load ${file}: ${e.message}`);
    failed++;
  }
}

console.log('\n=== Shared Module Availability ===');
assert(typeof context.ccMatchOption === 'function', 'window.ccMatchOption is a function');
assert(typeof context.ccDomUtils === 'object', 'window.ccDomUtils exists');
assert(typeof context.ccDomUtils.isVisible === 'function', 'window.ccDomUtils.isVisible is a function');
assert(typeof context.ccDomUtils.getLabel === 'function', 'window.ccDomUtils.getLabel is a function');
assert(typeof context.ccWaitForNetworkIdle === 'function', 'window.ccWaitForNetworkIdle is a function');
assert(typeof context.ccLLM === 'object', 'window.ccLLM exists');
assert(typeof context.ccLLM.call === 'function', 'window.ccLLM.call is a function');
assert(typeof context.ccLLM.parseJSON === 'function', 'window.ccLLM.parseJSON is a function');
assert(typeof context.ccApplySelect === 'function', 'window.ccApplySelect is a function');

console.log('\n=== Option Matching (via shared) ===');
assert(context.ccMatchOption('Male', ['Male', 'Female']) === 'Male', 'Direct: exact match');
assert(context.ccMatchOption('Bihar', [{text:'Bihar',value:'5'},{text:'UP',value:'9'}]).value === '5', 'Direct: object match');
assert(context.ccMatchOption('12th', ['Matriculation', 'Higher Secondary', 'Graduate']) === 'Higher Secondary', 'Direct: synonym match');

console.log('\n=== Rule Engine Delegation ===');
// rule-engine now calls window.ccMatchOption directly (no wrapper function)
// Verify ccEvaluateField uses it for radio/dropdown option matching
const ruleResult = context.ccMatchOption('Male', ['Male', 'Female']);
assert(ruleResult === 'Male', 'window.ccMatchOption accessible after rule-engine loads');

console.log('\n=== LLM Client ===');
const parseResult = context.ccLLM.parseJSON('some text {"name":"test"} more text');
assert(parseResult && parseResult.name === 'test', 'ccLLM.parseJSON extracts JSON from text');
assert(context.ccLLM.parseJSON('no json here') === null, 'ccLLM.parseJSON returns null on no JSON');
assert(context.ccLLM.parseJSON('```json\n{"a":1}\n```') && context.ccLLM.parseJSON('```json\n{"a":1}\n```').a === 1, 'ccLLM.parseJSON handles markdown fences');

console.log('\n=== Network Idle ===');
// Set up fake monitor data
context.document.body.dataset.ccAjaxActive = '0';
context.document.body.dataset.ccAjaxLastActivity = String(Date.now() - 500);
// Should resolve immediately since idle for 500ms > default 200ms quietMs
const idlePromise = context.ccWaitForNetworkIdle(200, 2000);
idlePromise.then(r => {
  assert(r.idle === true, 'ccWaitForNetworkIdle resolves idle=true when network is quiet');

  console.log('\n─────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
});
