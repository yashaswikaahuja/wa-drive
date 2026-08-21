/**
 * derive-profile.test.mjs — plain Node, no framework
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, 'derive-profile.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { deriveProfile, _hasVal, _ageFromDob, _educationLevels } = root.CcDeriveProfile;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── _hasVal ───────────────────────────────────────────────────────────────────
console.log('\n_hasVal');
assert('null → false', _hasVal(null), false);
assert('empty string → false', _hasVal(''), false);
assert('whitespace → false', _hasVal('  '), false);
assert('0 → true', _hasVal('0'), true);
assert('value → true', _hasVal('Rahul'), true);

// ── _ageFromDob ───────────────────────────────────────────────────────────────
console.log('\n_ageFromDob');
assert('null → null', _ageFromDob(null), null);
assert('invalid → null', _ageFromDob('abc'), null);
const age2000 = String(new Date().getFullYear() - 2000 - (new Date() < new Date(new Date().getFullYear(), 0, 1) ? 1 : 0));
// just check it's a numeric string and reasonable
assert('DOB returns string', typeof _ageFromDob('01/01/1990'), 'string');
assert('DOB > 0', parseInt(_ageFromDob('01/01/1990')) > 0, true);

// ── _educationLevels ──────────────────────────────────────────────────────────
console.log('\n_educationLevels');
assert('empty profile → all false', _educationLevels({}), { grad: false, twelfth: false, tenth: false });
assert('board_10th → tenth=true', _educationLevels({ board_10th: 'CBSE' }).tenth, true);
assert('board_12th → twelfth=true', _educationLevels({ board_12th: 'CBSE' }).twelfth, true);
assert('university_name → grad=true', _educationLevels({ university_name: 'BU' }).grad, true);

// ── deriveProfile ─────────────────────────────────────────────────────────────
console.log('\nderiveProfile — highest qualification');
assert('grad → Graduation',     deriveProfile({ university_name: 'BU' }).highest_education_qualification, 'Graduation');
assert('twelfth → Intermediate', deriveProfile({ board_12th: 'CBSE' }).highest_education_qualification, 'Intermediate');
assert('tenth → Matriculation',  deriveProfile({ board_10th: 'CBSE' }).highest_education_qualification, 'Matriculation');
assert('none → undefined',       deriveProfile({}).highest_education_qualification, undefined);

console.log('\nderiveProfile — never overwrites real data');
assert('existing key not overwritten',
  deriveProfile({ board_10th: 'CBSE', highest_education_qualification: 'Graduation' }).highest_education_qualification,
  'Graduation');

console.log('\nderiveProfile — name parts');
const np = deriveProfile({ name: 'Rahul Kumar Singh' });
assert('first_name', np.first_name, 'Rahul');
assert('last_name',  np.last_name,  'Singh');
assert('middle_name', np.middle_name, 'Kumar');

console.log('\nderiveProfile — age');
assert('age derived from dob', typeof deriveProfile({ dob: '01/01/1990' }).age, 'string');

console.log('\nderiveProfile — nationality default');
assert('nationality defaults to Indian', deriveProfile({}).nationality, 'Indian');
assert('nationality not overwritten', deriveProfile({ nationality: 'Other' }).nationality, 'Other');

console.log('\nderiveProfile — category flag');
assert('General → is_reserved_category=No',  deriveProfile({ category: 'General' }).is_reserved_category, 'No');
assert('OBC → is_reserved_category=Yes',      deriveProfile({ category: 'OBC' }).is_reserved_category, 'Yes');

console.log('\nderiveProfile — _derived tracking');
const d = deriveProfile({ board_10th: 'CBSE' });
assert('_derived is array', Array.isArray(d._derived), true);
assert('_derived includes highest_education_qualification', d._derived.includes('highest_education_qualification'), true);

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
