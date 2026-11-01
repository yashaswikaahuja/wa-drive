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
    click() { events.push('native-click'); },
    closest() { return extra.form || null; },
  };
  return el;
}

function docWith(buttons) {
  return {
    querySelectorAll(sel) {
      if (String(sel).indexOf('button') !== -1) return buttons;
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
assert('native click ran', search.events.indexOf('native-click') !== -1, true);
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

console.log('\nA class cell is listed and pressed before Book Now');
function classCell(label, className) {
  const events = [];
  return {
    tagName: 'TD',
    id: '',
    className: className || 'link',
    innerText: label,
    textContent: label,
    events,
    getAttribute() { return null; },
    dispatchEvent(ev) { events.push(ev.type); return true; },
    click() { events.push('native-click'); },
  };
}
const sl = classCell('SL AVAILABLE-0042');
const noise = classCell('Refresh route', 'plain');
const fare = classCell('3A WL 12');
const avail = classCell('GNWL 4/WL 4', 'link');
const chip = classCell('SL', '');
chip.tagName = 'DIV';
const named = classCell('Sleeper (SL)', 'pre-avl');
named.tagName = 'DIV';
named.closest = function (sel) { return String(sel).indexOf('bull-back') !== -1 ? {} : null; };
const filterLabel = classCell('Sleeper (SL)', 'css-label');
filterLabel.tagName = 'LABEL';
filterLabel.closest = function () { return null; };
const classDoc = docWith([book, sl, noise, fare, avail, chip, named, filterLabel]);
const classFields = api.list(classDoc);
assert('book plus class cells', classFields.length, 6);
assert('sleeper label', classFields[1].visualLabel, 'SL AVAILABLE-0042');
assert('ac label', classFields[2].visualLabel, '3A WL 12');
assert('availability row', classFields[3].visualLabel, 'GNWL 4/WL 4');
assert('class chip', classFields[4].visualLabel, 'SL');
assert('named class inside the train card', classFields[5].visualLabel, 'Sleeper (SL)');
const classPress = api.press(classFields[1], classDoc);
assert('class cell pressed', classPress.pressed, true);
assert('class native click', sl.events.indexOf('native-click') !== -1, true);
assert('book still idle', book.events.length, 0);

console.log('\nCustom radios, checkboxes, and short links are clickable');
function choice(tag, label, extra: any = {}) {
  const events = [];
  const el: any = {
    tagName: tag,
    id: extra.id || '',
    className: extra.className || '',
    innerText: label,
    textContent: label,
    events,
    getAttribute(name) {
      if (name === 'role') return extra.role || null;
      if (name === 'for') return extra.htmlFor || null;
      if (name === 'href') return extra.href || null;
      if (name === 'aria-label') return extra.aria || null;
      return null;
    },
    dispatchEvent(ev) { events.push(ev.type); return true; },
    click() { events.push('native-click'); },
    closest(sel) {
      if (extra.inHeader && String(sel).indexOf('header') !== -1) return {};
      return null;
    },
    querySelector() { return extra.innerInput || null; },
  };
  return el;
}
const male = choice('LABEL', 'Male', { className: 'custom-control-label', htmlFor: 'gender-male' });
const yes = choice('LABEL', 'Yes', { htmlFor: 'yes' });
const home = choice('A', 'Home', { href: '/home' });
const tree = choice('SPAN', 'Desktop', { className: 'rct-title' });
const navLink = choice('A', 'Login', { href: '/login', inHeader: true });
const choiceDoc = docWith([male, yes, home, tree, navLink]);
const choiceFields = api.list(choiceDoc);
assert('four choices, nav link skipped', choiceFields.length, 4);
assert('male label', choiceFields[0].visualLabel, 'Male');
assert('yes label', choiceFields[1].visualLabel, 'Yes');
assert('home link', choiceFields[2].visualLabel, 'Home');
assert('home link type', choiceFields[2].type, 'link');
assert('tree title', choiceFields[3].visualLabel, 'Desktop');
const malePress = api.press(choiceFields[0], choiceDoc);
assert('male pressed', malePress.pressed, true);
assert('male native click', male.events.indexOf('native-click') !== -1, true);
assert('yes idle', yes.events.length, 0);

console.log('\nAutocomplete option rows are clickable');
const red = choice('DIV', 'Red', { role: 'option', className: 'auto-complete__option' });
const optDoc = docWith([red]);
const optFields = api.list(optDoc);
assert('option listed', optFields.length, 1);
assert('option label', optFields[0].visualLabel, 'Red');
const optPress = api.press(optFields[0], optDoc);
assert('option pressed', optPress.pressed, true);
assert('option native click', red.events.indexOf('native-click') !== -1, true);

console.log('\nfindByText finds listed links and extra anchors');
const dropdown = choice('A', 'Dropdown', { href: '/dropdown' });
const dropDoc = {
  querySelectorAll(sel) {
    const s = String(sel);
    if (s.indexOf('button') !== -1 || s === 'a[href]') return [dropdown];
    if (sel.charAt(0) === '#') return [];
    return [];
  },
};
const listedLink = api.findByText('Dropdown', dropDoc);
assert('findByText listed', listedLink.field && listedLink.field.visualLabel, 'Dropdown');
assert('findByText type link', listedLink.field && listedLink.field.type, 'link');
const longLabel = 'A very long documentation link that exceeds sixty characters of visible text';
const longLink = choice('A', longLabel, { href: '/docs' });
const longDoc = {
  querySelectorAll(sel) {
    const s = String(sel);
    if (s.indexOf('button') !== -1) return [longLink];
    if (s === 'a[href]') return [longLink];
    return [];
  },
};
const extraLink = api.findByText(longLabel, longDoc);
assert('findByText extra anchor', extraLink.field && extraLink.field.type, 'link');
assert('findByText extra label', extraLink.field && extraLink.field.visualLabel, longLabel);

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\n' + passed + ' passed');
