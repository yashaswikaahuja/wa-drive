/**
 * fuzzy-match.test.ts — TypeScript ESM fuzzyMatch pipeline.
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

console.log('\nCcFuzzyMatch ISO dob + split');
{
  const isoProfile = { ...profile, dob: '1995-08-15' };
  const isoFields = [
    { selector: '#dob', label: 'Date of Birth', id: 'dob', name: 'dob', type: 'text', placeholder: '' },
    { selector: '#day', label: 'DD', id: 'dob_day', name: 'dob_day', type: 'text', placeholder: 'dd' },
    { selector: '#month', label: 'MM', id: 'dob_month', name: 'dob_month', type: 'text', placeholder: 'mm' },
    { selector: '#year', label: 'YYYY', id: 'dob_year', name: 'dob_year', type: 'text', placeholder: 'yyyy' },
  ];
  const isoMap = fuzzyMatch(isoFields, isoProfile);
  assert('iso combined dob', isoMap['#dob']?.value, '15/08/1995');
  assert('iso split day', isoMap['#day']?.value, '15');
  assert('iso split month', isoMap['#month']?.value, '08');
  assert('iso split year', isoMap['#year']?.value, '1995');
}

console.log('\nRTPS residence mapper');
{
  const sudhir = {
    name: 'SUDHIR PRASAD',
    father_name: 'RAM PRASAD',
    mother_name: 'SITA DEVI',
    gender: 'MALE',
    state: 'Bihar',
    district: 'Gaya',
    'sub-division': 'Neemchak Bathani',
    block: 'Mohra',
    village: 'charwara',
    panchayat: 'Tetar',
    post_office: 'Atri',
    police_station: 'Atri Thana',
    pincode: '823311',
    aadhaar_number: '123456789012',
    'email-id': 'sudhir@example.com',
    phone: '9876543210',
  };
  const rtps = [
    { selector: '[id="78250"]', label: 'Name of Applicant', id: '78250', name: '', type: 'text', canonicalKey: 'name' },
    { selector: '[id="17287"]', label: 'आवेदक / आवेदिका का नाम', id: '17287', name: '', type: 'text', canonicalKey: 'name_hindi', fillMode: 'auto' },
    { selector: '[name="17290"]', label: 'पुरुष / Male / स्त्री / Female / तृतीय लिंग / Third Gender', id: '', name: '17290', type: 'radio-group', canonicalKey: 'gender', options: ['पुरुष / Male', 'स्त्री / Female', 'तृतीय लिंग / Third Gender'], optionSelectors: ['#m', '#f', '#o'] },
    { selector: '[id="po"]', label: 'Post Office', id: 'po', name: '', type: 'dropdown', canonicalKey: 'post_office' },
    { selector: '[id="65015"]', label: 'थाना / Police Station', id: '65015', name: '', type: 'dropdown', canonicalKey: 'police_station', optionsDynamic: true, options: [] },
    { selector: '[id="email"]', label: 'Email ID', id: 'email', name: '', type: 'email', canonicalKey: 'email' },
    { selector: '[id="56886"]', label: 'Panchayat', id: '56886', name: '', type: 'dropdown', canonicalKey: 'panchayat', optionsDynamic: true, dependsOn: 'address.block' },
    { selector: '[id="circle"]', label: 'CIRCLE', id: 'circle', name: '', type: 'dropdown', canonicalKey: 'circle', section: 'office', catalogKey: 'office.circle' },
    { selector: '[id="purpose"]', label: 'Purpose', id: 'purpose', name: '', type: 'text', canonicalKey: 'purpose', relationHint: 'per_application' },
  ];
  const map = fuzzyMatch(rtps, sudhir);
  assert('applicant name', map['[id="78250"]']?.value, 'SUDHIR PRASAD');
  assert('hindi name skipped (auto)', map['[id="17287"]'], undefined);
  assertTruthy('gender mapped to option', map['#m'] || map['[name="17290"]']);
  assert('gender profileKey', (map['#m'] || map['[name="17290"]'])?.profileKey, 'gender');
  assert('post office not thana', map['[id="po"]']?.profileKey, 'post_office');
  assert('thana is police_station', map['[id="65015"]']?.profileKey, 'police_station');
  assert('thana does not steal post_office', map['[id="65015"]']?.profileKey !== 'post_office', true);
  assert('email-id flattens via profileAtom', map['[id="email"]']?.value, 'sudhir@example.com');
  assert('panchayat is panchayat not village', map['[id="56886"]']?.profileKey, 'panchayat');
  assert('circle not sub_division', map['[id="circle"]'], undefined);
  assert('purpose skipped (per_application)', map['[id="purpose"]'], undefined);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
