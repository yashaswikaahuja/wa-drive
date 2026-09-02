/**
 * split-dob.test.mjs — date splitter root module (plain JS)
 */
import { parseDobParts, applySplitDob } from '../src/split-dob.js';

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

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
