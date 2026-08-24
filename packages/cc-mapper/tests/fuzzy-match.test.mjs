/**
 * fuzzy-match.test.mjs — TypeScript ESM fuzzyMatch pipeline.
 */
import { fuzzyMatch } from '../src/fuzzy-match.ts';

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}
function assertTruthy(desc, actual) {
  if (actual) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got falsy:', actual); failed++; }
}

console.log('\nCcFuzzyMatch pipeline (TS)');

const profile = {
  name: 'Rahul Kumar Sharma',
  first_name: 'Rahul',
  middle_name: 'Kumar',
  last_name: 'Sharma',
  dob: '15/08/1995',
  father_name: 'Suresh Sharma',
  email: 'rahul@example.com',
  gender: 'Male',
  board_10th: 'CBSE',
  photo: 'photo.jpg',
};

const fields = [
  { selector: '#name', label: 'Full Name', id: 'name', name: 'name', type: 'text', placeholder: '' },
  { selector: '#fname', label: 'First Name', id: 'fname', name: 'fname', type: 'text', placeholder: '' },
  { selector: '#dob', label: 'Date of Birth', id: 'dob', name: 'dob', type: 'text', placeholder: '' },
  { selector: '#day', label: 'DD', id: 'dob_day', name: 'dob_day', type: 'text', placeholder: 'dd' },
  { selector: '#month', label: 'MM', id: 'dob_month', name: 'dob_month', type: 'text', placeholder: 'mm' },
  { selector: '#year', label: 'YYYY', id: 'dob_year', name: 'dob_year', type: 'text', placeholder: 'yyyy' },
  { selector: '#email', label: 'Email Address', id: 'email', name: 'email', type: 'email', placeholder: '' },
  { selector: '#father', label: "Father's Name", id: 'father', name: 'father_name', type: 'text', placeholder: '' },
  { selector: '#board10', label: '10th Board', id: 'board_10th', name: 'board_10th', type: 'text', placeholder: '' },
  { selector: '#photo', label: 'Photograph', id: 'photo', name: 'photo', type: 'file', placeholder: '' },
  { selector: '#agree', label: 'I agree to the terms and conditions', id: 'agree', name: 'agree', type: 'checkbox', placeholder: '' },
  { selector: '#confirm_email', label: 'Confirm Email Address', id: 'c_email', name: 'confirm_email', type: 'email', placeholder: '' },
  {
    selector: '[name=gender]', label: 'Gender', id: '', name: 'gender', type: 'radio-group',
    options: ['Male', 'Female', 'Other'], optionSelectors: ['#m', '#f', '#o'],
  },
];

const mapping = fuzzyMatch(fields, profile);

assertTruthy('maps full name', mapping['#name']);
assert('full name value', mapping['#name']?.value, 'Rahul Kumar Sharma');
assert('first name value', mapping['#fname']?.value, 'Rahul');
assertTruthy('maps dob combined', mapping['#dob']);
assert('email value', mapping['#email']?.value, 'rahul@example.com');
assert('father name value', mapping['#father']?.value, 'Suresh Sharma');
assert('education board_10th', mapping['#board10']?.value, 'CBSE');
assert('file photo', mapping['#photo']?.value, 'photo.jpg');
assert('agreement checkbox yes', mapping['#agree']?.value, 'yes');
assertTruthy('gender radio mapped', mapping['#m'] || mapping['[name=gender]']);
assertTruthy('confirm email twin mirrored', mapping['#confirm_email']);
assert('confirm email mirrors primary', mapping['#confirm_email']?.value, mapping['#email']?.value);
assert('split dob day', mapping['#day']?.value, '15');
assert('split dob month', mapping['#month']?.value, '08');
assert('split dob year', mapping['#year']?.value, '1995');

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
