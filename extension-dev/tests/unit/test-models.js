/**
 * Tests for Phase 1.1: FormModel / FieldModel / PageModel IR layer.
 * Run: node extension-dev/tests/test-models.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '../../../apps/extension');

// Simulated browser context
const context = vm.createContext({
  window: {},
  document: {
    body: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    title: 'Test Form Page',
  },
  location: { href: 'https://example.gov.in/apply', hostname: 'example.gov.in' },
  console: console,
  setTimeout: setTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
  CSS: { escape: (s) => s },
  Date: Date,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  JSON: JSON,
  parseInt: parseInt,
  isNaN: isNaN,
  RegExp: RegExp,
});
context.window = context;
context.self = context;
context.globalThis = context;

// Load shared/dom-utils (needed by ir.js for isFieldVisible)
const domUtils = fs.readFileSync(path.join(EXT, 'shared/dom-utils.js'), 'utf8');
vm.runInContext(domUtils, context, { filename: 'shared/dom-utils.js' });

// Load models/ir.js
const irCode = fs.readFileSync(path.join(EXT, 'models/ir.js'), 'utf8');
vm.runInContext(irCode, context, { filename: 'models/ir.js' });

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log('\n=== Model Layer Availability ===');
assert(typeof context.ccModels === 'object', 'window.ccModels exists');
assert(typeof context.ccModels.PageModel === 'function', 'PageModel constructor exists');
assert(typeof context.ccModels.FormModel === 'function', 'FormModel constructor exists');
assert(typeof context.ccModels.FieldModel === 'function', 'FieldModel constructor exists');
assert(typeof context.ccModels.createPageModel === 'function', 'createPageModel bridge exists');
assert(context.ccModels.version === '1.0.0', 'IR version is 1.0.0');

console.log('\n=== FieldModel ===');
const field = context.ccModels.FieldModel({
  fieldId: '#candidate_name',
  label: 'Candidate Name',
  placeholder: 'Enter name',
  selector: '#candidate_name',
  id: 'candidate_name',
  name: 'candidate_name',
  type: 'text',
  index: 0,
  required: true,
  disabled: false,
  visible: true,
  value: '',
});
assert(field.fieldId === '#candidate_name', 'fieldId preserved');
assert(field.label === 'Candidate Name', 'label preserved');
assert(field.placeholder === 'Enter name', 'placeholder preserved');
assert(field.type === 'text', 'type preserved');
assert(field.required === true, 'required preserved');
assert(field.disabled === false, 'disabled preserved');
assert(field.visible === true, 'visible preserved');
assert(field.dependsOn === null, 'dependsOn defaults to null');
assert(field.semanticKey === null, 'semanticKey defaults to null');
assert(field.ariaLabel === null, 'ariaLabel defaults to null');

console.log('\n=== FieldModel defaults ===');
const emptyField = context.ccModels.FieldModel({});
assert(emptyField.fieldId === null, 'empty fieldId is null');
assert(emptyField.label === '', 'empty label is empty string');
assert(emptyField.type === 'text', 'default type is text');
assert(emptyField.visible === true, 'default visible is true');
assert(emptyField.required === false, 'default required is false');
assert(emptyField.index === -1, 'default index is -1');

console.log('\n=== FormModel ===');
const form = context.ccModels.FormModel({
  formKey: 'abc123',
  semanticFormKey: 's_xyz',
  fields: [
    { fieldId: '#name', label: 'Name', type: 'text', index: 0 },
    { fieldId: '#state', label: 'State', type: 'dropdown', index: 1, options: ['Bihar', 'UP'] },
    { fieldId: '#district', label: 'District', type: 'dropdown', index: 2, options: [] },
  ],
  hasFileUpload: false,
  hasCaptcha: true,
  hasSubmitButton: true,
  cascadeChains: [['#state', '#district']],
});
assert(form.formKey === 'abc123', 'formKey preserved');
assert(form.semanticFormKey === 's_xyz', 'semanticFormKey preserved');
assert(form.fields.length === 3, 'fields count correct');
assert(form.fieldCount === 3, 'fieldCount computed');
assert(form.hasCaptcha === true, 'hasCaptcha preserved');
assert(form.cascadeChains.length === 1, 'cascadeChains preserved');
assert(form.fields[0].label === 'Name', 'nested FieldModel created');
assert(form.fields[1].options.length === 2, 'options preserved through FieldModel');

console.log('\n=== PageModel ===');
const page = context.ccModels.PageModel({
  url: 'https://example.gov.in/apply',
  hostname: 'example.gov.in',
  title: 'Application Form',
  pageFingerprint: 's_xyz',
  forms: [{ formKey: 'abc', fields: [{ fieldId: '#f1', type: 'text' }] }],
  primaryForm: 0,
  frameworks: ['jquery', 'dwr'],
  isMultiPage: true,
  currentStep: 'Step 2',
  hasOtp: true,
});
assert(page.version === '1.0.0', 'PageModel has version');
assert(page.url === 'https://example.gov.in/apply', 'url preserved');
assert(page.hostname === 'example.gov.in', 'hostname preserved');
assert(page.pageFingerprint === 's_xyz', 'pageFingerprint preserved');
assert(page.forms.length === 1, 'forms array created');
assert(page.forms[0].fields.length === 1, 'nested FormModel→FieldModel created');
assert(page.primaryForm === 0, 'primaryForm index preserved');
assert(page.frameworks.length === 2, 'frameworks preserved');
assert(page.isMultiPage === true, 'isMultiPage preserved');
assert(page.currentStep === 'Step 2', 'currentStep preserved');
assert(page.hasOtp === true, 'hasOtp preserved');
assert(typeof page.extractedAt === 'string', 'extractedAt auto-generated');

console.log('\n=== createPageModel bridge ===');
// Simulate legacy extractor output (with _el still present, as fixed)
const mockEl = {
  getAttribute: function(attr) {
    if (attr === 'aria-label') return 'Full Name';
    if (attr === 'aria-describedby') return 'name-help';
    if (attr === 'aria-required') return 'true';
    if (attr === 'aria-disabled') return null;
    return null;
  },
  type: 'text',
  required: true,
  disabled: false,
  readOnly: false,
  closest: function() { return null; },
  getBoundingClientRect: function() { return { width: 200, height: 30 }; },
};
const legacyOutput = {
  formFields: [
    { selector: '#name', id: 'name', name: 'name', value: '', placeholder: 'Full name', label: 'Candidate Name', type: 'text', index: 0, options: null, _el: mockEl },
    { selector: '#state', id: 'state', name: 'state', value: '', placeholder: '', label: 'State', type: 'dropdown', index: 1, options: ['Bihar', 'UP', 'Maharashtra'], _el: null },
    { selector: '#dob', id: 'dob', name: 'dob', value: '', placeholder: 'dd-mm-yyyy', label: 'Date of Birth', type: 'text', index: 2, options: null, _el: null },
  ],
  formKey: 'test123',
  semanticFormKey: 's_test456',
};
const pageCtx = { url: 'https://portal.gov.in/form', hostname: 'portal.gov.in', title: 'Application' };
const result = context.ccModels.createPageModel(legacyOutput, pageCtx);

assert(result.version === '1.0.0', 'bridge: version set');
assert(result.url === 'https://portal.gov.in/form', 'bridge: url from context');
assert(result.hostname === 'portal.gov.in', 'bridge: hostname from context');
assert(result.forms.length === 1, 'bridge: one form created');
assert(result.forms[0].formKey === 'test123', 'bridge: formKey preserved');
assert(result.forms[0].fields.length === 3, 'bridge: all fields converted');
assert(result.forms[0].fields[0].fieldId === 'id:name', 'bridge: stable fieldId from id');
assert(result.forms[0].fields[0].label === 'Candidate Name', 'bridge: label preserved');
assert(result.forms[0].fields[0].placeholder === 'Full name', 'bridge: placeholder preserved');
assert(result.forms[0].fields[0].ariaLabel === 'Full Name', 'bridge: ariaLabel extracted from _el');
assert(result.forms[0].fields[0].ariaDescribedBy === 'name-help', 'bridge: ariaDescribedBy extracted from _el');
assert(result.forms[0].fields[0].required === true, 'bridge: required extracted from _el');
assert(result.forms[0].fields[0].inputType === 'text', 'bridge: inputType extracted from _el');
assert(result.forms[0].fields[1].type === 'dropdown', 'bridge: type preserved');
assert(result.forms[0].fields[1].options.length === 3, 'bridge: options preserved');
assert(result.forms[0].fields[1].widgetType === 'native-select', 'bridge: widgetType detected');
assert(result.forms[0].fields[1].fieldId === 'id:state', 'bridge: stable fieldId for state');
assert(result.pageFingerprint === 's_test456', 'bridge: fingerprint from semanticFormKey');

console.log('\n=== Serialization ===');
// Verify JSON.stringify works (no circular refs, no DOM objects)
const serialized = JSON.stringify(result);
assert(typeof serialized === 'string', 'PageModel is JSON-serializable');
const deserialized = JSON.parse(serialized);
assert(deserialized.version === '1.0.0', 'round-trip: version preserved');
assert(deserialized.forms[0].fields.length === 3, 'round-trip: fields preserved');
assert(deserialized.forms[0].fields[0].ariaLabel === 'Full Name', 'round-trip: ariaLabel survives serialization');
assert(deserialized.forms[0].fields[0].required === true, 'round-trip: required survives serialization');

console.log('\n=== Stable ID Generation ===');
// Field with no id/name should get hash-based ID
const noIdField = context.ccModels.FieldModel({ label: 'Father Name', type: 'text', index: 5 });
// createPageModel would use generateStableId — test via bridge
const noIdOutput = {
  formFields: [
    { selector: null, id: '', name: '', value: '', placeholder: '', label: 'Unknown Field', type: 'text', index: 0, options: null, _el: null },
  ],
  formKey: 'x', semanticFormKey: 's_x',
};
const noIdResult = context.ccModels.createPageModel(noIdOutput, pageCtx);
assert(noIdResult.forms[0].fields[0].fieldId.startsWith('f_'), 'hash-based fieldId for field without id/name');

console.log('\n=== Determinism ===');
const result2 = context.ccModels.createPageModel(legacyOutput, pageCtx);
// Remove extractedAt for comparison (timestamp will differ)
delete result.extractedAt;
delete result2.extractedAt;
assert(JSON.stringify(result) === JSON.stringify(result2), 'createPageModel is deterministic (same input → same output)');

console.log('\n─────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
