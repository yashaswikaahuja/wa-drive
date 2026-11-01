/**
 * choose-autocomplete.test.ts — the suggestion must be the station that was typed.
 *
 * Run: node --experimental-strip-types packages/cc-executor/tests/choose-autocomplete.test.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/choose-autocomplete.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const globalLike: any = {};
new Function('globalThis', src)(globalLike);
const api = globalLike.CcChooseAutocomplete;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}

const labels = ['SURATGARH - SGO', 'SURAT - ST', 'PUNE JN - PUNE', 'NEW DELHI - NDLS', 'DELHI - DLI'];

console.log('\nMatch the typed station, not a longer name');
const surat = api.best(labels, 'SURAT');
assert('surat label', surat && surat.label, 'SURAT - ST');
assert('suratgarh is not the match', surat && surat.label !== 'SURATGARH - SGO', true);

const pune = api.best(labels, 'PUNE');
assert('pune label', pune && pune.label, 'PUNE JN - PUNE');

const delhi = api.best(labels, 'NEW DELHI');
assert('new delhi label', delhi && delhi.label, 'NEW DELHI - NDLS');

assert('empty value has no option', api.best(labels, ''), null);
assert('unknown city has no option', api.best(labels, 'MUMBAI'), null);

console.log('\nchoose clicks that option');
const events: string[] = [];
function option(text) {
  return {
    innerText: text,
    textContent: text,
    dispatchEvent() { events.push('click:' + text); return true; },
    click() { events.push('native:' + text); },
  };
}
const doc = {
  querySelectorAll() { return [option('SURATGARH - SGO'), option('SURAT - ST')]; },
};
const chosen = api.choose(doc, 'SURAT');
assert('pressed', chosen.pressed, true);
assert('clicked the matching row', chosen.clicked, 'SURAT - ST');
assert('native click on SURAT', events.indexOf('native:SURAT - ST') !== -1, true);
assert('suratgarh was not clicked', events.some((e) => e.indexOf('SURATGARH') !== -1), false);

console.log('\nDemoQA and react-select option rows');
const demoEvents: string[] = [];
const demoOpt = {
  innerText: 'Red',
  textContent: 'Red',
  className: 'auto-complete__option',
  dispatchEvent() { demoEvents.push('click:Red'); return true; },
  click() { demoEvents.push('native:Red'); },
};
const demoDoc = {
  querySelectorAll(sel) {
    if (String(sel).indexOf('auto-complete__option') === -1) return [];
    return [demoOpt];
  },
};
const demo = api.choose(demoDoc, 'Red');
assert('demoqa option pressed', demo.pressed, true);
assert('demoqa clicked Red', demo.clicked, 'Red');
assert('demoqa native click', demoEvents.indexOf('native:Red') !== -1, true);

console.log('\ntypeKeepFocus leaves the input focused');
const typedEvents: string[] = [];
const box: any = {
  tagName: 'INPUT',
  value: '',
  focus() { typedEvents.push('focus'); },
  click() { typedEvents.push('click'); },
  select() { typedEvents.push('select'); },
  blur() { typedEvents.push('blur'); },
  dispatchEvent(ev) { typedEvents.push(ev.type + ':' + (ev.key || ev.data || '')); return true; },
};
api.typeKeepFocus(box, 'Red');
assert('typed value', box.value, 'Red');
assert('no tab', typedEvents.some((e) => e.indexOf('Tab') !== -1), false);
assert('no blur', typedEvents.indexOf('blur'), -1);
assert('input events', typedEvents.filter((e) => e.indexOf('input:') === 0).length >= 3, true);

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\n' + passed + ' passed');
