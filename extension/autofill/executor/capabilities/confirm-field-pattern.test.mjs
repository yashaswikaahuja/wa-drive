/**
 * Tests for confirm-field-pattern.js
 *
 * Run: node extension/autofill/executor/capabilities/confirm-field-pattern.test.mjs
 *
 * Pure string tests — no DOM, no framework.
 * Behavioral reference: post-fill-confirm.js and post-fill-mirror.js (identical logic).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'confirm-field-pattern.js'), 'utf8');

const sandbox = {};
const fn = new Function('globalThis', src);
fn(sandbox);
const { isConfirmField, getBaseId } = sandbox.CcConfirmFieldPattern;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}

// ── isConfirmField: ID-based detection ───────────────────────────────────────
console.log('\nisConfirmField — ID patterns:');
assert('cPassword → true',          isConfirmField('cPassword'), true);
assert('cEmail → true',             isConfirmField('cEmail'), true);
assert('c (no letter) → false',     isConfirmField('c'), false);
assert('confirmPassword → true',    isConfirmField('confirmPassword'), true);
assert('confirm_email → true',      isConfirmField('confirm_email'), true);
assert('CONFIRM_DOB → true (case)', isConfirmField('CONFIRM_DOB'), true);
assert('retypePassword → true',     isConfirmField('retypePassword'), true);
assert('retype_email → true',       isConfirmField('retype_email'), true);
assert('re_typeEmail → true',       isConfirmField('re_typeEmail'), true);
assert('re_type_dob → true',        isConfirmField('re_type_dob'), true);
assert('re_enterMobile → true',     isConfirmField('re_enterMobile'), true);
assert('re_enter_mobile → true',    isConfirmField('re_enter_mobile'), true);
assert('verifyEmail → true',        isConfirmField('verifyEmail'), true);
assert('verify_mobile → true',      isConfirmField('verify_mobile'), true);
assert('VERIFY_EMAIL → true (case)',isConfirmField('VERIFY_EMAIL'), true);

console.log('\nisConfirmField — non-confirm IDs:');
assert('email → false',             isConfirmField('email'), false);
assert('password → false',          isConfirmField('password'), false);
assert('dob → false',               isConfirmField('dob'), false);
assert('mobile → false',            isConfirmField('mobile'), false);
assert('name → false',              isConfirmField('name'), false);
assert('state → false',             isConfirmField('state'), false);

console.log('\nisConfirmField — null/empty:');
assert('null → false',              isConfirmField(null), false);
assert('undefined → false',         isConfirmField(undefined), false);
assert('"" → false',                isConfirmField(''), false);

console.log('\nisConfirmField — label-based detection:');
assert('id=email label=Confirm Email → true',
  isConfirmField('email', 'Confirm Email Address'), true);
assert('id=email label=Retype Password → true',
  isConfirmField('email', 'Retype Password'), true);
assert('id=email label=Verify Mobile → true',
  isConfirmField('email', 'Verify Mobile Number'), true);
assert('id=email label=Enter Email → false',
  isConfirmField('email', 'Enter Email'), false);
assert('id=email label=null → false',
  isConfirmField('email', null), false);
assert('id=null label=Confirm Email → false (no id)',
  isConfirmField(null, 'Confirm Email'), false);

// ── getBaseId ─────────────────────────────────────────────────────────────────
console.log('\ngetBaseId — prefix stripping:');
// NOTE: ^c(?=[a-z]) only matches 'c' followed by a LOWERCASE letter.
// 'cPassword' → unchanged (P is uppercase)
// 'cpassword' → 'password' (p is lowercase)
assert('cPassword → cPassword (P uppercase, no strip)', getBaseId('cPassword'), 'cPassword');
assert('cEmail → cEmail (E uppercase, no strip)',        getBaseId('cEmail'), 'cEmail');
assert('cpassword → password (p lowercase)',             getBaseId('cpassword'), 'password');
// NOTE: confirmPassword → strips 'c' (because 'c' followed by lowercase 'o' matches ^c(?=[a-z]))
// leaving 'onfirmPassword'. This is the legacy behavior from the original code.
// The ^c(?=[a-z]) rule fires before ^confirm, so 'confirm*' gets the 'c' stripped, not 'confirm'.
assert('confirmPassword → onfirmPassword (legacy)', getBaseId('confirmPassword'), 'onfirmPassword');
assert('confirm_email → onfirm_email (legacy)',     getBaseId('confirm_email'), 'onfirm_email');
assert('confirmEmail → onfirmEmail (legacy)',        getBaseId('confirmEmail'), 'onfirmEmail');
assert('retypePassword → Password',     getBaseId('retypePassword'), 'Password');
assert('retype_email → email',          getBaseId('retype_email'), 'email');
assert('re_typeEmail → Email',          getBaseId('re_typeEmail'), 'Email');
assert('re_type_dob → dob',             getBaseId('re_type_dob'), 'dob');
assert('re_enterMobile → Mobile',       getBaseId('re_enterMobile'), 'Mobile');
assert('re_enter_mobile → mobile',      getBaseId('re_enter_mobile'), 'mobile');
assert('verifyEmail → Email',           getBaseId('verifyEmail'), 'Email');
assert('verify_mobile → mobile',        getBaseId('verify_mobile'), 'mobile');

console.log('\ngetBaseId — non-confirm (unchanged):');
assert('email → email',                 getBaseId('email'), 'email');
assert('password → password',           getBaseId('password'), 'password');
assert('dob → dob',                     getBaseId('dob'), 'dob');
assert('state → state',                 getBaseId('state'), 'state');

console.log('\ngetBaseId — null/empty:');
assert('null → ""',                     getBaseId(null), '');
assert('undefined → ""',               getBaseId(undefined), '');
assert('"" → ""',                       getBaseId(''), '');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
