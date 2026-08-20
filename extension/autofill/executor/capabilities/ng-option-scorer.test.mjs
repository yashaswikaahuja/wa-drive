/**
 * Tests for ng-option-scorer.js
 *
 * Run: node extension/autofill/executor/capabilities/ng-option-scorer.test.mjs
 *
 * Pure JS — no DOM, no framework.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, 'ng-option-scorer.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const { scoreOption, scoreAndPick } = globalLike.CcNgOptionScorer;

let passed = 0, failed = 0;
function is(desc, actual, expected) {
  const ok = actual === expected;
  if (ok) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected:', expected, 'got:', actual); failed++; }
}
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}

// ── scoreOption ───────────────────────────────────────────────────────────────
console.log('\nExact match (100):');
is('exact match', scoreOption('Bihar', 'Bihar'), 100);
is('case-insensitive exact', scoreOption('BIHAR', 'bihar'), 100);
is('trimmed', scoreOption('  Bihar  ', 'Bihar'), 100);

console.log('\nContains (80):');
is('optText contains planned', scoreOption('Bihar (BR)', 'Bihar'), 80);
is('longer option contains value', scoreOption('Uttar Pradesh', 'Pradesh'), 80);

console.log('\nReverse contains (70):');
is('planned contains optText (>3 chars)', scoreOption('Male', 'Male (M)'), 70);
// Short optText ≤3 chars should NOT get 70
ok('short optText ≤3 chars no reverse-contains', scoreOption('M', 'Male (M)') < 70);

console.log('\nToken overlap ≥2 (60):');
is('two matching tokens', scoreOption('Post Graduate Degree', 'Post Graduate'), 80); // contains wins
is('overlap-2 via token split', scoreOption('Higher Secondary Certificate', 'Higher Secondary School'), 60);

console.log('\nEducation synonyms (55):');
is('intermediate vs higher secondary', scoreOption('Higher Secondary (10+2)', 'intermediate'), 55);
// Token overlap (single token '10th') fires before synonym check → returns 50.
// Token overlap rule: overlap=1 and vToks.length=2 (≤2) → 50.
is('10th vs matriculation (token overlap wins at 50)', scoreOption('Matriculation / 10th', '10th class'), 50);
is('graduation vs bachelor', scoreOption('Bachelor of Arts', 'graduation'), 55);
// 'master' (without s) added to synonym table — 'Master of Science'.includes('master') = true
is('post grad vs masters', scoreOption('Master of Science', 'post graduation'), 55);

console.log('\nSingle token short string (50):');
// 'males only'.includes('male') = true, optText.length=4>3 → reverse-contains (70)
is('Male vs Males Only — reverse-contains', scoreOption('Male', 'Males Only'), 70);
// Force a true single-token-only case: no contains, no reverse
// 'Regd No' vs 'Registration': no token overlap (regd≠registration, no≠registration)
is('no-match short strings', scoreOption('Regd No', 'Registration'), 0);

console.log('\nNo match (0):');
is('completely different', scoreOption('Maharashtra', 'Bihar'), 0);
is('empty option', scoreOption('', 'Bihar'), 0);
is('empty planned', scoreOption('Bihar', ''), 0);
is('both empty', scoreOption('', ''), 0);

// ── scoreAndPick ──────────────────────────────────────────────────────────────
console.log('\nscoreAndPick:');
{
  const opts = [
    { text: 'Uttar Pradesh', node: 'a' },
    { text: 'Bihar', node: 'b' },
    { text: 'Maharashtra', node: 'c' },
  ];
  const r = scoreAndPick(opts, 'Bihar');
  ok('picks exact match', r && r.node === 'b' && r.score === 100);
}
{
  const opts = [
    { text: 'Higher Secondary (10+2)', node: 'a' },
    { text: 'Graduation', node: 'b' },
  ];
  const r = scoreAndPick(opts, 'intermediate');
  ok('picks synonym match', r && r.node === 'a' && r.score === 55);
}
{
  const opts = [
    { text: 'Completely different', node: 'a' },
  ];
  ok('returns null when no match above minScore', scoreAndPick(opts, 'Bihar') === null);
}
{
  // minScore override: old _ngPickOption used 30
  const opts = [
    { text: 'Bihar state', node: 'a' }, // score 80 (contains)
  ];
  const r = scoreAndPick(opts, 'Bihar', 30);
  ok('minScore=30 accepts score 80', r && r.node === 'a');
}
{
  // picks best when multiple match
  const opts = [
    { text: 'Bihar (state)', node: 'a' },  // 80
    { text: 'Bihar', node: 'b' },           // 100
    { text: 'New Bihar Colony', node: 'c' }, // 80
  ];
  const r = scoreAndPick(opts, 'Bihar');
  ok('picks highest scorer', r && r.node === 'b' && r.score === 100);
}
{
  ok('scoreAndPick empty list returns null', scoreAndPick([], 'Bihar') === null);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
