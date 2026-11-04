import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as esbuild from 'esbuild';

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, '../src/jquery-interaction-adapter.ts'), 'utf8');
const built = await esbuild.transform(source, { loader: 'ts', target: 'es2018' });
class MockEvent { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
class MockCustomEvent extends MockEvent {}
const scope = { Event: MockEvent, CustomEvent: MockCustomEvent };
new Function('globalThis', 'Event', 'CustomEvent', built.code)(scope, MockEvent, MockCustomEvent);
const api = scope.CcJQueryInteractionAdapter;
let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log('PASS', name); passed++; }
  else { console.error('FAIL', name); failed++; }
}
function element() {
  const events = [];
  return {
    tagName: 'INPUT', value: '',
    ownerDocument: { defaultView: { Event: MockEvent, CustomEvent: MockCustomEvent, HTMLInputElement: { prototype: {} } } },
    dispatchEvent(event) { events.push(event); return true; },
    click() { events.push({ type: 'click-method' }); },
    events
  };
}
const input = element();
const result = api.setValue(input, 'Bihar', { events: ['input', 'change'] });
check('native setter writes value', input.value === 'Bihar');
check('setValue verifies value', result.success && result.verified);
check('input and change events dispatched', input.events.map(e => e.type).join(',') === 'input,change');
check('native fallback identified', result.strategy === 'native-setter');
const custom = api.trigger(input, 'cc:updated', { source: 'test' });
check('custom event dispatched', custom.success && custom.strategy === 'native-event');
check('custom event detail retained', input.events[input.events.length - 1].detail.source === 'test');
const clicked = api.click(input);
check('click calls native element.click', clicked.success && input.events.some(e => e.type === 'click-method'));
const handler = api.triggerHandler(input, 'change');
check('triggerHandler reports isolated-world limitation', !handler.success && handler.reason === 'jquery-triggerHandler-unavailable');
console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
