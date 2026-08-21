/**
 * mapper-capabilities.test.mjs — tests for field-aliases, field-ident,
 * resolve-choice, decide-conditional. Plain Node, no framework, no jsdom.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function load(name) {
  const src = readFileSync(path.join(__dirname, name), 'utf8');
  const r = {};
  new Function('globalThis', src)(r);
  return r;
}

const { CcFieldAliases }      = load('field-aliases.js');
const { CcFieldIdent }        = load('field-ident.js');
const { CcResolveChoice }     = load('resolve-choice.js');
const { CcDecideConditional } = load('decide-conditional.js');

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── CcFieldAliases ────────────────────────────────────────────────────────────
console.log('\nCcFieldAliases');
const { getFieldAliases, FIELD_ALIASES } = CcFieldAliases;

assert('FIELD_ALIASES has name key', Array.isArray(FIELD_ALIASES.name), true);
assert('FIELD_ALIASES has dob key', Array.isArray(FIELD_ALIASES.dob), true);

// No server mappings → base aliases
const base = getFieldAliases([]);
assert('base aliases has name', !!base.name, true);
assert('name includes fullname', base.name.includes('fullname'), true);

// Server mappings merged
const server = [{ semantic_key: 'name', match_patterns: ['custom_name_field'] }];
const merged = getFieldAliases(server);
assert('server pattern merged into name', merged.name.includes('custom_name_field'), true);
assert('existing patterns preserved', merged.name.includes('fullname'), true);

// New key from server
const server2 = [{ semantic_key: 'custom_key', match_patterns: ['my_field'] }];
const merged2 = getFieldAliases(server2);
assert('new server key created', Array.isArray(merged2.custom_key), true);
assert('new server key has pattern', merged2.custom_key.includes('my_field'), true);

// Duplicate patterns not doubled
const serverDup = [{ semantic_key: 'name', match_patterns: ['fullname'] }];
const mergedDup = getFieldAliases(serverDup);
const count = mergedDup.name.filter(p => p === 'fullname').length;
assert('duplicate patterns not doubled', count, 1);

// ── CcFieldIdent ──────────────────────────────────────────────────────────────
console.log('\nCcFieldIdent');
const { normalizeIdent, labelPrimaryIdent, normChoice } = CcFieldIdent;

assert('normalizeIdent lowercases', normalizeIdent('Full Name'), 'full_name');
assert('normalizeIdent collapses separators', normalizeIdent('first-name: '), 'first_name');
assert('normalizeIdent trims underscores', normalizeIdent('_name_'), 'name');
assert('normalizeIdent handles empty', normalizeIdent(''), '');

assert('normChoice strips non-alphanumeric', normChoice('Full Name!'), 'fullname');
assert('normChoice lowercases', normChoice('YES'), 'yes');
assert('normChoice empty', normChoice(''), '');

// labelPrimaryIdent — strong label
const f1 = { label: 'Full Name', id: 'txt1', name: 'name1', placeholder: '' };
const r1 = labelPrimaryIdent(f1);
assert('strong label → matchBy=label', r1.matchBy, 'label');
assert('strong label ident includes fullname', r1.ident.includes('full_name'), true);
assert('labelStrong=true', r1.labelStrong, true);

// labelPrimaryIdent — weak label (single char), falls back to DOM
const f2 = { label: 'X', id: 'myid', name: 'myname', placeholder: '' };
const r2 = labelPrimaryIdent(f2);
assert('weak label → matchBy=dom-fallback', r2.matchBy, 'dom-fallback');

// labelPrimaryIdent — bilingual label
const f3 = { label: 'पिता का नाम', id: '', name: '', placeholder: '' };
const r3 = labelPrimaryIdent(f3);
assert('Hindi-only label labelStrong=true (≥4 chars)', r3.labelStrong, true);

// ── CcResolveChoice ───────────────────────────────────────────────────────────
console.log('\nCcResolveChoice');
const { resolveChoiceToOption } = CcResolveChoice;

// radio-group exact match
const radioField = {
  type: 'radio-group', label: 'Gender', selector: '[name=gender]',
  options: ['Male', 'Female', 'Other'],
  optionSelectors: ['#m', '#f', '#o'],
};
const r = resolveChoiceToOption(radioField, 'Female', 'gender');
assert('radio-group exact match', r.selector, '#f');
assert('radio-group type=radio-click', r.entry.type, 'radio-click');

// radio-group gender synonym
const r2g = resolveChoiceToOption(radioField, 'F', 'gender');
assert('gender synonym F → Female', r2g && r2g.selector, '#f');

// yes/no group
const yesnoField = { type: 'radio-group', label: 'Changed name?', selector: '[name=changed]', options: ['Yes', 'No'], optionSelectors: ['#yes', '#no'] };
assert('yes resolves to Yes option', resolveChoiceToOption(yesnoField, 'Yes', null).selector, '#yes');
assert('no resolves to No option',  resolveChoiceToOption(yesnoField, 'No',  null).selector, '#no');

// free-text rejected on yes/no group
assert('aadhaar free-text rejected on yes/no', resolveChoiceToOption(yesnoField, '123456789012', null), null);

// checkbox
const cbField = { type: 'checkbox', selector: '#agree', label: 'I agree', options: [] };
assert('checkbox yes', resolveChoiceToOption(cbField, 'yes', null).entry.value, 'yes');
assert('checkbox no',  resolveChoiceToOption(cbField, 'no',  null).entry.value, 'no');
assert('checkbox free-text rejected', resolveChoiceToOption(cbField, 'random text here', null), null);

// null cases
assert('null plannedValue → null', resolveChoiceToOption(radioField, null, null), null);
assert('empty plannedValue → null', resolveChoiceToOption(radioField, '', null), null);

// ── CcDecideConditional ───────────────────────────────────────────────────────
console.log('\nCcDecideConditional');
const { decideConditionalChoice } = CcDecideConditional;

const profile = { gender: 'Female', marital_status: 'Single', is_pwd: '0', ex_serviceman: '0' };

assert('gender field → Female', decideConditionalChoice({ label: 'Gender', name: '', id: '' }, profile), 'Female');
assert('marital field → Single', decideConditionalChoice({ label: 'Marital Status', name: '', id: '' }, profile), 'Single');
assert('disability No', decideConditionalChoice({ label: 'Are you a PwD/disability candidate?', name: 'is_pwd', id: '' }, profile), 'No');
assert('ex-serviceman No', decideConditionalChoice({ label: 'Ex-Serviceman', name: 'ex_service', id: '' }, profile), 'No');
assert('changed name No (not in profile)', decideConditionalChoice({ label: 'Have you changed name?', name: '', id: '' }, profile), 'No');
assert('declaration Yes', decideConditionalChoice({ label: 'I agree and consent', name: '', id: '' }, profile), 'Yes');
assert('unrelated field → null', decideConditionalChoice({ label: 'Email Address', name: 'email', id: 'email' }, profile), null);

// changed_name = Yes when in profile
assert('changed name Yes when profile has it', decideConditionalChoice({ label: 'Have you changed name?', name: '', id: '' }, { changed_name: 'Rahul' }), 'Yes');

// same_address default
assert('same address defaults Yes', decideConditionalChoice({ label: 'Is correspondence address same?', name: '', id: '' }, {}), 'Yes');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
