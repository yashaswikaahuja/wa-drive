/**
 * orchestrator-capabilities.test.mjs
 * Tests for script-manifests and flatten-profile (pure, no browser).
 * Plain Node, no framework.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function load(name) {
  const src = readFileSync(path.join(__dirname, name), 'utf8');
  const r = {};
  new Function('globalThis', src)(r);
  return r;
}

const { CcScriptManifests } = load('script-manifests.js');
const { CcFlattenProfile }  = load('flatten-profile.js');

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── CcScriptManifests ─────────────────────────────────────────────────────────
console.log('\nCcScriptManifests');
const { PRODUCT_PATH_SCRIPTS, SEQUENTIAL_KERNEL_SCRIPTS } = CcScriptManifests;

assert('PRODUCT_PATH_SCRIPTS is array',    Array.isArray(PRODUCT_PATH_SCRIPTS), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS is array', Array.isArray(SEQUENTIAL_KERNEL_SCRIPTS), true);
assert('PRODUCT_PATH_SCRIPTS has errors.js', PRODUCT_PATH_SCRIPTS.includes('runtime/errors.js'), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS has extractor-bundle', SEQUENTIAL_KERNEL_SCRIPTS.includes('autofill/extractor-bundle.js'), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS has mapper-bundle', SEQUENTIAL_KERNEL_SCRIPTS.includes('autofill/mapper-bundle.js'), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS has executor-bundle', SEQUENTIAL_KERNEL_SCRIPTS.includes('autofill/executor-bundle.js'), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS has derive.js', SEQUENTIAL_KERNEL_SCRIPTS.includes('autofill/derive.js'), true);
assert('SEQUENTIAL_KERNEL_SCRIPTS has rule-engine.js', SEQUENTIAL_KERNEL_SCRIPTS.includes('autofill/rule-engine.js'), true);

// Frozen arrays
try { PRODUCT_PATH_SCRIPTS.push('test'); assert('PRODUCT_PATH_SCRIPTS is frozen', false, true); }
catch (e) { assert('PRODUCT_PATH_SCRIPTS is frozen', true, true); }
try { SEQUENTIAL_KERNEL_SCRIPTS.push('test'); assert('SEQUENTIAL_KERNEL_SCRIPTS is frozen', false, true); }
catch (e) { assert('SEQUENTIAL_KERNEL_SCRIPTS is frozen', true, true); }

// No duplicates
assert('PRODUCT_PATH_SCRIPTS no duplicates', PRODUCT_PATH_SCRIPTS.length, new Set(PRODUCT_PATH_SCRIPTS).size);
assert('SEQUENTIAL_KERNEL_SCRIPTS no duplicates', SEQUENTIAL_KERNEL_SCRIPTS.length, new Set(SEQUENTIAL_KERNEL_SCRIPTS).size);

// ── CcFlattenProfile ──────────────────────────────────────────────────────────
console.log('\nCcFlattenProfile');
const { flattenProfile } = CcFlattenProfile;

// Flat profile passthrough
assert('flat profile unchanged',
  flattenProfile({ name: 'Rahul', mobile: '9999999999' }),
  { name: 'Rahul', mobile: '9999999999' });

// Nested { value } objects flattened
assert('nested value objects flattened',
  flattenProfile({ name: { value: 'Rahul' }, dob: { value: '01/01/1990' } }),
  { name: 'Rahul', dob: '01/01/1990' });

// profile.data unwrapped
assert('profile.data unwrapped',
  flattenProfile({ data: { name: 'Rahul', mobile: '9999' } }),
  { name: 'Rahul', mobile: '9999' });

// profile.name preserved
assert('profile.name preserved on top-level',
  flattenProfile({ name: 'Rahul', data: { mobile: '9999' } }).name,
  'Rahul');

// Mixed nested and flat
assert('mixed nested and flat',
  flattenProfile({ name: 'Rahul', dob: { value: '01/01/1990' }, mobile: '9999' }),
  { name: 'Rahul', dob: '01/01/1990', mobile: '9999' });

// null/empty
assert('null profile → empty', flattenProfile(null), {});
assert('empty profile → empty', flattenProfile({}), {});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
