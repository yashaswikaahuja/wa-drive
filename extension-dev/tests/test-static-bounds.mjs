#!/usr/bin/env node
/**
 * Phase 4.5 — Safe Bounded Static Execution unit tests
 * Issue #199: Static plans bounded by hard max + cascade parent break.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const modPath = resolve(ROOT, 'extension-service/static-bounds.js');
const { applyStaticBounds, STATIC_MAX_STEPS } = await import(pathToFileURL(modPath).href);

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

// Helper: generate N steps with sequential node_ids
function makeSteps(n, prefix = 'node') {
  return Array.from({ length: n }, (_, i) => ({
    step_id: `step:${i}`,
    target: { context_id: 'ctx:main', node_id: `${prefix}:${i}` },
    action: { op: 'type_text', value: `val${i}`, clear_first: true },
    risk: 'safe',
    postcondition: { type: 'value_state', expected_value_state: 'nonempty' },
    on_failure: 'stop_and_report',
  }));
}

// ── Constants ───────────────────────────────────────────────────────────

test('STATIC_MAX_STEPS is 12', () => {
  ok(STATIC_MAX_STEPS === 12, `STATIC_MAX_STEPS=${STATIC_MAX_STEPS}`);
});

// ── Empty / small plans ─────────────────────────────────────────────────

test('empty steps → no bounding', () => {
  const r = applyStaticBounds({ steps: [], edges: [] });
  ok(r.bounded === false, 'not bounded');
  ok(r.steps.length === 0, 'empty');
  ok(r.original_count === 0, 'original 0');
  ok(r.remaining_count === 0, 'remaining 0');
  ok(r.bound_reason === null, 'no reason');
});

test('5 steps no edges → passes through unchanged', () => {
  const steps = makeSteps(5);
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.bounded === false, 'not bounded');
  ok(r.steps.length === 5, `steps=${r.steps.length}`);
  ok(r.original_count === 5, 'original 5');
  ok(r.remaining_count === 0, 'remaining 0');
});

test('12 steps no edges → exactly at limit, not bounded', () => {
  const steps = makeSteps(12);
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.bounded === false, 'not bounded at exactly 12');
  ok(r.steps.length === 12, 'all 12 returned');
});

// ── Hard max steps ──────────────────────────────────────────────────────

test('13 steps no edges → bounded to 12 (hard max)', () => {
  const steps = makeSteps(13);
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 12, `steps=${r.steps.length}`);
  ok(r.original_count === 13, 'original 13');
  ok(r.remaining_count === 1, 'remaining 1');
  ok(r.bound_reason === 'hard_max_steps', `reason=${r.bound_reason}`);
  ok(r.cascade_break_at === null, 'no cascade break');
});

test('50 steps no edges → bounded to 12', () => {
  const steps = makeSteps(50);
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 12, `steps=${r.steps.length}`);
  ok(r.remaining_count === 38, `remaining=${r.remaining_count}`);
  ok(r.bound_reason === 'hard_max_steps', `reason=${r.bound_reason}`);
});

test('custom maxSteps override', () => {
  const steps = makeSteps(10);
  const r = applyStaticBounds({ steps, edges: [], maxSteps: 5 });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 5, `steps=${r.steps.length}`);
  ok(r.bound_reason === 'hard_max_steps', `reason=${r.bound_reason}`);
  ok(r.remaining_count === 5, `remaining=${r.remaining_count}`);
});

// ── Cascade parent break ────────────────────────────────────────────────

test('cascade parent at step 2 → breaks after step 2 (3 steps returned)', () => {
  // Steps: node:0, node:1, node:2, node:3, node:4
  // Edge: node:2 depends_on→ node:3 (node:2 is parent of node:3)
  const steps = makeSteps(5);
  const edges = [
    { type: 'depends_on', source_id: 'node:2', target_id: 'node:3' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 3, `steps=${r.steps.length} (break after index 2)`);
  ok(r.cascade_break_at === 2, `cascade_break_at=${r.cascade_break_at}`);
  ok(r.bound_reason === 'cascade_parent_break', `reason=${r.bound_reason}`);
  ok(r.remaining_count === 2, `remaining=${r.remaining_count}`);
});

test('cascade parent at step 0 → breaks after step 0 (1 step returned)', () => {
  // node:0 is parent of node:1
  const steps = makeSteps(5);
  const edges = [
    { type: 'depends_on', source_id: 'node:0', target_id: 'node:1' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 1, `steps=${r.steps.length}`);
  ok(r.cascade_break_at === 0, `cascade_break_at=${r.cascade_break_at}`);
  ok(r.bound_reason === 'cascade_parent_break', `reason=${r.bound_reason}`);
  ok(r.remaining_count === 4, `remaining=${r.remaining_count}`);
});

test('cascade parent at last step → no break (parent has no later dependents)', () => {
  // node:4 depends on node:3, but node:4 is the last step — no later step depends on node:4
  // Actually edge: node:4 is source, but there's no step after it
  const steps = makeSteps(5);
  const edges = [
    { type: 'depends_on', source_id: 'node:4', target_id: 'node:99' }, // target not in plan
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === false, 'not bounded (parent targets outside plan)');
  ok(r.steps.length === 5, `steps=${r.steps.length}`);
});

test('cascade edge between non-plan nodes → ignored', () => {
  const steps = makeSteps(5);
  const edges = [
    { type: 'depends_on', source_id: 'other:1', target_id: 'other:2' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === false, 'not bounded');
  ok(r.steps.length === 5, 'all steps');
});

test('multiple cascade parents → breaks at first one', () => {
  // node:1 → node:2, and node:3 → node:4
  const steps = makeSteps(8);
  const edges = [
    { type: 'depends_on', source_id: 'node:1', target_id: 'node:2' },
    { type: 'depends_on', source_id: 'node:3', target_id: 'node:4' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 2, `steps=${r.steps.length} (break after first cascade parent)`);
  ok(r.cascade_break_at === 1, `cascade_break_at=${r.cascade_break_at}`);
  ok(r.bound_reason === 'cascade_parent_break', `reason=${r.bound_reason}`);
});

test('cascade break at step 15 with max 12 → max wins', () => {
  const steps = makeSteps(20);
  const edges = [
    { type: 'depends_on', source_id: 'node:15', target_id: 'node:16' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === true, 'bounded');
  ok(r.steps.length === 12, `steps=${r.steps.length} (max wins)`);
  ok(r.bound_reason === 'hard_max_before_cascade', `reason=${r.bound_reason}`);
  ok(r.cascade_break_at === 15, `cascade_break_at=${r.cascade_break_at}`);
  ok(r.remaining_count === 8, `remaining=${r.remaining_count}`);
});

// ── Edge types ──────────────────────────────────────────────────────────

test('non-depends_on edges are ignored', () => {
  const steps = makeSteps(5);
  const edges = [
    { type: 'visibility', source_id: 'node:0', target_id: 'node:1' },
    { type: 'validation', source_id: 'node:2', target_id: 'node:3' },
  ];
  const r = applyStaticBounds({ steps, edges });
  ok(r.bounded === false, 'not bounded (non-depends_on edges ignored)');
  ok(r.steps.length === 5, 'all steps');
});

// ── Null/undefined edges ────────────────────────────────────────────────

test('null edges → treated as empty', () => {
  const steps = makeSteps(5);
  const r = applyStaticBounds({ steps, edges: null });
  ok(r.bounded === false, 'not bounded');
  ok(r.steps.length === 5, 'all steps');
});

test('undefined edges → treated as empty', () => {
  const steps = makeSteps(5);
  const r = applyStaticBounds({ steps, edges: undefined });
  ok(r.bounded === false, 'not bounded');
  ok(r.steps.length === 5, 'all steps');
});

// ── TOCTOU / postconditions preserved ───────────────────────────────────

test('bounded steps retain postcondition and on_failure', () => {
  const steps = makeSteps(15);
  steps[0].postcondition = { type: 'value_state', expected_value_state: 'nonempty' };
  steps[0].on_failure = 'stop_and_report';
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.steps[0].postcondition.type === 'value_state', 'postcondition preserved');
  ok(r.steps[0].on_failure === 'stop_and_report', 'on_failure preserved');
});

test('step failure policy unchanged (no parallel executor)', () => {
  const steps = makeSteps(8);
  for (const s of steps) s.on_failure = 'stop_and_report';
  const r = applyStaticBounds({ steps, edges: [] });
  ok(r.steps.every(s => s.on_failure === 'stop_and_report'), 'all stop_and_report');
});

// ── Realistic cascade scenario (State → District → Block) ──────────────

test('realistic cascade: country→state→district with 10 fields', () => {
  // Fields: name, dob, gender, country, state, district, block, pin, phone, email
  const steps = [
    { step_id: 's:0', target: { context_id: 'ctx', node_id: 'name' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:1', target: { context_id: 'ctx', node_id: 'dob' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:2', target: { context_id: 'ctx', node_id: 'gender' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:3', target: { context_id: 'ctx', node_id: 'country' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:4', target: { context_id: 'ctx', node_id: 'state' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:5', target: { context_id: 'ctx', node_id: 'district' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:6', target: { context_id: 'ctx', node_id: 'block' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:7', target: { context_id: 'ctx', node_id: 'pin' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:8', target: { context_id: 'ctx', node_id: 'phone' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
    { step_id: 's:9', target: { context_id: 'ctx', node_id: 'email' }, action: {}, postcondition: {}, on_failure: 'stop_and_report' },
  ];
  const edges = [
    { type: 'depends_on', source_id: 'country', target_id: 'state' },
    { type: 'depends_on', source_id: 'state', target_id: 'district' },
    { type: 'depends_on', source_id: 'district', target_id: 'block' },
  ];
  const r = applyStaticBounds({ steps, edges });
  // First cascade parent is 'country' at index 3, which has 'state' at index 4 as dependent
  ok(r.bounded === true, 'bounded at cascade parent');
  ok(r.steps.length === 4, `steps=${r.steps.length} (name, dob, gender, country)`);
  ok(r.cascade_break_at === 3, `cascade_break_at=${r.cascade_break_at}`);
  ok(r.bound_reason === 'cascade_parent_break', `reason=${r.bound_reason}`);
  ok(r.remaining_count === 6, `remaining=${r.remaining_count}`);
  // Verify correct steps returned
  ok(r.steps[0].target.node_id === 'name', 'step 0 = name');
  ok(r.steps[3].target.node_id === 'country', 'step 3 = country (cascade parent)');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nStatic Bounds: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
