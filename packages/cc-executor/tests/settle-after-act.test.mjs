/**
 * Tests for settle-after-act.js
 *
 * Run: node extension/autofill/executor/capabilities/settle-after-act.test.mjs
 *
 * No DOM, no Chrome. waitForNetworkIdle and waitForOptions injected as mocks.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '../src/settle-after-act.js'), 'utf8');

const globalLike = {};
new Function('globalThis', src)(globalLike);
const { createSettleEngine } = globalLike.CcSettleAfterAct;

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— got:', val); failed++; }
}
function is(desc, a, b) {
  if (a === b) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc, '— expected:', b, 'got:', a); failed++; }
}

function makeEngine(budgetMs, networkMs) {
  let budget = budgetMs;
  const idle = { idle: true, waitedMs: networkMs || 0 };
  const eng = createSettleEngine({
    waitForNetworkIdle: () => new Promise(r => setTimeout(() => r(idle), networkMs || 0)),
    waitForOptions: (sel, min, timeout) => new Promise(r => setTimeout(() => r({ sel }), 10)),
    getBudget: () => budget,
    setBudget: (n) => { budget = n; },
  });
  return { eng, getBudget: () => budget };
}

// ── text kind: flat 100ms, no network poll ────────────────────────────────────
console.log('\nsettleAfterAct text:');
{
  const { eng } = makeEngine(5000, 0);
  const t0 = Date.now();
  const r = await eng.settleAfterAct('text');
  const elapsed = Date.now() - t0;
  is('result kind', r.kind, 'text');
  ok('waited ~100ms', elapsed >= 90 && elapsed < 300);
  ok('idle true', r.idle === true);
  ok('waitedMs 100', r.waitedMs === 100);
}

// ── choice kind: uses network idle ────────────────────────────────────────────
console.log('\nsettleAfterAct choice:');
{
  const { eng, getBudget } = makeEngine(5000, 10);
  const r = await eng.settleAfterAct('choice');
  is('kind is choice', r.kind, 'choice');
  ok('budget decremented', getBudget() < 5000);
}

// ── budget caps maxNet ────────────────────────────────────────────────────────
console.log('\nBudget capping:');
{
  // budget=0 → maxNet capped to 400
  const { eng } = makeEngine(0, 0);
  const r = await eng.settleAfterAct('select');
  ok('select with zero budget completes', r.kind === 'select');
}

// ── opts.budgetMs overrides getBudget ─────────────────────────────────────────
{
  const { eng } = makeEngine(5000, 0);
  // passing budgetMs: 300 should cap maxNet to 300
  const r = await eng.settleAfterAct('select', { budgetMs: 300 });
  ok('custom budgetMs accepted', r.kind === 'select');
}

// ── waitForSelectOptionsSequential ───────────────────────────────────────────
console.log('\nwaitForSelectOptionsSequential:');
{
  const fakeEl = { tagName: 'SELECT' };
  let budget = 3000;
  const eng = createSettleEngine({
    waitForNetworkIdle: () => Promise.resolve({ idle: true, waitedMs: 0 }),
    waitForOptions: () => Promise.resolve(fakeEl),
    getBudget: () => budget,
    setBudget: (n) => { budget = n; },
  });
  const el = await eng.waitForSelectOptionsSequential('#s', 3000);
  ok('resolves with element from waitForOptions', el === fakeEl);
  ok('budget decremented', budget < 3000);
}

// ── budget never goes below 0 ─────────────────────────────────────────────────
{
  const { eng, getBudget } = makeEngine(1, 500);
  await eng.settleAfterAct('choice');
  ok('budget does not go below 0', getBudget() >= 0);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
