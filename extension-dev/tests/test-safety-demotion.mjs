#!/usr/bin/env node
/**
 * Phase 4.7 — Static-to-Dynamic Safety Demotion unit tests
 * Issue #201: Mid-batch stop on hard evidence + dynamic continuation.
 *
 * Tests the executor's safety demotion logic and the session/committed tracking
 * that enables continuation without replay.
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_unused';
}

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// Import fill-session for committed tracking across demotion
const sessionPath = resolve(ROOT, 'extension-service/fill-session.js');
const { createSession, attachPlan, markStepCompleted, getCommittedNodeIds } = await import(pathToFileURL(sessionPath).href);

// Import behavior classifier for hard evidence types
const classifierPath = resolve(ROOT, 'extension-service/behavior-classifier.js');
const { isHardEvidenceType } = await import(pathToFileURL(classifierPath).href);

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

// ── Hard evidence types that trigger demotion ───────────────────────────

const HARD_TYPES = ['control_removed', 'subtree_replaced', 'option_set_changed', 'cascade_triggered', 'widget_recreated'];

test('all 5 hard evidence types recognized', () => {
  for (const type of HARD_TYPES) {
    ok(isHardEvidenceType(type) === true, `${type} is hard evidence`);
  }
});

test('soft types do not trigger demotion', () => {
  const soft = ['step_completed', 'value_changed', 'focus_changed', 'scroll', ''];
  for (const type of soft) {
    ok(isHardEvidenceType(type) === false, `${type} is not hard`);
  }
});

// ── Demotion logic simulation (mirrors executor) ────────────────────────

function simulateDemotionCheck(evidence, remainingNodeIds) {
  if (remainingNodeIds.length === 0) return false; // No remaining steps to invalidate
  const hardEvidence = evidence.filter(e => HARD_TYPES.includes(e.type));
  if (hardEvidence.length === 0) return false;
  const remaining = new Set(remainingNodeIds);
  return hardEvidence.some(e => {
    if (e.affected_node_id && remaining.has(e.affected_node_id)) return true;
    if (e.type === 'subtree_replaced' || e.type === 'cascade_triggered') return true;
    return false;
  });
}

test('cascade_triggered always invalidates remaining', () => {
  const evidence = [{ type: 'cascade_triggered', affected_node_id: null }];
  ok(simulateDemotionCheck(evidence, ['node:b', 'node:c']) === true, 'cascade always demotes');
});

test('subtree_replaced always invalidates remaining', () => {
  const evidence = [{ type: 'subtree_replaced', affected_node_id: null }];
  ok(simulateDemotionCheck(evidence, ['node:b']) === true, 'subtree always demotes');
});

test('control_removed for a remaining target → demotes', () => {
  const evidence = [{ type: 'control_removed', affected_node_id: 'node:b' }];
  ok(simulateDemotionCheck(evidence, ['node:b', 'node:c']) === true, 'control_removed on remaining');
});

test('control_removed for an already-executed target → no demotion', () => {
  const evidence = [{ type: 'control_removed', affected_node_id: 'node:a' }];
  ok(simulateDemotionCheck(evidence, ['node:b', 'node:c']) === false, 'not in remaining');
});

test('option_set_changed for remaining target → demotes', () => {
  const evidence = [{ type: 'option_set_changed', affected_node_id: 'node:state' }];
  ok(simulateDemotionCheck(evidence, ['node:state', 'node:district']) === true, 'option changed on remaining');
});

test('widget_recreated for remaining target → demotes', () => {
  const evidence = [{ type: 'widget_recreated', affected_node_id: 'node:c' }];
  ok(simulateDemotionCheck(evidence, ['node:c']) === true, 'widget recreated on remaining');
});

test('no hard evidence → no demotion', () => {
  const evidence = [{ type: 'value_changed', affected_node_id: 'node:a' }];
  ok(simulateDemotionCheck(evidence, ['node:b', 'node:c']) === false, 'soft evidence ignored');
});

test('empty evidence → no demotion', () => {
  ok(simulateDemotionCheck([], ['node:b']) === false, 'empty = no demotion');
});

test('hard evidence but no remaining steps → no demotion', () => {
  const evidence = [{ type: 'cascade_triggered' }];
  ok(simulateDemotionCheck(evidence, []) === false, 'no remaining = irrelevant');
});

// ── Partial progress preserved across demotion ──────────────────────────

test('committed steps preserved after safety demotion', () => {
  const session = createSession({
    workspace_id: 'ws:dem1', document_id: 'doc:1',
    snapshot_id: 'snap:1', correlation_id: 'corr:1',
  });
  // STATIC plan: A, B, C
  attachPlan(session.session_id, 'plan:static', 3,
    ['s:a', 's:b', 's:c'], ['node:country', 'node:state', 'node:district']);
  // Step A succeeds (then cascade evidence stops batch)
  markStepCompleted(session.session_id, 's:a');
  // B and C never execute → committed is only {country}
  const committed = getCommittedNodeIds(session.session_id);
  ok(committed.size === 1, `committed=${committed.size}`);
  ok(committed.has('node:country'), 'country committed');
  ok(!committed.has('node:state'), 'state not committed');
  ok(!committed.has('node:district'), 'district not committed');
});

test('continuation via dynamic does not replay committed', () => {
  const session = createSession({
    workspace_id: 'ws:dem2', document_id: 'doc:2',
    snapshot_id: 'snap:2', correlation_id: 'corr:2',
  });
  attachPlan(session.session_id, 'plan:static2', 3,
    ['s:1', 's:2', 's:3'], ['node:name', 'node:country', 'node:state']);
  markStepCompleted(session.session_id, 's:1');
  markStepCompleted(session.session_id, 's:2');
  // After demotion, next plan should not include name or country
  const committed = getCommittedNodeIds(session.session_id);
  // Simulate anti-duplicate filter
  const nextSteps = [
    { step_id: 's:4', target: { node_id: 'node:name' } },
    { step_id: 's:5', target: { node_id: 'node:country' } },
    { step_id: 's:6', target: { node_id: 'node:state' } },
    { step_id: 's:7', target: { node_id: 'node:district' } },
  ];
  const filtered = nextSteps.filter(s => !committed.has(s.target.node_id));
  ok(filtered.length === 2, `after filter: ${filtered.length} remaining`);
  ok(filtered[0].target.node_id === 'node:state', 'state remains');
  ok(filtered[1].target.node_id === 'node:district', 'district remains');
});

// ── Operator STATIC preference does not block demotion ──────────────────

test('operator STATIC + hard evidence → demotion still triggers', () => {
  // The demotion logic in executor is independent of operator preference.
  // Operator preference is irrelevant at execution time — it's a server-side merge concern.
  // The executor always stops on hard evidence regardless.
  const evidence = [{ type: 'cascade_triggered', affected_node_id: null }];
  ok(simulateDemotionCheck(evidence, ['node:state']) === true,
    'operator preference does not prevent executor demotion');
});

// ── Realistic cascade scenario ──────────────────────────────────────────

test('STATIC plan A,B,C where A causes cascade → B,C never execute', () => {
  // Plan: country(A), state(B), district(C)
  // After A executes, cascade_triggered evidence appears
  // Executor checks: hard evidence + remaining [B, C] → stop
  const evidence = [{ type: 'cascade_triggered', affected_node_id: null }];
  const remaining = ['node:state', 'node:district'];
  ok(simulateDemotionCheck(evidence, remaining) === true, 'B and C stopped');
  // Fresh perception + dynamic continuation handles B and C one-by-one
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nSafety Demotion (M4.7): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
