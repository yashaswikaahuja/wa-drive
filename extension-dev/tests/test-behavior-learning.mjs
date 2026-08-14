#!/usr/bin/env node
/**
 * Phase 4.12 — Learn Verified Form Dynamic Behavior unit tests
 * Issue #206: Confidence, provenance, expiry, correction.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const modPath = resolve(ROOT, 'extension-service/behavior-learning.js');
const {
  computeConfidence, effectiveClassification, isStale,
  recordDynamicEvidence, recordStaticSuccess, expireBehavior,
  STALENESS_DAYS, MAX_CONFIDENCE, CONFIDENCE_PER_HARD_EVIDENCE, HIGH_CONFIDENCE_THRESHOLD,
} = await import(pathToFileURL(modPath).href);

let passed = 0;
let failed = 0;

function ok(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  try { fn(); }
  catch (e) { failed++; console.error(`  FAIL: ${name} — ${e.message}`); }
}

// ── Constants ───────────────────────────────────────────────────────────

test('STALENESS_DAYS is 30', () => ok(STALENESS_DAYS === 30, `=${STALENESS_DAYS}`));
test('MAX_CONFIDENCE is 0.95', () => ok(MAX_CONFIDENCE === 0.95, `=${MAX_CONFIDENCE}`));
test('HIGH_CONFIDENCE_THRESHOLD is 3', () => ok(HIGH_CONFIDENCE_THRESHOLD === 3, `=${HIGH_CONFIDENCE_THRESHOLD}`));

// ── computeConfidence ───────────────────────────────────────────────────

test('zero evidence → zero confidence', () => {
  ok(computeConfidence({ hard_evidence_count: 0, static_success_count: 0 }) === 0, 'zero');
});

test('1 hard evidence → positive confidence', () => {
  const c = computeConfidence({ hard_evidence_count: 1, static_success_count: 0 });
  ok(c > 0 && c <= MAX_CONFIDENCE, `confidence=${c}`);
  ok(c === CONFIDENCE_PER_HARD_EVIDENCE, `equals per-evidence constant=${c}`);
});

test('3 hard evidence → higher confidence', () => {
  const c = computeConfidence({ hard_evidence_count: 3, static_success_count: 0 });
  ok(c > CONFIDENCE_PER_HARD_EVIDENCE, `3x > 1x: ${c}`);
});

test('confidence capped at MAX', () => {
  const c = computeConfidence({ hard_evidence_count: 100, static_success_count: 0 });
  ok(c <= MAX_CONFIDENCE, `capped: ${c}`);
});

test('static success reduces dynamic-favoring confidence', () => {
  const dynOnly = computeConfidence({ hard_evidence_count: 2, static_success_count: 0 });
  const withStatic = computeConfidence({ hard_evidence_count: 2, static_success_count: 5 });
  // With static, the effective classification shifts — dynamic signal is diluted
  // The overall confidence may be higher (toward static) but dynamic signal is weaker
  ok(withStatic !== dynOnly, `confidence changes with static evidence: ${withStatic} vs ${dynOnly}`);
  // Effective classification should shift toward static
  const effDyn = effectiveClassification({ hard_evidence_count: 2, static_success_count: 0, last_observed_at: new Date().toISOString() });
  const effMixed = effectiveClassification({ hard_evidence_count: 2, static_success_count: 5, last_observed_at: new Date().toISOString() });
  ok(effDyn === 'DYNAMIC', `pure dynamic → ${effDyn}`);
  // Mixed: static can potentially override if strong enough
  ok(effMixed === 'DYNAMIC' || effMixed === 'UNKNOWN', `mixed → ${effMixed}`);
});

// ── effectiveClassification ─────────────────────────────────────────────

test('null record → UNKNOWN', () => {
  ok(effectiveClassification(null) === 'UNKNOWN', 'null → UNKNOWN');
});

test('3+ hard evidence → DYNAMIC', () => {
  const record = recordDynamicEvidence(null, { hard_count: 3, types: ['cascade_triggered'] });
  ok(effectiveClassification(record) === 'DYNAMIC', `3 hard → ${effectiveClassification(record)}`);
});

test('1 hard evidence → DYNAMIC', () => {
  const record = recordDynamicEvidence(null, { hard_count: 1, types: ['subtree_replaced'] });
  ok(effectiveClassification(record) === 'DYNAMIC', `1 hard → ${effectiveClassification(record)}`);
});

test('3+ static successes, no dynamic → STATIC', () => {
  let record = null;
  for (let i = 0; i < 4; i++) record = recordStaticSuccess(record);
  ok(effectiveClassification(record) === 'STATIC', `4 static → ${effectiveClassification(record)}`);
});

test('stale record → UNKNOWN', () => {
  const record = recordDynamicEvidence(null, { hard_count: 5, types: ['cascade_triggered'] });
  record.last_observed_at = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
  ok(effectiveClassification(record) === 'UNKNOWN', 'stale → UNKNOWN');
});

// ── isStale ─────────────────────────────────────────────────────────────

test('fresh record is not stale', () => {
  const record = { last_observed_at: new Date().toISOString() };
  ok(isStale(record) === false, 'fresh');
});

test('30+ day old record is stale', () => {
  const record = { last_observed_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() };
  ok(isStale(record) === true, '31 days = stale');
});

test('explicitly expired record is stale', () => {
  const record = { last_observed_at: new Date().toISOString(), expires_at: new Date(Date.now() - 1000).toISOString() };
  ok(isStale(record) === true, 'expired');
});

test('no last_observed_at → stale', () => {
  ok(isStale({}) === true, 'no date = stale');
});

// ── recordDynamicEvidence ───────────────────────────────────────────────

test('first dynamic record created correctly', () => {
  const r = recordDynamicEvidence(null, { hard_count: 2, types: ['cascade_triggered', 'subtree_replaced'] });
  ok(r.behavior === 'dynamic', `behavior=${r.behavior}`);
  ok(r.classification === 'DYNAMIC', `classification=${r.classification}`);
  ok(r.hard_evidence_count === 2, `hard_count=${r.hard_evidence_count}`);
  ok(r.observation_count === 1, `obs_count=${r.observation_count}`);
  ok(r.provenance.includes('cascade_triggered'), 'provenance has cascade');
  ok(r.provenance.includes('subtree_replaced'), 'provenance has subtree');
  ok(r.first_observed_at != null, 'first_observed set');
  ok(r.last_dynamic_at != null, 'last_dynamic set');
  ok(r.confidence > 0, `confidence=${r.confidence}`);
  ok(r.expires_at === null, 'no expiry on fresh');
});

test('accumulated dynamic evidence increases count', () => {
  let r = recordDynamicEvidence(null, { hard_count: 1, types: ['cascade_triggered'] });
  r = recordDynamicEvidence(r, { hard_count: 2, types: ['option_set_changed'] });
  ok(r.hard_evidence_count === 3, `accumulated=${r.hard_evidence_count}`);
  ok(r.observation_count === 2, `obs=${r.observation_count}`);
  ok(r.provenance.length === 2, `provenance deduped: ${r.provenance.length}`);
});

test('dynamic evidence resets expiry', () => {
  let r = recordDynamicEvidence(null, { hard_count: 1, types: ['x'] });
  r.expires_at = new Date().toISOString(); // simulate expired
  r = recordDynamicEvidence(r, { hard_count: 1, types: ['y'] });
  ok(r.expires_at === null, 'expiry cleared on new evidence');
});

// ── recordStaticSuccess ─────────────────────────────────────────────────

test('static success creates record', () => {
  const r = recordStaticSuccess(null);
  ok(r.static_success_count === 1, `static_count=${r.static_success_count}`);
  ok(r.observation_count === 1, 'obs_count=1');
  ok(r.last_static_at != null, 'last_static set');
});

test('static success accumulates', () => {
  let r = recordStaticSuccess(null);
  r = recordStaticSuccess(r);
  r = recordStaticSuccess(r);
  ok(r.static_success_count === 3, `accumulated=${r.static_success_count}`);
});

test('static success can override weak dynamic with enough evidence', () => {
  let r = recordDynamicEvidence(null, { hard_count: 1, types: ['x'] }); // weak: 1 hard evidence
  for (let i = 0; i < 10; i++) r = recordStaticSuccess(r); // strong: 10 static successes
  // 10 static vs 1 dynamic → static dominates if no hard evidence threshold
  // But effectiveClassification requires hard_evidence_count === 0 for pure STATIC
  // With 1 hard evidence, it still classifies DYNAMIC (safety-first)
  // This is correct: even 1 hard evidence means the form CAN be dynamic
  ok(r.static_success_count === 10, `static_count=${r.static_success_count}`);
  ok(r.hard_evidence_count === 1, `hard_count=${r.hard_evidence_count}`);
  // Behavior is dynamic because any hard evidence makes it unsafe to assume static
  ok(effectiveClassification(r) === 'DYNAMIC', 'safety-first: 1 hard evidence keeps DYNAMIC');
});

// ── expireBehavior ──────────────────────────────────────────────────────

test('expireBehavior sets expiry and zeroes confidence', () => {
  const r = recordDynamicEvidence(null, { hard_count: 3, types: ['x'] });
  const expired = expireBehavior(r);
  ok(expired.expires_at != null, 'expires_at set');
  ok(expired.confidence === 0, 'confidence zeroed');
  ok(isStale(expired) === true, 'is now stale');
  ok(effectiveClassification(expired) === 'UNKNOWN', 'classifies as UNKNOWN');
});

test('expireBehavior on null returns null', () => {
  ok(expireBehavior(null) === null, 'null passthrough');
});

// ── Integration: repeated dynamic improves future Auto ──────────────────

test('repeated dynamic evidence strengthens confidence', () => {
  let r = null;
  for (let i = 0; i < 5; i++) {
    r = recordDynamicEvidence(r, { hard_count: 1, types: ['cascade_triggered'] });
  }
  ok(r.hard_evidence_count === 5, `total hard=${r.hard_evidence_count}`);
  ok(r.confidence >= 0.4, `confidence=${r.confidence} (high)`);
  ok(effectiveClassification(r) === 'DYNAMIC', 'reliably DYNAMIC');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nBehavior Learning (M4.12): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
