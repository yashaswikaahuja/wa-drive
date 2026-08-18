/**
 * T17 — CLI audit: portal mask + date format aware
 * Run: node cyb-cli/src/report.test.mjs
 */
import {
  valuesAgree,
  isMaskedActual,
  auditValue,
  normalizeSessionRecords,
} from './report.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok  ', msg);
  }
}

// Mask detection
assert(isMaskedActual('********8335') === true, 'Aadhaar-style mask');
assert(isMaskedActual('••••••8335') === true, 'bullet mask');
assert(isMaskedActual('9155049176188766') === false, 'full Aadhaar not mask');
assert(isMaskedActual('hello') === false, 'plain text not mask');

// valuesAgree — exact
assert(valuesAgree('Bihar', 'Bihar') === true, 'exact match');
assert(valuesAgree('BIHAR', 'bihar') === true, 'case/normalize');

// valuesAgree — portal mask (SSC)
assert(valuesAgree('9155049176188766', '********8335') === false
  || valuesAgree('9155049176188766', '********8766') === true,
  'mask agrees on last-4 when tail matches');
assert(valuesAgree('9155049176188766', '********8766') === true, 'last-4 8766 matches planned');

// valuesAgree — date formats
assert(valuesAgree('15/03/1995', '1995-03-15') === true, 'DD/MM/YYYY vs ISO');
assert(valuesAgree('1995-03-15', '15/03/1995') === true, 'ISO vs DD/MM/YYYY');
assert(valuesAgree('15-03-1995', '1995-03-15') === true, 'DD-MM-YYYY vs ISO');

// auditValue — no VERIFIED_LIE on portal mask success
{
  const a = auditValue({
    result: 'filled',
    label: 'Aadhaar',
    value: '9155049176188766',
    actualValue: '********8766',
    verified: true,
  });
  assert(!a.flags.includes('VERIFIED_LIE'), 'masked actual not VERIFIED_LIE');
  assert(a.flags.includes('PORTAL_MASKED') || !a.flags.includes('VALUE_MISMATCH'),
    'PORTAL_MASKED or agree without mismatch');
}

// auditValue — real mismatch still flagged
{
  const a = auditValue({
    result: 'filled',
    label: 'Email',
    value: 'a@b.com',
    actualValue: 'other@x.com',
    verified: true,
  });
  assert(a.flags.includes('VALUE_MISMATCH'), 'real mismatch');
  assert(a.flags.includes('VERIFIED_LIE'), 'verified lie on real mismatch');
}

// normalize envelope
assert(
  normalizeSessionRecords({ records: { _metrics: {}, records: [{ result: 'filled' }] } }).length === 1,
  'unwrap T16 envelope'
);
assert(normalizeSessionRecords({ records: [{ a: 1 }] }).length === 1, 'plain array');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll T17 report tests passed');
