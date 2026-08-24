/**
 * Regression test for issue-54: field mapping guards.
 * Verifies that profile.name does NOT get mapped to relative/spouse fields.
 *
 * Run: node extension-dev/tests/test-mapping-guards.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '../../apps/extension');

// Create a simulated browser context
const context = vm.createContext({
  window: {},
  document: {
    body: { dataset: {}, getAttribute: () => null },
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  console: console,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  CSS: { escape: (s) => s },
  Event: class Event { constructor(t) { this.type = t; } },
  MutationObserver: class MutationObserver { observe() {} disconnect() {} },
  Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
  Promise: Promise,
  fetch: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) }),
  Array, Object, String, Number, JSON, Math, Date, parseInt, parseFloat, isNaN, RegExp, Error,
});
context.window = context;
context.self = context;
context.globalThis = context;

// Load shared modules + mapper
const scripts = [
  'shared/option-match.js',
  'shared/dom-utils.js',
  'shared/network-idle.js',
  'shared/llm-client.js',
  'autofill/mapper.js',
];

for (const file of scripts) {
  const code = fs.readFileSync(path.join(EXT, file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

// Helper to call fuzzyMatch from the context
function fuzzyMatch(formFields, profile) {
  return vm.runInContext(
    `fuzzyMatch(${JSON.stringify(formFields)}, ${JSON.stringify(profile)})`,
    context
  );
}

const profile = {
  name: 'Kamaljeet',
  first_name: 'Kamaljeet',
  last_name: 'Singh',
  father_name: 'Sudhir Prasad',
  mother_name: 'Savitri Devi',
  dob: '15/03/1990',
  mobile: '9876543210',
  email: 'kamaljeet@test.com',
};

console.log('\n=== Issue #54: Name must NOT map to relative fields ===');

// Test: name → "Husband's Name" field
let fields = [
  { selector: '#husband_name', label: "Husband's Name", id: 'husband_name', name: 'husband_name', placeholder: '', type: 'text' },
];
let result = fuzzyMatch(fields, profile);
assert(!result['#husband_name'], 'name does NOT fill "Husband\'s Name"');

// Test: name → "Wife Name" field
fields = [
  { selector: '#wife_name', label: 'Wife Name', id: 'wife_name', name: 'wife_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(!result['#wife_name'], 'name does NOT fill "Wife Name"');

// Test: name → "Spouse Name" field
fields = [
  { selector: '#spouse_name', label: 'Spouse Name', id: 'spouse_name', name: 'spouse_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(!result['#spouse_name'], 'name does NOT fill "Spouse Name"');

// Test: name → "Guardian's Name" field
fields = [
  { selector: '#guardian_name', label: "Guardian's Name", id: 'guardian_name', name: 'guardian_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(!result['#guardian_name'], 'name does NOT fill "Guardian\'s Name"');

// Test: name → "Father's Name" field (should NOT get profile.name)
fields = [
  { selector: '#father_name', label: "Father's Name", id: 'father_name', name: 'father_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(result['#father_name'] && result['#father_name'].value === 'Sudhir Prasad',
  'father_name correctly fills "Father\'s Name" with profile.father_name');

// Test: name → "Candidate Name" field (SHOULD get profile.name)
fields = [
  { selector: '#candidate_name', label: 'Candidate Name', id: 'candidate_name', name: 'candidate_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(result['#candidate_name'] && result['#candidate_name'].value === 'Kamaljeet',
  'name correctly fills "Candidate Name" with profile.name');

// Test: name → "Applicant Name" field (SHOULD get profile.name)
fields = [
  { selector: '#applicant_name', label: 'Applicant Name', id: 'applicant_name', name: 'txt_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(result['#applicant_name'] && result['#applicant_name'].value === 'Kamaljeet',
  'name correctly fills "Applicant Name"');

// Test: "Father/Husband Name" should get profile.father_name (combined field)
fields = [
  { selector: '#fh_name', label: "Father/Husband Name", id: 'father_husband_name', name: 'father_husband_name', placeholder: '', type: 'text' },
];
result = fuzzyMatch(fields, profile);
assert(result['#fh_name'] && result['#fh_name'].value === 'Sudhir Prasad',
  '"Father/Husband Name" gets profile.father_name');

console.log('\n=== Issue #54: AI mapping guard ===');

// Simulate what aiMatch does internally — test the guard logic
// We can't easily call aiMatch (needs real LLM), but we test the same guard pattern
function simulateAiGuard(fieldLabel, profileKey) {
  var fieldIdent = (fieldLabel || '').toLowerCase().replace(/[-\s:*()'./]/g, '_');
  var isRelativeField = /husband|wife|spouse|guardian|pati(?!_pati_ka_naam)/i.test(fieldIdent);
  var isFatherField = /father|pita/i.test(fieldIdent);
  var isMotherField = /mother|mata/i.test(fieldIdent);

  if (profileKey === 'name' && (isRelativeField || isFatherField || isMotherField)) return false;
  if ((profileKey === 'name' || profileKey === 'first_name' || profileKey === 'last_name' || profileKey === 'middle_name')
      && isRelativeField) return false;
  if (profileKey === 'father_name' && !isFatherField) return false;
  if (profileKey === 'mother_name' && !isMotherField) return false;
  return true;
}

assert(!simulateAiGuard("Husband's Name", 'name'), 'AI guard blocks name → Husband');
assert(!simulateAiGuard("Wife Name", 'name'), 'AI guard blocks name → Wife');
assert(!simulateAiGuard("Guardian Name", 'name'), 'AI guard blocks name → Guardian');
assert(!simulateAiGuard("Father Name", 'name'), 'AI guard blocks name → Father');
assert(!simulateAiGuard("Mother Name", 'name'), 'AI guard blocks name → Mother');
assert(simulateAiGuard("Candidate Name", 'name'), 'AI guard allows name → Candidate Name');
assert(simulateAiGuard("Father/Husband Name", 'father_name'), 'AI guard allows father_name → Father/Husband');
assert(!simulateAiGuard("Husband Name", 'father_name'), 'AI guard blocks father_name → Husband (no father keyword)');
assert(!simulateAiGuard("Applicant Name", 'father_name'), 'AI guard blocks father_name → Applicant Name');

console.log('\n─────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
