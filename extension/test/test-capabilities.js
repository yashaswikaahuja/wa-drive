/**
 * Tests for Phase 1.2: Capability Registry + Browser Action Primitives.
 * Run: node extension/test/test-capabilities.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..');

// Simulated browser context
const context = vm.createContext({
  window: {},
  document: {
    body: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  CSS: { escape: (s) => s },
  Event: class Event { constructor(t, o) { this.type = t; this.bubbles = o && o.bubbles; } },
  MouseEvent: class MouseEvent { constructor(t, o) { this.type = t; this.bubbles = o && o.bubbles; } },
  KeyboardEvent: class KeyboardEvent { constructor(t, o) { this.type = t; this.key = o && o.key; } },
  Promise: Promise,
  Object: Object,
  Array: Array,
  String: String,
  JSON: JSON,
  Date: Date,
  parseInt: parseInt,
  Math: Math,
  Error: Error,
});
context.window = context;
context.self = context;
context.globalThis = context;

// Load dependencies
['shared/option-match.js', 'shared/dom-utils.js', 'shared/network-idle.js', 'shared/select-apply.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(EXT, f), 'utf8'), context, { filename: f }));

// Load the capability registry
vm.runInContext(fs.readFileSync(path.join(EXT, 'capabilities/registry.js'), 'utf8'), context, { filename: 'capabilities/registry.js' });

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\n=== Registry Availability ===');
assert(typeof context.ccCapabilities === 'object', 'window.ccCapabilities exists');
assert(typeof context.ccCapabilities.register === 'function', 'register function exists');
assert(typeof context.ccCapabilities.dispatch === 'function', 'dispatch function exists');
assert(typeof context.ccCapabilities.list === 'function', 'list function exists');
assert(typeof context.ccCapabilities.manifest === 'function', 'manifest function exists');
assert(typeof context.ccCapabilities.resolveWidgetType === 'function', 'resolveWidgetType exists');
assert(context.ccCapabilities.version === '1.0.0', 'registry version is 1.0.0');

console.log('\n=== Core Capabilities Registered ===');
const caps = context.ccCapabilities.list();
assert(caps.includes('fill_text'), 'fill_text registered');
assert(caps.includes('select_option'), 'select_option registered');
assert(caps.includes('click'), 'click registered');
assert(caps.includes('check'), 'check registered');
assert(caps.includes('wait_network'), 'wait_network registered');
assert(caps.includes('wait_element'), 'wait_element registered');
assert(caps.includes('wait_time'), 'wait_time registered');
assert(caps.includes('scroll_to'), 'scroll_to registered');
assert(caps.includes('navigate'), 'navigate registered');
assert(caps.includes('extract'), 'extract registered');
assert(caps.includes('assert'), 'assert registered');
assert(caps.length === 15, 'exactly 15 core capabilities');

console.log('\n=== Manifest ===');
const manifest = context.ccCapabilities.manifest();
assert(manifest.length === 15, 'manifest has 15 entries');
const fillText = manifest.find(m => m.name === 'fill_text');
assert(fillText && fillText.description.length > 0, 'fill_text has description');
assert(fillText && fillText.widgetTypes.length > 0, 'fill_text has widget types');

console.log('\n=== Dispatch: fill_text ===');
(async () => {
  // Mock element
  const mockInput = {
    tagName: 'INPUT', type: 'text', value: '',
    focus: () => {}, blur: () => {},
    dispatchEvent: () => {},
    scrollIntoView: () => {},
  };
  // Simulate native setter
  context.HTMLInputElement = { prototype: {} };
  Object.defineProperty(context.HTMLInputElement.prototype, 'value', {
    set: function (v) { this._v = v; },
    get: function () { return this._v || ''; },
  });

  const result = await context.ccCapabilities.dispatch(
    { action: 'fill_text', value: 'Kamaljeet', timeout_ms: 5000 },
    { element: mockInput, widgetType: 'input-text' }
  );
  assert(result.status === 'success', 'fill_text dispatches successfully');
  assert(typeof result.duration_ms === 'number', 'fill_text reports duration');

  console.log('\n=== Dispatch: missing action ===');
  const badResult = await context.ccCapabilities.dispatch(
    { action: 'nonexistent_action' },
    {}
  );
  assert(badResult.status === 'failed', 'unknown action returns failed');
  assert(badResult.error.includes('capability_not_found'), 'error identifies missing capability');

  console.log('\n=== Dispatch: no action name ===');
  const noName = await context.ccCapabilities.dispatch({}, {});
  assert(noName.status === 'failed', 'no action name returns failed');
  assert(noName.error === 'no_action_name', 'error is no_action_name');

  console.log('\n=== Validation ===');
  const noValue = await context.ccCapabilities.dispatch(
    { action: 'fill_text', value: null, timeout_ms: 1000 },
    { element: mockInput, widgetType: 'input-text' }
  );
  assert(noValue.status === 'failed', 'fill_text without value fails validation');
  assert(noValue.error.includes('validation'), 'error mentions validation');

  console.log('\n=== Dispatch: check ===');
  const mockCheckbox = {
    tagName: 'INPUT', type: 'checkbox', checked: false,
    focus: () => {}, dispatchEvent: () => {},
  };
  const checkResult = await context.ccCapabilities.dispatch(
    { action: 'check', value: 'true', timeout_ms: 5000 },
    { element: mockCheckbox, widgetType: 'input-checkbox' }
  );
  assert(checkResult.status === 'success', 'check dispatches successfully');
  assert(mockCheckbox.checked === true, 'checkbox is now checked');

  console.log('\n=== Dispatch: wait_time ===');
  const t0 = Date.now();
  const waitResult = await context.ccCapabilities.dispatch(
    { action: 'wait_time', options: { ms: 50 }, timeout_ms: 5000 },
    {}
  );
  assert(waitResult.status === 'success', 'wait_time succeeds');
  assert(waitResult.duration_ms >= 45, 'wait_time actually waits');

  console.log('\n=== Dispatch: navigate validation ===');
  const navBad = await context.ccCapabilities.dispatch(
    { action: 'navigate', value: null, timeout_ms: 1000 },
    {}
  );
  assert(navBad.status === 'failed', 'navigate without URL fails validation');

  console.log('\n=== Widget Resolution ===');
  const mockSelect = { tagName: 'SELECT', getAttribute: () => null, closest: () => null };
  const mockNgSelect = { tagName: 'DIV', getAttribute: () => null, closest: (s) => s === '.ng-select' ? {} : null };
  const mockMatSelect = { tagName: 'MAT-SELECT', getAttribute: () => null, closest: () => null };
  const mockCombobox = { tagName: 'DIV', getAttribute: (a) => a === 'role' ? 'combobox' : null, closest: () => null };

  assert(context.ccCapabilities.resolveWidgetType(mockSelect) === 'native-select', 'resolves native select');
  assert(context.ccCapabilities.resolveWidgetType(mockNgSelect) === 'ng-select', 'resolves ng-select');
  assert(context.ccCapabilities.resolveWidgetType(mockMatSelect) === 'mat-select', 'resolves mat-select');
  assert(context.ccCapabilities.resolveWidgetType(mockCombobox) === 'combobox', 'resolves combobox');
  assert(context.ccCapabilities.resolveWidgetType(null) === 'unknown', 'null element returns unknown');

  console.log('\n=== Custom Capability Registration ===');
  context.ccCapabilities.register({
    name: 'select_option',
    description: 'Custom ng-select handler',
    widgetTypes: ['ng-select'],
    priority: 10,  // higher than default
    handler: async function () { return { status: 'success', actual_value: 'ng-custom' }; },
  });
  const selectManifest = manifest.find(m => m.name === 'select_option');
  // Re-fetch since we added a handler
  const updatedCaps = context.ccCapabilities.manifest();
  const selectCap = updatedCaps.find(m => m.name === 'select_option');
  assert(selectCap && selectCap.handlers === 2, 'select_option now has 2 handlers');

  // Dispatch with ng-select widget type should use custom handler
  const ngResult = await context.ccCapabilities.dispatch(
    { action: 'select_option', value: 'Bihar', timeout_ms: 5000 },
    { element: {}, widgetType: 'ng-select' }
  );
  assert(ngResult.status === 'success', 'ng-select handler dispatched');
  assert(ngResult.actual_value === 'ng-custom', 'ng-select custom handler used');

  console.log('\n=== Timeout Handling ===');
  context.ccCapabilities.register({
    name: 'slow_action',
    description: 'Deliberately slow',
    widgetTypes: ['*'],
    handler: async function () {
      await new Promise(r => setTimeout(r, 200));
      return { status: 'success' };
    },
  });
  const timeoutResult = await context.ccCapabilities.dispatch(
    { action: 'slow_action', timeout_ms: 50 },
    {}
  );
  assert(timeoutResult.status === 'timeout', 'slow action times out');
  assert(timeoutResult.error === 'timeout', 'timeout error message');

  console.log('\n─────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
