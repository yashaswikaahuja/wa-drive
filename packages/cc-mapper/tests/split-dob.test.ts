/**
 * split-dob.test.ts — date splitter (TypeScript via strip-types)
 */
import { parseDobParts, applySplitDob, refusesDobSplit, isFullDateWidget } from '../src/split-dob.ts';

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else {
    console.error('  ✗', desc);
    console.error('    expected:', JSON.stringify(expected));
    console.error('    actual:  ', JSON.stringify(actual));
    failed++;
  }
}

console.log('\nparseDobParts');
assert('DD/MM/YYYY', parseDobParts('15/08/1995'), { day: '15', month: '08', year: '1995' });
assert('DD-MM-YYYY', parseDobParts('15-08-1995'), { day: '15', month: '08', year: '1995' });
assert('YYYY-MM-DD', parseDobParts('1995-08-15'), { day: '15', month: '08', year: '1995' });
assert('YYYY/MM/DD', parseDobParts('1995/08/15'), { day: '15', month: '08', year: '1995' });
assert('empty', parseDobParts(''), null);
assert('null', parseDobParts(null), null);

console.log('\napplySplitDob labels');
{
  const mapping = {};
  const fields = [
    { selector: '#d', label: 'DD', type: 'text', id: '', name: '', placeholder: 'dd' },
    { selector: '#m', label: 'MM', type: 'text', id: '', name: '', placeholder: '' },
    { selector: '#y', label: 'YYYY', type: 'text', id: '', name: '', placeholder: '' },
  ];
  applySplitDob(fields, { dob: '15/08/1995' }, mapping);
  assert('day', mapping['#d']?.value, '15');
  assert('month', mapping['#m']?.value, '08');
  assert('year', mapping['#y']?.value, '1995');
}

console.log('\napplySplitDob id hints + ISO dob');
{
  const mapping = {};
  const fields = [
    { selector: '#d', label: '', type: 'text', id: 'ddl_day', name: '', placeholder: '' },
    { selector: '#m', label: '', type: 'select', id: 'dob_month', name: '', placeholder: '' },
    { selector: '#y', label: '', type: 'text', id: 'birth_year', name: '', placeholder: '' },
  ];
  applySplitDob(fields, { dob: '1995-08-15' }, mapping);
  assert('iso day from id', mapping['#d']?.value, '15');
  assert('iso month select → name', mapping['#m']?.value, 'August');
  assert('iso year from id', mapping['#y']?.value, '1995');
}

console.log('\napplySplitDob skips already-mapped');
{
  const mapping = { '#d': { value: '99', type: 'text' } };
  applySplitDob(
    [{ selector: '#d', label: 'DD', type: 'text', id: '', name: '', placeholder: '' }],
    { dob: '15/08/1995' },
    mapping,
  );
  assert('keeps existing', mapping['#d']?.value, '99');
}

console.log('\napplySplitDob ignores SSC ng-dropdowns and full dates');
{
  const mapping = {};
  const fields = [
    { selector: '[data-cc-id="ng-dd-10018"]', label: '4. Gender', type: 'ng-dropdown', id: 'ng-dd-10018', name: '', placeholder: '', canonicalKey: 'gender' },
    { selector: '[data-cc-id="ng-dd-10022"]', label: '8. Matriculation (10th class) Education Board', type: 'ng-dropdown', id: 'ng-dd-10022', name: '', placeholder: '' },
    { selector: '[data-cc-id="ng-dd-10024"]', label: '10. Year of Passing', type: 'ng-dropdown', id: 'ng-dd-10024', name: '', placeholder: '' },
    { selector: '#dateBirth', label: 'Country Of Nationality', type: 'text', id: 'dateBirth', name: 'dateBirth', placeholder: 'DD/MM/YYYY As recorded in Matriculation' },
    { selector: '#jquerryEffectiveDate', label: 'Date Of Birth', type: 'text', id: 'jquerryEffectiveDate', name: 'effectiveDate', placeholder: '', canonicalKey: 'dob' },
    { selector: '#d', label: 'DD', type: 'text', id: '', name: '', placeholder: 'dd' },
  ];
  applySplitDob(fields, { dob: '15/08/1995' }, mapping);
  assert('gender ng-dd not split', mapping['[data-cc-id="ng-dd-10018"]'], undefined);
  assert('board ng-dd not split', mapping['[data-cc-id="ng-dd-10022"]'], undefined);
  assert('year of passing ng-dd not split', mapping['[data-cc-id="ng-dd-10024"]'], undefined);
  assert('DD/MM/YYYY placeholder not day', mapping['#dateBirth'], undefined);
  assert('canonical dob without placeholder not day', mapping['#jquerryEffectiveDate'], undefined);
  assert('real DD still splits', mapping['#d']?.value, '15');
  assert('refuses gender', refusesDobSplit(fields[0]), true);
  assert('full date widget', isFullDateWidget(fields[3]), true);
  assert('canonical dob is full date', isFullDateWidget(fields[4]), true);
}

console.log('\nisFullDateWidget refuses mobile even with stale dob canonicalKey');
{
  const mobile = { selector: '#m', label: 'Mobile Number', type: 'tel', id: 'registrationFormControlInput2', canonicalKey: 'dob' };
  assert('mobile + stale dob ck is not a full date', isFullDateWidget(mobile), false);
  const mapping = {};
  applySplitDob([mobile], { dob: '15/08/1995' }, mapping);
  assert('mobile not filled as day/date', mapping['#m'], undefined);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
