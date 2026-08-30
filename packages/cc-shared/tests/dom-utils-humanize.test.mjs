/**
 * Pure-unit tests for humanizeAttr / isGoodLabel logic (no jsdom).
 * Re-implements the pure helpers by evaluating the IIFE with a stub window.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/dom-utils.js'), 'utf8');

// Stub minimal browser globals so the IIFE can load in Node
const windowStub = {};
const documentStub = {
  querySelector: () => null,
  getElementById: () => null,
};
globalThis.window = windowStub;
globalThis.document = documentStub;
globalThis.CSS = { escape: (s) => String(s).replace(/"/g, '\\"') };
globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });

new Function('window', 'document', 'CSS', 'getComputedStyle', src)(
  windowStub, documentStub, globalThis.CSS, globalThis.getComputedStyle
);

const { humanizeAttr, isGoodLabel, getLabel } = windowStub.ccDomUtils;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = actual === expected;
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '| expected:', JSON.stringify(expected), 'actual:', JSON.stringify(actual)); failed++; }
}

console.log('\nhumanizeAttr');
assert('camelCase', humanizeAttr('fatherName'), 'Father Name');
assert('snake_case', humanizeAttr('father_name'), 'Father Name');
assert('strips txt prefix', humanizeAttr('txtFatherName'), 'Father Name');
assert('strips ddl prefix', humanizeAttr('ddlState'), 'State');
assert('rejects mat-input-3', humanizeAttr('mat-input-3'), '');
assert('rejects uuid', humanizeAttr('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), '');
assert('rejects empty', humanizeAttr(''), '');
assert('formcontrol-ish camel', humanizeAttr('dateOfBirth'), 'Date Of Birth');

console.log('\nisGoodLabel');
assert('accepts Father Name', isGoodLabel('Father Name'), true);
assert('rejects Select', isGoodLabel('Select'), false);
assert('rejects Please select', isGoodLabel('Please select'), false);
assert('rejects short', isGoodLabel('*'), false);

console.log('\ngetLabel aria-labelledby multi-id');
{
  const spans = {
    a: { textContent: 'Father' },
    b: { textContent: 'Name' },
  };
  documentStub.getElementById = (id) => spans[id] || null;
  const el = {
    id: '',
    name: '',
    placeholder: '',
    getAttribute: (k) => (k === 'aria-labelledby' ? 'a b' : null),
    closest: () => null,
    parentElement: null,
    previousElementSibling: null,
  };
  assert('joins multi-id labelledby', getLabel(el), 'Father Name');
  documentStub.getElementById = () => null;
}

console.log('\ngetLabel humanize fallback');
{
  const el = {
    id: 'txtDistrict',
    name: '',
    placeholder: '',
    getAttribute: () => null,
    closest: () => null,
    parentElement: null,
    previousElementSibling: null,
  };
  assert('humanizes id when no DOM label', getLabel(el), 'District');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
