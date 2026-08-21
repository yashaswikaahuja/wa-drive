/**
 * correction-observer.test.mjs — plain Node tests, no framework, no jsdom
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, 'correction-observer.js'), 'utf8');
const root = {};
new Function('globalThis', src)(root);
const { _isValidValue, _SEMANTIC_ALIASES } = root.CcCorrectionObserver;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', JSON.stringify(expected)); console.error('    actual:  ', JSON.stringify(actual)); failed++; }
}

// ── isValidValue ──────────────────────────────────────────────────────────────
console.log('\nisValidValue — dob');
assert('valid dob', _isValidValue('dob', '01/01/1990'), true);
assert('invalid dob (no slashes)', _isValidValue('dob', '01011990'), false);
assert('invalid dob (wrong format)', _isValidValue('dob', '1990-01-01'), false);

console.log('\nisValidValue — pincode');
assert('valid pincode', _isValidValue('pincode', '110001'), true);
assert('invalid pincode (5 digits)', _isValidValue('pincode', '11000'), false);
assert('invalid pincode (7 digits)', _isValidValue('pincode', '1100011'), false);
assert('invalid pincode (letters)', _isValidValue('pincode', 'abc123'), false);

console.log('\nisValidValue — mobile');
assert('valid mobile', _isValidValue('mobile', '9876543210'), true);
assert('invalid mobile (9 digits)', _isValidValue('mobile', '987654321'), false);
assert('invalid mobile (11 digits)', _isValidValue('mobile', '98765432101'), false);

console.log('\nisValidValue — aadhaar');
assert('valid aadhaar', _isValidValue('aadhaar_number', '123456789012'), true);
assert('invalid aadhaar (11 digits)', _isValidValue('aadhaar_number', '12345678901'), false);

console.log('\nisValidValue — name fields');
assert('valid name', _isValidValue('name', 'Rahul Kumar'), true);
assert('valid father_name', _isValidValue('father_name', 'Ram Kumar'), true);
assert('invalid name (too short)', _isValidValue('name', 'R'), false);
assert('invalid name (digits)', _isValidValue('name', 'User123'), false);

console.log('\nisValidValue — generic');
assert('generic valid (2+ chars)', _isValidValue('address', 'Flat 5B'), true);
assert('generic invalid (1 char)', _isValidValue('address', 'X'), false);
assert('generic invalid (>200 chars)', _isValidValue('address', 'x'.repeat(201)), false);

// ── SEMANTIC_ALIASES ──────────────────────────────────────────────────────────
console.log('\nSEMANTIC_ALIASES');
assert('full name → name', _SEMANTIC_ALIASES['full name'], 'name');
assert('candidate name → name', _SEMANTIC_ALIASES['candidate name'], 'name');
assert('date of birth → dob', _SEMANTIC_ALIASES['date of birth'], 'dob');
assert('aadhaar no → aadhaar_number', _SEMANTIC_ALIASES['aadhaar no'], 'aadhaar_number');
assert('mobile no → mobile', _SEMANTIC_ALIASES['mobile no'], 'mobile');
assert('pin code → pincode', _SEMANTIC_ALIASES['pin code'], 'pincode');
assert('email id → email', _SEMANTIC_ALIASES['email id'], 'email');

// ── inject — correction listener fires on change ──────────────────────────────
console.log('\ninject — correction listener');
{
  const { inject } = root.CcCorrectionObserver;
  const listeners = {};
  const sessionData = {};
  const el = {
    value: 'NewDelhi',
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    _ccTimer: null,
  };
  const doc = {
    querySelector: (sel) => el,
    querySelectorAll: () => [],
  };
  const mapping = { '#city': { value: 'Delhi' } };
  const filledBySource = { '#city': { semanticKey: 'city', profileKey: 'city_key' } };
  const profile = { city_key: 'Delhi', new_city_key: 'NewDelhi' };

  // Stub sessionStorage
  const origSS = global.sessionStorage;
  global.sessionStorage = { setItem: (k,v) => { sessionData[k] = v; }, getItem: () => '[]', removeItem: () => {} };

  inject(mapping, filledBySource, profile, null, 'form123', doc);
  assert('change listener registered', typeof listeners['change'], 'function');

  // Trigger change
  listeners['change']();
  const saved = JSON.parse(sessionData['_cc_corrections'] || '[]');
  assert('correction saved to sessionStorage', saved.length, 1);
  assert('correct semanticKey', saved[0].semanticKey, 'city');
  assert('correct newKey', saved[0].newKey, 'new_city_key');

  global.sessionStorage = origSS;
}

// ── inject — no correction if value unchanged ─────────────────────────────────
{
  const { inject } = root.CcCorrectionObserver;
  const listeners = {};
  const sessionData = {};
  const el = { value: 'Delhi', addEventListener: (ev, fn) => { listeners[ev] = fn; } };
  const doc = { querySelector: () => el, querySelectorAll: () => [] };
  const mapping = { '#city': { value: 'Delhi' } };
  const filledBySource = { '#city': { semanticKey: 'city', profileKey: 'city_key' } };

  global.sessionStorage = { setItem: (k,v) => { sessionData[k] = v; }, getItem: () => '[]', removeItem: () => {} };
  inject(mapping, filledBySource, {}, null, null, doc);
  listeners['change']();
  assert('no correction when value unchanged', sessionData['_cc_corrections'], undefined);
  global.sessionStorage = undefined;
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
