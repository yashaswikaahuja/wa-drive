/**
 * rule-engine.test.mjs — plain Node, no framework
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, 'rule-engine.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { evaluateField, _normVal, _typeGroup, _condMet, _ruleMet, _formatDate } = root.CcRuleEngine;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── _normVal ──────────────────────────────────────────────────────────────────
console.log('\n_normVal');
assert('null → empty', _normVal(null), '');
assert('trims and lowercases', _normVal('  YES  '), 'yes');

// ── _typeGroup ────────────────────────────────────────────────────────────────
console.log('\n_typeGroup');
assert('dropdown', _typeGroup('dropdown'), 'dropdown');
assert('select',   _typeGroup('select'), 'dropdown');
assert('mat-select', _typeGroup('mat-select'), 'dropdown');
assert('ng-dropdown', _typeGroup('ng-dropdown'), 'dropdown');
assert('radio',    _typeGroup('radio'), 'radio');
assert('radio-group', _typeGroup('radio-group'), 'radio');
assert('checkbox', _typeGroup('checkbox'), 'checkbox');
assert('mat-checkbox', _typeGroup('mat-checkbox'), 'checkbox');
assert('date',     _typeGroup('date'), 'date');
assert('text',     _typeGroup('text'), 'text');
assert('unknown → text', _typeGroup('foobar'), 'text');

// ── _condMet ──────────────────────────────────────────────────────────────────
console.log('\n_condMet');
const p = { gender: 'Female', age: '25', name: '' };
assert('eq match', _condMet({ key: 'gender', op: 'eq', value: 'Female' }, p), true);
assert('eq no match', _condMet({ key: 'gender', op: 'eq', value: 'Male' }, p), false);
assert('neq', _condMet({ key: 'gender', op: 'neq', value: 'Male' }, p), true);
assert('contains', _condMet({ key: 'gender', op: 'contains', value: 'fem' }, p), true);
assert('notEmpty', _condMet({ key: 'gender', op: 'notEmpty' }, p), true);
assert('empty', _condMet({ key: 'name', op: 'empty' }, p), true);
assert('unknown op → false', _condMet({ key: 'gender', op: 'gt', value: '0' }, p), false);

// ── _formatDate ───────────────────────────────────────────────────────────────
console.log('\n_formatDate');
assert('DD/MM/YYYY default', _formatDate('01/06/1990', ''), '01/06/1990');
assert('DD-MM-YYYY hint', _formatDate('01/06/1990', 'dd-mm-yyyy'), '01-06-1990');
assert('YYYY-MM-DD hint', _formatDate('01/06/1990', 'yyyy-mm-dd'), '1990-06-01');

// ── evaluateField ─────────────────────────────────────────────────────────────
console.log('\nevaluateField — skip');
assert('null entry → skip', evaluateField(null, {}, {}, {}), { kind: 'skip' });
assert('mode=skip → skip', evaluateField({ fillMode: 'skip' }, {}, {}, {}), { kind: 'skip' });

console.log('\nevaluateField — always');
assert('mode=always → check:true', evaluateField({ fillMode: 'always' }, {}, {}, {}), { kind: 'check', check: true });

console.log('\nevaluateField — constant');
assert('constant text', evaluateField({ fillMode: 'constant', constantValue: 'Delhi' }, { type: 'text' }, {}, {}), { kind: 'option', option: 'Delhi' });
assert('constant empty → skip', evaluateField({ fillMode: 'constant', constantValue: '' }, { type: 'text' }, {}, {}), { kind: 'skip' });

console.log('\nevaluateField — match text');
assert('match text value', evaluateField({ fillMode: 'match', profileKey: 'name' }, { type: 'text' }, { name: 'Rahul' }, {}), { kind: 'value', value: 'Rahul' });
assert('match missing key → skip', evaluateField({ fillMode: 'match', profileKey: 'name' }, { type: 'text' }, {}, {}), { kind: 'skip' });

console.log('\nevaluateField — condition');
const entry = {
  fillMode: 'condition',
  rules: [
    { when: [{ key: 'gender', op: 'eq', value: 'Female' }], then: 'F' },
    { when: [{ key: 'gender', op: 'eq', value: 'Male' }],   then: 'M' },
  ],
  fallback: 'O',
};
assert('condition match Female', evaluateField(entry, { type: 'radio-group' }, { gender: 'Female' }, {}), { kind: 'option', option: 'F' });
assert('condition match Male', evaluateField(entry, { type: 'radio-group' }, { gender: 'Male' }, {}), { kind: 'option', option: 'M' });
assert('condition fallback', evaluateField(entry, { type: 'radio-group' }, { gender: 'Other' }, {}), { kind: 'option', option: 'O' });

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
