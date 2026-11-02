/**
 * label-still-matches.test.ts — a renamed title must not match the planned label.
 *
 * Run from the package: node --experimental-strip-types ../../tooling/run-package-tests.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/label-still-matches.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });

const globalLike = {};
const fn = new Function('globalThis', src);
fn(globalLike);
const { matches } = globalLike.CcLabelStillMatches;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}

function elWithLabel(label) {
  return {
    getAttribute: (name) => (name === 'aria-label' ? label : null),
    placeholder: '',
  };
}

console.log('\nSame selector, renamed title');
assert('Father name → Mother name does not match', matches(elWithLabel('Mother name'), 'Father name'), false);
assert('same label matches', matches(elWithLabel('Father name'), 'Father name'), true);
assert('punctuation and case collapse', matches(elWithLabel('Father-name'), 'Father name'), true);

console.log('\nMissing sides stay writable');
assert('empty expected label allows the write', matches(elWithLabel('Mother name'), ''), true);
assert('unreadable live label allows the write', matches(elWithLabel(''), 'Father name'), true);
assert('readLabel override sees the live title', matches(elWithLabel('Father name'), 'Father name', () => 'Mother name'), false);

console.log('\nSection heading bleed on the same widget');
{
  const dateEl = {
    id: 'dateBirth',
    name: 'dateBirth',
    placeholder: 'DD/MM/YYYY',
    getAttribute: () => null,
  };
  assert(
    'Country Of Nationality heading still matches retype DOB',
    matches(dateEl, 'Re-type Date Of Birth *', () => 'Country Of Nationality'),
    true,
  );
  assert(
    'heading on a different widget does not match',
    matches(elWithLabel('Country Of Nationality'), 'Father name'),
    false,
  );
}

console.log('\nRetype date labels stay the same widget');
assert(
  'Re-type vs Retype Date Of Birth still matches',
  matches(elWithLabel('Retype Date Of Birth'), 'Re-type Date Of Birth'),
  true,
);
assert(
  'Candidate Date Birth still matches planned Date Of Birth',
  matches(elWithLabel('Candidate Date Birth'), 'Re-type Date Of Birth'),
  true,
);
assert(
  'Mobile Number does not match planned Date Of Birth',
  matches(elWithLabel('Mobile Number'), 'Re-type Date Of Birth'),
  false,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
