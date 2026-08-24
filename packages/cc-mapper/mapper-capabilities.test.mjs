/**
 * mapper-capabilities.test.mjs — TypeScript ESM sources via Node strip-types.
 */
import { getFieldAliases, FIELD_ALIASES } from './src/field-aliases.ts';
import { normalizeIdent, labelPrimaryIdent, normChoice } from './src/field-ident.ts';
import { resolveChoiceToOption } from './src/resolve-choice.ts';
import { decideConditionalChoice } from './src/decide-conditional.ts';

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

console.log('\nCcFieldAliases (TS)');
assert('FIELD_ALIASES has name key', Array.isArray(FIELD_ALIASES.name), true);
assert('FIELD_ALIASES has dob key', Array.isArray(FIELD_ALIASES.dob), true);
const base = getFieldAliases([]);
assert('base aliases has name', !!base.name, true);
assert('name includes fullname', base.name.includes('fullname'), true);
const server = [{ semantic_key: 'name', match_patterns: ['custom_name_field'] }];
const merged = getFieldAliases(server);
assert('server pattern merged into name', merged.name.includes('custom_name_field'), true);
assert('existing patterns preserved', merged.name.includes('fullname'), true);
const server2 = [{ semantic_key: 'custom_key', match_patterns: ['my_field'] }];
const merged2 = getFieldAliases(server2);
assert('new server key created', Array.isArray(merged2.custom_key), true);
assert('new server key has pattern', merged2.custom_key.includes('my_field'), true);
const serverDup = [{ semantic_key: 'name', match_patterns: ['fullname'] }];
const mergedDup = getFieldAliases(serverDup);
const count = mergedDup.name.filter((p) => p === 'fullname').length;
assert('duplicate patterns not doubled', count, 1);

console.log('\nCcFieldIdent (TS)');
assert('normalizeIdent lowercases', normalizeIdent('Full Name'), 'full_name');
assert('normalizeIdent collapses separators', normalizeIdent('first-name: '), 'first_name');
assert('normalizeIdent trims underscores', normalizeIdent('_name_'), 'name');
assert('normalizeIdent handles empty', normalizeIdent(''), '');
assert('normChoice strips non-alphanumeric', normChoice('Full Name!'), 'fullname');
assert('normChoice lowercases', normChoice('YES'), 'yes');
assert('normChoice empty', normChoice(''), '');
const f1 = { label: 'Full Name', id: 'txt1', name: 'name1', placeholder: '' };
const r1 = labelPrimaryIdent(f1);
assert('strong label → matchBy=label', r1.matchBy, 'label');
assert('strong label ident includes fullname', r1.ident.includes('full_name'), true);
assert('labelStrong=true', r1.labelStrong, true);
const f2 = { label: 'X', id: 'myid', name: 'myname', placeholder: '' };
const r2 = labelPrimaryIdent(f2);
assert('weak label → matchBy=dom-fallback', r2.matchBy, 'dom-fallback');
const f3 = { label: 'पिता का नाम', id: '', name: '', placeholder: '' };
const r3 = labelPrimaryIdent(f3);
assert('Hindi-only label labelStrong=true (≥4 chars)', r3.labelStrong, true);

console.log('\nCcResolveChoice (TS)');
const radioField = {
  type: 'radio-group', label: 'Gender', selector: '[name=gender]',
  options: ['Male', 'Female', 'Other'],
  optionSelectors: ['#m', '#f', '#o'],
};
const r = resolveChoiceToOption(radioField, 'Female', 'gender');
assert('radio-group exact match', r.selector, '#f');
assert('radio-group type=radio-click', r.entry.type, 'radio-click');
const r2g = resolveChoiceToOption(radioField, 'F', 'gender');
assert('gender synonym F → Female', r2g && r2g.selector, '#f');
const yesnoField = { type: 'radio-group', label: 'Changed name?', selector: '[name=changed]', options: ['Yes', 'No'], optionSelectors: ['#yes', '#no'] };
assert('yes resolves to Yes option', resolveChoiceToOption(yesnoField, 'Yes', null).selector, '#yes');
assert('no resolves to No option', resolveChoiceToOption(yesnoField, 'No', null).selector, '#no');
assert('aadhaar free-text rejected on yes/no', resolveChoiceToOption(yesnoField, '123456789012', null), null);
const cbField = { type: 'checkbox', selector: '#agree', label: 'I agree', options: [] };
assert('checkbox yes', resolveChoiceToOption(cbField, 'yes', null).entry.value, 'yes');
assert('checkbox no', resolveChoiceToOption(cbField, 'no', null).entry.value, 'no');
assert('checkbox free-text rejected', resolveChoiceToOption(cbField, 'random text here', null), null);
assert('null plannedValue → null', resolveChoiceToOption(radioField, null, null), null);
assert('empty plannedValue → null', resolveChoiceToOption(radioField, '', null), null);

console.log('\nCcDecideConditional (TS)');
const profile = { gender: 'Female', marital_status: 'Single', is_pwd: '0', ex_serviceman: '0' };
assert('gender field → Female', decideConditionalChoice({ label: 'Gender', name: '', id: '' }, profile), 'Female');
assert('marital field → Single', decideConditionalChoice({ label: 'Marital Status', name: '', id: '' }, profile), 'Single');
assert('disability No', decideConditionalChoice({ label: 'Are you a PwD/disability candidate?', name: 'is_pwd', id: '' }, profile), 'No');
assert('ex-serviceman No', decideConditionalChoice({ label: 'Ex-Serviceman', name: 'ex_service', id: '' }, profile), 'No');
assert('changed name No (not in profile)', decideConditionalChoice({ label: 'Have you changed name?', name: '', id: '' }, profile), 'No');
assert('declaration Yes', decideConditionalChoice({ label: 'I agree and consent', name: '', id: '' }, profile), 'Yes');
assert('unrelated field → null', decideConditionalChoice({ label: 'Email Address', name: 'email', id: 'email' }, profile), null);
assert('changed name Yes when profile has it', decideConditionalChoice({ label: 'Have you changed name?', name: '', id: '' }, { changed_name: 'Rahul' }), 'Yes');
assert('same address defaults Yes', decideConditionalChoice({ label: 'Is correspondence address same?', name: '', id: '' }, {}), 'Yes');

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
