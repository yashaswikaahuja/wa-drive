/**
 * Regression test for issue-56 consolidated shared modules.
 * Run: node extension/test/test-shared-modules.js
 *
 * Tests:
 * 1. shared/option-match.js — ccMatchOption
 * 2. shared/label-utils.js — calcConfidence, getSemanticKey, normalizeFieldLabel
 * 3. autofill/rule-engine.js — ccMatchOption delegation
 */

// Minimal browser globals (no jsdom needed for pure-function tests)
global.window = global;
global.document = { body: { dataset: {} } };

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── Load shared/option-match.js ──
eval(require('fs').readFileSync(__dirname + '/../shared/option-match.js', 'utf8'));

console.log('\n=== shared/option-match.js ===');

// Test basic exact match (strings)
assert(window.ccMatchOption('Male', ['Male', 'Female', 'Other']) === 'Male', 'Exact string match');
assert(window.ccMatchOption('male', ['Male', 'Female', 'Other']) === 'Male', 'Case-insensitive match');

// Test with {text, value} objects
const selectOpts = [
  { text: 'Select', value: '' },
  { text: 'Bihar', value: '5' },
  { text: 'Jharkhand', value: '12' },
  { text: 'Uttar Pradesh', value: '22' },
];
const result = window.ccMatchOption('Bihar', selectOpts);
assert(result && result.value === '5', 'Object option match by text');

// Test contains match
assert(window.ccMatchOption('Patna', ['Select District', 'Patna', 'Gaya']) === 'Patna', 'Contains match');

// Test starts-with
const startResult = window.ccMatchOption('Intermediate', ['Intermediate (10+2)', 'Matriculation', 'Graduate']);
assert(startResult === 'Intermediate (10+2)', 'Starts-with match');

// Test null cases
assert(window.ccMatchOption(null, ['A', 'B']) === null, 'Null value returns null');
assert(window.ccMatchOption('X', []) === null, 'Empty options returns null');
assert(window.ccMatchOption('', ['A', 'B']) === null, 'Empty string returns null');

// Test synonym match
assert(window.ccMatchOption('12th', ['Matriculation', 'Higher Secondary', 'Graduate']) === 'Higher Secondary', 'Synonym match (12th → Higher Secondary)');

// Test placeholder filtering
const withPlaceholder = [
  { text: '--Select--', value: '0' },
  { text: 'Yes', value: '1' },
  { text: 'No', value: '2' },
];
assert(window.ccMatchOption('Yes', withPlaceholder) && window.ccMatchOption('Yes', withPlaceholder).value === '1', 'Placeholder filtered');

// Test translations
const translated = window.ccMatchOption('General', ['OBC', 'SC', 'ST', 'UR (General)'], { translations: { 'General': 'UR (General)' } });
assert(translated === 'UR (General)', 'Translation table match');

// Test extraValues
const extraResult = window.ccMatchOption('January', [
  { text: '--Select Month--', value: '' },
  { text: 'January', value: '01' },
  { text: 'February', value: '02' },
], { extraValues: ['01'] });
assert(extraResult && extraResult.value === '01', 'ExtraValues fallback');

console.log('\n=== shared/label-utils.js ===');

// Load label-utils
eval(require('fs').readFileSync(__dirname + '/../shared/label-utils.js', 'utf8'));

// calcConfidence — canonical formula
assert(calcConfidence(0, 0) === 0.5, 'New mapping confidence = 0.5');
assert(calcConfidence(10, 0) === 1, 'Perfect fills = 1.0');
assert(Math.abs(calcConfidence(10, 2) - (10 / 16)) < 0.001, '10 fills, 2 corrections = 10/16');
assert(calcConfidence(0, 5) === 0, 'All corrections = 0');

// getSemanticKey
assert(getSemanticKey("Father's Name") === 'father_name', 'Semantic: father name');
assert(getSemanticKey('Date of Birth') === 'dob', 'Semantic: dob');
assert(getSemanticKey('PIN Code') === 'pincode', 'Semantic: pincode');
assert(getSemanticKey('Some Random Field') === 'some random field', 'Unknown label returns normalized');

// normalizeFieldLabel
assert(normalizeFieldLabel('4. Father Name *') === 'Father Name', 'Strip numbering and asterisk');
assert(normalizeFieldLabel('a. Mobile Number') === 'Mobile Number', 'Strip letter prefix');
assert(normalizeFieldLabel('Normal Label') === 'Normal Label', 'No-op on clean label');

console.log('\n=== rule-engine.js ccMatchOption delegation ===');

// Load rule-engine (it references window.ccMatchOption)
eval(require('fs').readFileSync(__dirname + '/../autofill/rule-engine.js', 'utf8'));

// ccMatchOption in rule-engine should delegate to shared when window.ccMatchOption exists
// Test with string options (rule-engine's original interface)
const ruleResult = ccMatchOption('Bihar', ['Select State', 'Bihar', 'Jharkhand']);
assert(ruleResult === 'Bihar', 'Rule-engine ccMatchOption delegates to shared');

const ruleResult2 = ccMatchOption('Male', ['Male', 'Female']);
assert(ruleResult2 === 'Male', 'Rule-engine exact match via shared');

console.log('\n─────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
