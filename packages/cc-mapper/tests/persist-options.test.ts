import { isAjaxFieldOptions, mappingOptionsToStore } from '../src/persist-options.ts';

let passed = 0, failed = 0;
function assert(desc: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

console.log('\nmappingOptionsToStore');
assert('optionsDynamic wins over loaded option list',
  mappingOptionsToStore({ optionsDynamic: true, options: ['GAYA SADAR', 'TEKARI'] }),
  'dynamic');
assert('dependsOn means ajax even with a snapshot list',
  mappingOptionsToStore({ dependsOn: 'address.district', options: [{ text: 'Kotwali' }] }),
  'dynamic');
assert('options:"dynamic" stays dynamic',
  mappingOptionsToStore({ options: 'dynamic' }),
  'dynamic');
assert('existing dynamic is not frozen by a later snapshot',
  mappingOptionsToStore({ options: ['Aamas', 'Aanti'] }, { options: 'dynamic' }),
  'dynamic');
assert('static radio options still store as a list',
  mappingOptionsToStore({ options: ['Male', 'Female'] }),
  ['Male', 'Female']);
assert('missing options keep existing static list',
  mappingOptionsToStore({}, { options: ['Yes', 'No'] }),
  ['Yes', 'No']);
assert('isAjaxFieldOptions on empty select', isAjaxFieldOptions({ optionsDynamic: true }), true);
assert('isAjaxFieldOptions on gender radios', isAjaxFieldOptions({ options: ['Male', 'Female'] }), false);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
