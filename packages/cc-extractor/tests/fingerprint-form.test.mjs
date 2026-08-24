/**
 * fingerprint-form.test.mjs — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../src/fingerprint-form.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { fingerprint, _djb2 } = root.CcFingerprintForm;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

const opts = { hostname: 'ssc.gov.in', title: 'Application Form' };

// ── djb2 hash ─────────────────────────────────────────────────────────────────
console.log('\ndjb2 hash');
assert('empty string hashes to 0', _djb2(''), '0');
assert('same input → same hash', _djb2('hello'), _djb2('hello'));
assert('different input → different hash', _djb2('hello') !== _djb2('world'), true);
assert('hash is alphanumeric string', /^[a-z0-9]+$/.test(_djb2('test')), true);

// ── formKey ───────────────────────────────────────────────────────────────────
console.log('\nformKey');
{
  const fields = [{ label: 'Name', _el: {} }, { label: 'DOB', _el: {} }];
  const { formKey } = fingerprint(fields, ['name', 'dob'], opts);
  assert('formKey is non-empty string', formKey.length > 0, true);
  assert('formKey is alphanumeric', /^[a-z0-9]+$/.test(formKey), true);
}

// ── formKey stability ─────────────────────────────────────────────────────────
{
  const f1 = [{ label: 'Name', _el: {} }];
  const f2 = [{ label: 'Name', _el: {} }];
  const k1 = fingerprint(f1, ['name'], opts).formKey;
  const k2 = fingerprint(f2, ['name'], opts).formKey;
  assert('same inputs → same formKey', k1, k2);
}

// ── formKey changes with different hostname ───────────────────────────────────
{
  const f1 = [{ label: 'Name', _el: {} }];
  const f2 = [{ label: 'Name', _el: {} }];
  const k1 = fingerprint(f1, ['name'], { hostname: 'site-a.com', title: 'Form' }).formKey;
  const k2 = fingerprint(f2, ['name'], { hostname: 'site-b.com', title: 'Form' }).formKey;
  assert('different hostname → different formKey', k1 !== k2, true);
}

// ── semanticFormKey ───────────────────────────────────────────────────────────
console.log('\nsemanticFormKey');
{
  const fields = [{ label: 'Full Name', _el: {} }, { label: 'Date of Birth', _el: {} }];
  const { semanticFormKey } = fingerprint(fields, ['fullname','dateofbirth'], opts);
  assert('starts with s_', semanticFormKey.startsWith('s_'), true);
  assert('is non-empty', semanticFormKey.length > 2, true);
}

// ── semanticFormKey stable across label order ─────────────────────────────────
{
  const f1 = [{ label: 'Name', _el: {} }, { label: 'Email', _el: {} }];
  const f2 = [{ label: 'Email', _el: {} }, { label: 'Name', _el: {} }];
  const k1 = fingerprint(f1, [], opts).semanticFormKey;
  const k2 = fingerprint(f2, [], opts).semanticFormKey;
  assert('semanticFormKey stable across order', k1, k2);
}

// ── _el stripped from fields ──────────────────────────────────────────────────
console.log('\n_el stripping');
{
  const fields = [{ label: 'Name', _el: { nodeType: 1 } }];
  fingerprint(fields, ['name'], opts);
  assert('_el removed from fields', fields[0]._el, undefined);
}

// ── pageModel built when ccModels provided ────────────────────────────────────
console.log('\npageModel');
{
  let capturedArgs = null;
  const ccModels = {
    createPageModel: (fieldData, meta) => { capturedArgs = { fieldData, meta }; return { model: true }; }
  };
  const fields = [{ label: 'Name', _el: {} }];
  const { pageModel } = fingerprint(fields, ['name'], { ...opts, ccModels, url: 'https://ssc.gov.in/form' });
  assert('pageModel returned', pageModel !== null, true);
  assert('createPageModel called with formKey', capturedArgs.fieldData.formKey !== undefined, true);
  assert('createPageModel called with hostname', capturedArgs.meta.hostname, 'ssc.gov.in');
}

// ── pageModel null when ccModels not provided ─────────────────────────────────
{
  const fields = [{ label: 'Name', _el: {} }];
  const { pageModel } = fingerprint(fields, ['name'], opts);
  assert('pageModel null without ccModels', pageModel, null);
}

// ── top-10 labels for formKey ─────────────────────────────────────────────────
console.log('\nLabel truncation');
{
  const manyLabels = Array.from({ length: 15 }, (_, i) => 'label' + i);
  const fields = manyLabels.map(l => ({ label: l, _el: {} }));
  // formKey should use top-10 sorted labels
  const { formKey: k1 } = fingerprint(fields.slice(), manyLabels.slice(0, 10).sort(), opts);
  const { formKey: k2 } = fingerprint(fields.slice(), manyLabels.slice(0, 10).sort(), opts);
  assert('formKey consistent with top-10 labels', k1, k2);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
