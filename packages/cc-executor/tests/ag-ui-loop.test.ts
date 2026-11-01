/**
 * ag-ui-loop.test.ts — a field that stays the typed word blocks the next field.
 *
 * Run: node --experimental-strip-types packages/cc-executor/tests/ag-ui-loop.test.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/ag-ui-loop.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const globalLike: any = {};
new Function('globalThis', src)(globalLike);
const api = globalLike.CcAgUiLoop;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

assert('option text landed', api.landed('SURAT', 'SURAT - ST GUJARAT', 'SURAT - ST GUJARAT'), true);
assert('typed word did not land', api.landed('SURAT', 'SURAT', 'SURAT - ST GUJARAT'), false);
assert('plain date landed', api.landed('15/11/2026', '15/11/2026', ''), true);
assert('chip pick with empty input landed', api.landed('Red', '', 'Red'), true);
assert('empty station after a long option did not land', api.landed('SURAT', '', 'SURAT - ST GUJARAT'), false);

function harness(values) {
  const filled = [];
  const pressed = [];
  const deps = {
    resolve(_selector) { return { value: values[_selector] || '', getAttribute() { return null; } }; },
    async fill(field) { filled.push(field.selector); values[field.selector] = String(field.value); },
    open() {},
    choose(value) {
      if (value === 'PUNE') {
        values['to'] = 'PUNE JN. - PUNE (PUNE) MAHARASHTRA';
        return { pressed: true, clicked: values['to'] };
      }
      return { pressed: true, clicked: 'SURAT - ST GUJARAT' };
    },
    press(field) { pressed.push(field.selector); return { pressed: true, clicked: 'Search Trains', selector: field.selector }; },
    async sleep() {},
    url() { return 'https://www.irctc.co.in/nget/train-search'; },
    title() { return 'IRCTC'; },
  };
  return { deps, filled, pressed };
}

const fields = [
  { selector: 'from', value: 'SURAT', type: 'text', visualLabel: 'Enter From station. Input is Mandatory.' },
  { selector: 'to', value: 'PUNE', type: 'text', visualLabel: 'Enter To station. Input is Mandatory.' },
  { selector: 'date', value: '15/11/2026', type: 'text', visualLabel: 'DD/MM/YYYY' },
  { selector: 'button.search_btn', value: 'click', type: 'button', visualLabel: 'Search Trains' },
];

console.log('\nFrom stays SURAT, so To and Search do not run');
const stuck = harness({ from: '', to: '', date: '' });
const stopped = await api.run(fields, {}, stuck.deps);
assert('loop stopped', stopped.stopped, true);
assert('from was retried', stuck.filled.filter((s) => s === 'from').length, 2);
assert('to was not filled', stuck.filled.indexOf('to'), -1);
assert('search was not pressed', stuck.pressed.length, 0);
assert('from result', stopped.records[0].result, 'not_landed');
assert('to skipped', stopped.records[1].failReason, 'previous_field');
assert('search skipped', stopped.records[3].result, 'skipped');

console.log('\nBoth stations land, then the date, then the button');
const goodValues = { from: '', to: '', date: '' };
const good = harness(goodValues);
good.deps.choose = (value) => {
  if (value === 'SURAT') {
    goodValues.from = 'SURAT - ST GUJARAT';
    return { pressed: true, clicked: goodValues.from };
  }
  goodValues.to = 'PUNE JN. - PUNE (PUNE) MAHARASHTRA';
  return { pressed: true, clicked: goodValues.to };
};
let page = 'https://www.irctc.co.in/nget/train-search';
good.deps.press = (field) => {
  good.pressed.push(field.selector);
  page = 'https://www.irctc.co.in/nget/train-list';
  return { pressed: true, clicked: 'Search Trains', selector: field.selector };
};
good.deps.url = () => page;
const done = await api.run(fields, {}, good.deps);
assert('loop finished', done.stopped, false);
assert('from chosen', done.records[0].result, 'chosen');
assert('from actual', done.records[0].actualValue, 'SURAT - ST GUJARAT');
assert('to chosen', done.records[1].result, 'chosen');
assert('date filled', done.records[2].result, 'filled');
assert('search clicked', done.records[3].result, 'clicked');

console.log('\nCheckbox on vs true, then the next field still fills');
const boxes = [
  { selector: '#agree', value: 'true', type: 'checkbox', visualLabel: 'I agree' },
  { selector: '#city', value: 'Gaya', type: 'text', visualLabel: 'City' },
];
const boxVals: any = { '#agree': 'on', '#city': '' };
const boxEl: any = { type: 'checkbox', checked: true, value: 'on', tagName: 'INPUT' };
const boxDeps = {
  resolve(sel) { return sel === '#agree' ? boxEl : { value: boxVals[sel] || '', getAttribute() { return null; } }; },
  async fill(field) { if (field.selector === '#city') boxVals['#city'] = String(field.value); },
  open() {},
  choose() { return { pressed: false, clicked: '' }; },
  press() { return { pressed: false, reason: 'not_found', clicked: '' }; },
  async sleep() {},
  url() { return 'https://example.com'; },
  title() { return 'Form'; },
};
const boxRun = await api.run(boxes, {}, boxDeps);
assert('checkbox filled from on', boxRun.records[0].result, 'filled');
assert('city still filled after checkbox', boxRun.records[1].result, 'filled');
assert('checkbox mismatch did not stop the loop', boxRun.stopped, false);

console.log('\nSelect Option 2 vs value 2 counts as filled');
const selEl: any = {
  tagName: 'SELECT',
  type: 'select-one',
  value: '2',
  selectedIndex: 1,
  options: [{ text: 'Please select', value: '', index: 0 }, { text: 'Option 2', value: '2', index: 1 }],
  getAttribute() { return null; },
};
const selRun = await api.run(
  [{ selector: '#dropdown', value: 'Option 2', type: 'dropdown', visualLabel: 'Dropdown' }],
  {},
  {
    resolve() { return selEl; },
    async fill() {},
    open() {},
    choose() { return { pressed: false, clicked: '' }; },
    press() { return { pressed: false, reason: 'not_found', clicked: '' }; },
    async sleep() {},
    url() { return 'https://the-internet.herokuapp.com/dropdown'; },
    title() { return 'Dropdown'; },
  },
);
assert('select label matches value', selRun.records[0].result, 'filled');

console.log('\nExact autocomplete option with the typed word still in the box is chosen');
const colorEl: any = { value: 'Red', getAttribute(name) { return name === 'aria-autocomplete' ? 'list' : null; } };
const colorRun = await api.run(
  [{ selector: '#autoCompleteSingleInput', value: 'Red', type: 'text', visualLabel: 'Color' }],
  {},
  {
    resolve() { return colorEl; },
    async fill() { colorEl.value = 'Red'; },
    open() {},
    choose() { return { pressed: true, clicked: 'Red' }; },
    press() { return { pressed: false, reason: 'not_found', clicked: '' }; },
    async sleep() {},
    url() { return 'https://demoqa.com/auto-complete'; },
    title() { return 'demosite'; },
  },
);
assert('exact option chosen', colorRun.records[0].result, 'chosen');

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\n' + passed + ' passed');
