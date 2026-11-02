/**
 * mapping-relation.test.ts — #302 source + relation
 */
import {
  normalizeRelation,
  applyRelation,
  induceRelation,
  looksLikePartField,
  materializeSavedRelations,
} from '../src/mapping-relation.ts';

let passed = 0;
let failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log('  ✓', desc);
    passed++;
  } else {
    console.error('  ✗', desc);
    console.error('    expected:', JSON.stringify(expected));
    console.error('    actual:  ', JSON.stringify(actual));
    failed++;
  }
}

const profile = {
  dob: '05/06/2003',
  phone: '9876543210',
  email: 'john@example.com',
  name: 'Ram Kumar Sharma',
};

console.log('\nnormalizeRelation legacy');
assert(
  'day+dob → unknown',
  normalizeRelation({ profileKey: 'dob' }, { label: 'Day', type: 'number' }),
  { kind: 'unknown' }
);
assert(
  'name full → identity',
  normalizeRelation({ profileKey: 'name' }, { label: 'Applicant Name', type: 'text' }),
  { kind: 'identity' }
);
assert(
  'explicit relation kept',
  normalizeRelation({ profileKey: 'phone', relation: { kind: 'last_n', n: 4 } }, { label: 'Last 4' }),
  { kind: 'last_n', n: 4 }
);
assert(
  'purpose field → per_application',
  normalizeRelation({ profileKey: 'purpose' }, { label: 'Purpose', canonicalKey: 'purpose' }),
  { kind: 'per_application' }
);
assert(
  'per_application apply returns null',
  applyRelation({ kind: 'per_application' }, profile, 'purpose', { label: 'Purpose' }),
  null
);

console.log('\napplyRelation');
assert(
  'identity',
  applyRelation({ kind: 'identity' }, profile, 'phone', { label: 'Mobile', type: 'tel' }),
  '9876543210'
);
assert(
  'last_n',
  applyRelation({ kind: 'last_n', n: 4 }, profile, 'phone', { label: 'Last 4', maxLength: 4 }),
  '3210'
);
assert(
  'date day',
  applyRelation({ kind: 'date_part', part: 'day' }, profile, 'dob', { label: 'Day', type: 'number' }),
  '5'
);
assert(
  'date month name',
  applyRelation({ kind: 'date_part', part: 'month' }, profile, 'dob', { label: 'Month', type: 'dropdown' }),
  'June'
);
assert(
  'unknown → null',
  applyRelation({ kind: 'unknown' }, profile, 'dob', { label: 'Day' }),
  null
);
assert(
  'identity too long for maxlength → null',
  applyRelation({ kind: 'identity' }, profile, 'phone', { label: 'Last 4', maxLength: 4 }),
  null
);

console.log('\ninduceRelation');
assert(
  'induce day',
  induceRelation(profile, 'dob', '05', { label: 'Day' }),
  { kind: 'date_part', part: 'day', pad: 2 }
);
assert(
  'induce last4',
  induceRelation(profile, 'phone', '3210', { label: 'Last 4 digits' }),
  { kind: 'last_n', n: 4 }
);
assert(
  'induce email local',
  induceRelation(profile, 'email', 'john', { label: 'Username' }),
  { kind: 'email_local' }
);
assert(
  'induce identity',
  induceRelation(profile, 'phone', '9876543210', { label: 'Mobile' }),
  { kind: 'identity' }
);
assert(
  'unclear part → unknown',
  induceRelation(profile, 'dob', '99', { label: 'Day' }),
  { kind: 'unknown' }
);
assert(
  'full date widget day sample stays unknown',
  induceRelation(profile, 'dob', '05', { label: 'Date Of Birth', canonicalKey: 'dob', placeholder: 'DD/MM/YYYY' }),
  { kind: 'unknown' }
);
assert(
  'nationality must NOT become dob day from evidence 05',
  induceRelation(profile, 'dob', '05', { label: 'Country Of Nationality', type: 'text' }),
  { kind: 'unknown' }
);
assert(
  'ng-dd gender must NOT become dob day',
  induceRelation(profile, 'dob', '05', { label: '4. Gender', type: 'ng-dropdown', id: 'ng-dd-10018', selector: '[data-cc-id="ng-dd-10018"]' }),
  { kind: 'unknown' }
);
assert(
  'DD/MM/YYYY confirm date must NOT become dob day',
  induceRelation(profile, 'dob', '05', { label: 'Re-type Date Of Birth', type: 'text', placeholder: 'DD/MM/YYYY', id: 'dateBirth' }),
  { kind: 'unknown' }
);
assert(
  'looksLikePartField short maxLength alone is false',
  looksLikePartField({ label: 'PIN', type: 'text', maxLength: 4 }),
  false
);

console.log('\nmaterializeSavedRelations');
{
  const mapping = {};
  const fbs = {};
  const fields = [
    { selector: '#day', label: 'Day', type: 'number' },
    { selector: '#name', label: 'Name', type: 'text' },
    { selector: '#last4', label: 'Last 4 digits', type: 'text', maxLength: 4 },
  ];
  const saved = {
    day: { profileKey: 'dob' }, // legacy → unknown → skip
    name: { profileKey: 'name' },
    'last 4 digits': { profileKey: 'phone', relation: { kind: 'last_n', n: 4 } },
  };
  const n = materializeSavedRelations(fields, profile, saved, mapping, fbs, 'test');
  assert('added count', n, 2);
  assert('name value', mapping['#name']?.value, 'Ram Kumar Sharma');
  assert('last4 value', mapping['#last4']?.value, '3210');
  assert('day skipped', mapping['#day'], undefined);
}
{
  const mapping = {};
  const fbs = {};
  const fields = [
    { selector: '#photo', label: 'Photo', type: 'file', humanGate: 'upload', fillMode: 'skip', canonicalKey: 'photo' },
    { selector: '#purpose', label: 'Purpose', type: 'text', canonicalKey: 'purpose', relationHint: 'per_application' },
    { selector: '#addr-dist', label: 'District', type: 'dropdown', canonicalKey: 'district', catalogKey: 'address.district', section: 'address' },
  ];
  const saved = {
    photo: { profileKey: 'photo', relation: { kind: 'identity' } },
    purpose: { profileKey: 'purpose', relation: { kind: 'per_application' } },
    'address.district': { profileKey: 'district', relation: { kind: 'identity' } },
  };
  const n = materializeSavedRelations(fields, { district: 'Gaya' }, saved, mapping, fbs, 'test');
  assert('skip upload and per_application, keep namespaced district', n, 1);
  assert('photo not materialized', mapping['#photo'], undefined);
  assert('purpose not materialized', mapping['#purpose'], undefined);
  assert('address.district via catalogKey', mapping['#addr-dist']?.value, 'Gaya');
}

{
  const mapping = {};
  const fbs = {};
  const fields = [
    { selector: '#registrationFormControlInput2', label: 'Mobile Number', type: 'tel', canonicalKey: 'mobile' },
    { selector: '#mobileotp', label: 'mobileotp', id: 'mobileotp', type: 'text', humanGate: 'otp', fillMode: 'skip' },
    { selector: '#dob', label: 'Candidate Date Of Birth', type: 'text', canonicalKey: 'dob' },
  ];
  const saved = {
    mobile: { profileKey: 'dob', relation: { kind: 'identity' } },
    mobileotp: { profileKey: 'mobile', relation: { kind: 'identity' } },
    dob: { profileKey: 'dob', relation: { kind: 'identity' } },
  };
  const n = materializeSavedRelations(fields, profile, saved, mapping, fbs, 'wss-saved');
  assert('skip sticky dob on Mobile Number and skip otp', n, 1);
  assert('mobile number not materialized as dob', mapping['#registrationFormControlInput2'], undefined);
  assert('otp not materialized', mapping['#mobileotp'], undefined);
  assert('real dob still materializes', mapping['#dob']?.profileKey, 'dob');
}

assert('looksLikePartField Day', looksLikePartField({ label: 'Day' }), true);
assert('looksLikePartField Name', looksLikePartField({ label: 'Applicant Name' }), false);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
