/**
 * mapping-relation.test.mjs — #302 source + relation
 */
import {
  normalizeRelation,
  applyRelation,
  induceRelation,
  looksLikePartField,
  materializeSavedRelations,
} from '../src/mapping-relation.js';

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

assert('looksLikePartField Day', looksLikePartField({ label: 'Day' }), true);
assert('looksLikePartField Name', looksLikePartField({ label: 'Applicant Name' }), false);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
