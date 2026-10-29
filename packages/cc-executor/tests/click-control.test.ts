/**
 * click-control.test.ts — a JSON field presses the real button, not the wrapper text.
 *
 * Run from the package: node --experimental-strip-types ../../tooling/run-package-tests.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/click-control.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const globalLike: any = {};
new Function('globalThis', src)(globalLike);
const api = globalLike.CcClickControl;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}

function button(label, extra: any = {}) {
  const events = [];
  const el: any = {
    tagName: 'BUTTON',
    type: extra.type || 'submit',
    id: extra.id || '',
    className: extra.className || '',
    disabled: !!extra.disabled,
    innerText: label,
    textContent: label,
    events,
    form: extra.form || null,
    getAttribute(name) {
      if (name === 'type') return el.type;
      if (name === 'aria-disabled') return extra.ariaDisabled || null;
      if (name === 'aria-label') return extra.aria || null;
      return null;
    },
    dispatchEvent(ev) { events.push(ev.type); return true; },
    closest() { return extra.form || null; },
  };
  return el;
}

function docWith(buttons) {
  return {
    querySelectorAll(sel) {
      if (sel === 'button, input[type="submit"], input[type="button"], [role="button"]') return buttons;
      if (sel.charAt(0) === '#') return buttons.filter((b) => '#' + b.id === sel);
      if (sel.indexOf('.') !== -1) {
        const cls = sel.split('.')[1];
        return buttons.filter((b) => String(b.className).split(/\s+/).indexOf(cls) !== -1);
      }
      return [];
    },
  };
}

const search = button('Search Trains', { id: 'search', className: 'search_btn' });
const book = button('Book Now', { className: 'book_btn' });
const doc = docWith([search, book]);

console.log('\nJSON list names the buttons a person can press');
const fields = api.list(doc);
assert('two buttons', fields.length, 2);
assert('id selector', fields[0].selector, '#search');
assert('label is the visible words', fields[0].visualLabel, 'Search Trains');
assert('type is button', fields[0].type, 'button');

console.log('\nPress uses the JSON field');
const pressed = api.press(fields[0], doc);
assert('pressed', pressed.pressed, true);
assert('click event fired', search.events.indexOf('click') !== -1, true);
assert('pointerdown fired', search.events[0], 'pointerdown');
assert('book was not pressed', book.events.length, 0);
assert('clicked label', pressed.clicked, 'Search Trains');

console.log('\nA renamed label is not pressed');
search.events.length = 0;
const drifted = api.press({ selector: '#search', visualLabel: 'Book Now', type: 'button' }, doc);
assert('not pressed', drifted.pressed, false);
assert('reason is label drift', drifted.reason, 'label_drift');
assert('no click', search.events.length, 0);

console.log('\nA disabled button is not pressed');
const off = button('Search Trains', { id: 'off', disabled: true });
const offDoc = docWith([off]);
const offFields = api.list(offDoc);
assert('disabled stays in the json', offFields.length, 1);
const blocked = api.press(offFields[0], offDoc);
assert('not pressed', blocked.pressed, false);
assert('reason is disabled', blocked.reason, 'disabled');
assert('no click event', off.events.length, 0);

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\n' + passed + ' passed');
