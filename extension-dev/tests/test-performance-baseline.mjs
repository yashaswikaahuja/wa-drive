#!/usr/bin/env node
/**
 * Phase 4.11 — Adaptive Execution Performance Baseline
 * Issue #205: Measure and record performance of the adaptive execution pipeline.
 *
 * Records timing baselines for:
 * - Behavior classification
 * - Execution mode merge
 * - Static bounds computation
 * - Fill session operations
 * - Anti-duplicate filter
 *
 * Acceptance: all operations complete within practical bounds for representative forms.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const classifierPath = resolve(ROOT, 'extension-service/behavior-classifier.js');
const modePath = resolve(ROOT, 'extension-service/execution-mode.js');
const boundsPath = resolve(ROOT, 'extension-service/static-bounds.js');
const sessionPath = resolve(ROOT, 'extension-service/fill-session.js');

const { classifyFormBehavior } = await import(pathToFileURL(classifierPath).href);
const { mergeExecutionMode } = await import(pathToFileURL(modePath).href);
const { applyStaticBounds } = await import(pathToFileURL(boundsPath).href);
const { createSession, attachPlan, markStepCompleted, getCommittedNodeIds, supersedePlan } = await import(pathToFileURL(sessionPath).href);

let passed = 0;
let failed = 0;
const baselines = {};

function ok(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function bench(name, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;
  const perOp = elapsed / iterations;
  baselines[name] = { total_ms: elapsed.toFixed(2), per_op_ms: perOp.toFixed(4), iterations };
  return perOp;
}

// ── Generate test fixtures ──────────────────────────────────────────────

function makeSnapshot(fieldCount) {
  const nodes = {};
  for (let i = 0; i < fieldCount; i++) {
    nodes[`node:${i}`] = {
      node_id: `node:${i}`, context_id: 'ctx:0',
      affordances: ['type_text'], label: `Field ${i}`,
    };
  }
  return {
    kind: 'page_snapshot', document_id: 'doc:perf', snapshot_id: 'snap:perf',
    revision: 1, page: { origin: 'https://perf.test', route_key: '/form' },
    nodes, edges: [],
  };
}

function makeSteps(n) {
  return Array.from({ length: n }, (_, i) => ({
    step_id: `s:${i}`, target: { context_id: 'ctx:0', node_id: `node:${i}` },
    action: { op: 'type_text', value: `v${i}` }, postcondition: { type: 'value_state' },
  }));
}

// ── Benchmarks ──────────────────────────────────────────────────────────

// 1. Classification (10-field form)
const snap10 = makeSnapshot(10);
const steps10 = makeSteps(10);
const classifyTime10 = bench('classify_10_fields', () => {
  classifyFormBehavior({ snapshot: snap10, domEvidence: [], priorKnowledge: null, planSteps: steps10 });
});
ok(classifyTime10 < 5, `classify 10 fields: ${classifyTime10.toFixed(3)}ms/op (< 5ms)`);

// 2. Classification (50-field form)
const snap50 = makeSnapshot(50);
const steps50 = makeSteps(50);
const classifyTime50 = bench('classify_50_fields', () => {
  classifyFormBehavior({ snapshot: snap50, domEvidence: [], priorKnowledge: null, planSteps: steps50 });
});
ok(classifyTime50 < 10, `classify 50 fields: ${classifyTime50.toFixed(3)}ms/op (< 10ms)`);

// 3. Mode merge
const mergeTime = bench('mode_merge', () => {
  mergeExecutionMode({ operatorPreference: 'AUTO', systemClassification: 'STATIC' });
}, 10000);
ok(mergeTime < 0.1, `mode merge: ${mergeTime.toFixed(4)}ms/op (< 0.1ms)`);

// 4. Static bounds (20 steps, no edges)
const boundsTime20 = bench('static_bounds_20', () => {
  applyStaticBounds({ steps: makeSteps(20), edges: [] });
});
ok(boundsTime20 < 1, `static bounds 20 steps: ${boundsTime20.toFixed(4)}ms/op (< 1ms)`);

// 5. Static bounds (50 steps with cascade edges)
const edges50 = [
  { type: 'depends_on', source_id: 'node:10', target_id: 'node:11' },
  { type: 'depends_on', source_id: 'node:20', target_id: 'node:21' },
];
const boundsTimeCascade = bench('static_bounds_50_cascade', () => {
  applyStaticBounds({ steps: makeSteps(50), edges: edges50 });
});
ok(boundsTimeCascade < 2, `static bounds 50+cascade: ${boundsTimeCascade.toFixed(4)}ms/op (< 2ms)`);

// 6. Session create + attach plan
let sessCounter = 0;
const sessionCreateTime = bench('session_create_attach', () => {
  const s = createSession({ workspace_id: `ws:perf:${sessCounter++}`, document_id: 'doc:p', snapshot_id: 'snap:p', correlation_id: `corr:${sessCounter}` });
  attachPlan(s.session_id, `plan:${sessCounter}`, 5, ['s:0','s:1','s:2','s:3','s:4'], ['n:0','n:1','n:2','n:3','n:4']);
}, 500);
ok(sessionCreateTime < 2, `session create+attach: ${sessionCreateTime.toFixed(3)}ms/op (< 2ms)`);

// 7. Committed node lookup (after 10 committed steps)
const perfSession = createSession({ workspace_id: 'ws:perf2', document_id: 'doc:p2', snapshot_id: 'snap:p2', correlation_id: 'corr:p2' });
attachPlan(perfSession.session_id, 'plan:perf', 20,
  Array.from({length:20}, (_,i) => `s:${i}`),
  Array.from({length:20}, (_,i) => `node:${i}`));
for (let i = 0; i < 10; i++) markStepCompleted(perfSession.session_id, `s:${i}`);

const committedTime = bench('committed_lookup_10', () => {
  getCommittedNodeIds(perfSession.session_id);
}, 5000);
ok(committedTime < 0.1, `committed lookup (10 done): ${committedTime.toFixed(4)}ms/op (< 0.1ms)`);

// 8. Anti-duplicate filter (20 plan steps, 10 committed)
const committed = getCommittedNodeIds(perfSession.session_id);
const antiDupSteps = makeSteps(20);
const antiDupTime = bench('anti_duplicate_filter_20', () => {
  antiDupSteps.filter(s => !committed.has(s.target.node_id));
}, 5000);
ok(antiDupTime < 0.05, `anti-duplicate filter 20 steps: ${antiDupTime.toFixed(4)}ms/op (< 0.05ms)`);

// 9. Plan supersede
const superSession = createSession({ workspace_id: 'ws:super', document_id: 'doc:s', snapshot_id: 'snap:s', correlation_id: 'corr:s' });
attachPlan(superSession.session_id, 'plan:old', 5, ['s:0','s:1','s:2','s:3','s:4'], ['n:0','n:1','n:2','n:3','n:4']);
markStepCompleted(superSession.session_id, 's:0');
const supersedeTime = bench('plan_supersede', () => {
  supersedePlan(superSession.session_id, `plan:new:${Math.random()}`, 1, [`s:new:${Math.random()}`], ['n:new']);
}, 200);
ok(supersedeTime < 2, `plan supersede: ${supersedeTime.toFixed(3)}ms/op (< 2ms)`);

// ── Summary ─────────────────────────────────────────────────────────────
console.log('\n── Performance Baselines ──');
for (const [name, data] of Object.entries(baselines)) {
  console.log(`  ${name}: ${data.per_op_ms}ms/op (${data.iterations} iterations, total ${data.total_ms}ms)`);
}
console.log(`\nPerformance Baseline (M4.11): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
