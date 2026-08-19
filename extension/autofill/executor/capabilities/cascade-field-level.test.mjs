/**
 * Tests for cascade-field-level.js
 *
 * Run: node extension/autofill/executor/cascade-field-level.test.mjs
 *
 * No test framework required — plain assertions.
 * Tests are based on real government form label patterns (ServicePlus, RTPS Bihar,
 * SSC OTR, RRB forms) and the existing behavior of cascadeSemanticKey in
 * select-helpers.js (the behavioral reference).
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the IIFE into a minimal globalThis-like sandbox
const src = readFileSync(join(__dirname, 'cascade-field-level.js'), 'utf8');
const sandbox = { CcCascadeFieldLevel: null };
const fn = new Function('globalThis', src);
fn(sandbox);

const { cascadeFieldLevel, CASCADE_PARENTS } = sandbox.CcCascadeFieldLevel;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log('  ✓', description);
    passed++;
  } else {
    console.error('  ✗', description);
    console.error('    expected:', JSON.stringify(expected));
    console.error('    actual:  ', JSON.stringify(actual));
    failed++;
  }
}

function assertIncludes(description, arr, value) {
  if (Array.isArray(arr) && arr.includes(value)) {
    console.log('  ✓', description);
    passed++;
  } else {
    console.error('  ✗', description);
    console.error('    expected array to include:', JSON.stringify(value));
    console.error('    actual array:', JSON.stringify(arr));
    failed++;
  }
}

function assertNotIncludes(description, arr, value) {
  if (Array.isArray(arr) && !arr.includes(value)) {
    console.log('  ✓', description);
    passed++;
  } else {
    console.error('  ✗', description);
    console.error('    expected array NOT to include:', JSON.stringify(value));
    console.error('    actual array:', JSON.stringify(arr));
    failed++;
  }
}

// ── English label patterns ────────────────────────────────────────────────────
console.log('\nEnglish labels (label param):');
assert('State',             cascadeFieldLevel('State', '', ''),             'state');
assert('state (lowercase)', cascadeFieldLevel('state', '', ''),             'state');
assert('Select State',      cascadeFieldLevel('Select State', '', ''),      'state');
assert('District',          cascadeFieldLevel('District', '', ''),          'district');
assert('District Name',     cascadeFieldLevel('District Name', '', ''),     'district');
assert('Select District',   cascadeFieldLevel('Select District', '', ''),   'district');
assert('Sub Division',      cascadeFieldLevel('Sub Division', '', ''),      'sub_division');
assert('Sub-Division',      cascadeFieldLevel('Sub-Division', '', ''),      'sub_division');
assert('Subdivision',       cascadeFieldLevel('Subdivision', '', ''),       'sub_division');
assert('sub_division',      cascadeFieldLevel('sub_division', '', ''),      'sub_division');
assert('Block',             cascadeFieldLevel('Block', '', ''),             'block');
assert('Block Name',        cascadeFieldLevel('Block Name', '', ''),        'block');
assert('Tehsil',            cascadeFieldLevel('Tehsil', '', ''),            'block');
assert('Taluka',            cascadeFieldLevel('Taluka', '', ''),            'block');
assert('Panchayat',         cascadeFieldLevel('Panchayat', '', ''),         'panchayat');
assert('Village Panchayat', cascadeFieldLevel('Village Panchayat', '', ''), 'panchayat');
assert('Village',           cascadeFieldLevel('Village', '', ''),           'village');
assert('Gram',              cascadeFieldLevel('Gram', '', ''),              'village');
assert('Mohalla',           cascadeFieldLevel('Mohalla', '', ''),           'village');
assert('Police Station',    cascadeFieldLevel('Police Station', '', ''),    'police_station');
assert('Police',            cascadeFieldLevel('Police', '', ''),            'police_station');
assert('Thana',             cascadeFieldLevel('Thana', '', ''),             'police_station');
assert('Post Office',       cascadeFieldLevel('Post Office', '', ''),       'post_office');
assert('Post_Office',       cascadeFieldLevel('Post_Office', '', ''),       'post_office');
assert('Pin Code',          cascadeFieldLevel('Pin Code', '', ''),          'pin_code');
assert('Pincode',           cascadeFieldLevel('Pincode', '', ''),           'pin_code');
assert('PIN',               cascadeFieldLevel('PIN', '', ''),               'pin_code');

// ── Hindi Unicode label patterns ──────────────────────────────────────────────
console.log('\nHindi labels (label param):');
assert('राज्य (state)',      cascadeFieldLevel('राज्य', '', ''),   'state');
assert('जिला (district)',    cascadeFieldLevel('जिला', '', ''),    'district');
assert('अनुमंडल (sub_div)', cascadeFieldLevel('अनुमंडल', '', ''), 'sub_division');
assert('प्रखंड (block)',     cascadeFieldLevel('प्रखंड', '', ''),  'block');
assert('पंचायत (panchayat)', cascadeFieldLevel('पंचायत', '', ''),  'panchayat');
assert('ग्राम (village)',    cascadeFieldLevel('ग्राम', '', ''),   'village');
assert('मोहल्ला (village)',  cascadeFieldLevel('मोहल्ला', '', ''), 'village');
assert('थाना (police)',      cascadeFieldLevel('थाना', '', ''),    'police_station');
assert('डाक (post_office)',  cascadeFieldLevel('डाक', '', ''),     'post_office');
assert('पिन (pin_code)',     cascadeFieldLevel('पिन', '', ''),     'pin_code');

// ── profileKey matching ───────────────────────────────────────────────────────
console.log('\nprofileKey param:');
assert('profileKey=state',    cascadeFieldLevel('', 'state', ''),    'state');
assert('profileKey=district', cascadeFieldLevel('', 'district', ''), 'district');
assert('profileKey=block',    cascadeFieldLevel('', 'block', ''),    'block');

// ── Disambiguation: state vs sub_division ─────────────────────────────────────
console.log('\nDisambiguation (state vs sub_division):');
assert('Sub Division not state', cascadeFieldLevel('Sub Division', '', ''), 'sub_division');
assert('Sub-Division not state', cascadeFieldLevel('Sub-Division', '', ''), 'sub_division');
assert('State with no sub',      cascadeFieldLevel('State', '', ''),        'state');
// sub_division via profileKey should not match as state
assert('profileKey=sub_division', cascadeFieldLevel('', 'sub_division', ''), 'sub_division');

// ── Non-cascade fields return '' ──────────────────────────────────────────────
console.log('\nNon-cascade fields (must return empty string):');
assert('Full Name',      cascadeFieldLevel('Full Name', 'name', ''),      '');
assert('Date of Birth',  cascadeFieldLevel('Date of Birth', 'dob', ''),   '');
assert('Mobile Number',  cascadeFieldLevel('Mobile Number', 'mobile', ''), '');
assert('Email',          cascadeFieldLevel('Email', 'email', ''),          '');
assert('Aadhaar Number', cascadeFieldLevel('Aadhaar Number', '', ''),      '');
assert('empty strings',  cascadeFieldLevel('', '', ''),                    '');

// ── Null/undefined safety ─────────────────────────────────────────────────────
console.log('\nNull/undefined safety:');
assert('all null',      cascadeFieldLevel(null, null, null),          '');
assert('all undefined', cascadeFieldLevel(undefined, undefined, undefined), '');
assert('mixed null',    cascadeFieldLevel('District', null, null),    'district');

// ── CASCADE_PARENTS structure ─────────────────────────────────────────────────
console.log('\nCASCADE_PARENTS structure:');
assert('state has no parents (undefined or missing)',
  CASCADE_PARENTS['state'] === undefined || (Array.isArray(CASCADE_PARENTS['state']) && CASCADE_PARENTS['state'].length === 0),
  true);
assertIncludes('district depends on state',        CASCADE_PARENTS['district'],       'state');
assertIncludes('sub_division depends on state',    CASCADE_PARENTS['sub_division'],   'state');
assertIncludes('sub_division depends on district', CASCADE_PARENTS['sub_division'],   'district');
assertIncludes('block depends on state',           CASCADE_PARENTS['block'],          'state');
assertIncludes('block depends on district',        CASCADE_PARENTS['block'],          'district');
assertIncludes('block depends on sub_division',    CASCADE_PARENTS['block'],          'sub_division');
assertIncludes('panchayat depends on block',       CASCADE_PARENTS['panchayat'],      'block');
assertIncludes('panchayat depends on district',    CASCADE_PARENTS['panchayat'],      'district');
assertIncludes('village depends on block',         CASCADE_PARENTS['village'],        'block');
assertIncludes('police_station depends on district', CASCADE_PARENTS['police_station'], 'district');
assertIncludes('post_office depends on block',     CASCADE_PARENTS['post_office'],    'block');

// State should not appear as its own parent anywhere
assertNotIncludes('state is not a parent of state (no circular dep)',
  CASCADE_PARENTS['state'] || [], 'state');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
