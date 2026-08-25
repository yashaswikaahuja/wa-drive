/**
 * Unit tests for Phase 4.4 — mergeExecutionMode decision table.
 */
import { mergeExecutionMode } from '../../../packages/svc-session/src/execution-mode.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  try { fn(); }
  catch (e) { failed++; console.error(`  FAIL: ${name} — ${e.message}`); }
}

// ── AUTO preference ─────────────────────────────────────────────────────

test('AUTO + STATIC → static', () => {
  const r = mergeExecutionMode({ operatorPreference: 'AUTO', systemClassification: 'STATIC' });
  assert(r.effective_execution_mode === 'static', 'AUTO+STATIC should be static');
  assert(r.preference_applied === 'AUTO', 'preference_applied should be AUTO');
  assert(r.demotion === false, 'no demotion');
  assert(r.reason === 'auto_system_static', `reason=${r.reason}`);
});

test('AUTO + DYNAMIC → dynamic', () => {
  const r = mergeExecutionMode({ operatorPreference: 'AUTO', systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'AUTO+DYNAMIC should be dynamic');
  assert(r.preference_applied === 'AUTO', 'preference_applied should be AUTO');
  assert(r.reason === 'auto_system_dynamic', `reason=${r.reason}`);
});

test('AUTO + UNKNOWN → dynamic (conservative)', () => {
  const r = mergeExecutionMode({ operatorPreference: 'AUTO', systemClassification: 'UNKNOWN' });
  assert(r.effective_execution_mode === 'dynamic', 'AUTO+UNKNOWN should be dynamic');
  assert(r.reason === 'auto_system_unknown', `reason=${r.reason}`);
});

// ── STATIC preference ───────────────────────────────────────────────────

test('STATIC + STATIC → static', () => {
  const r = mergeExecutionMode({ operatorPreference: 'STATIC', systemClassification: 'STATIC' });
  assert(r.effective_execution_mode === 'static', 'STATIC+STATIC should be static');
  assert(r.preference_applied === 'STATIC', 'preference_applied should be STATIC');
  assert(r.demotion === false, 'no demotion');
  assert(r.reason === 'operator_static_system_static', `reason=${r.reason}`);
});

test('STATIC + DYNAMIC → dynamic (safety override)', () => {
  const r = mergeExecutionMode({ operatorPreference: 'STATIC', systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'STATIC+DYNAMIC must be dynamic (safety)');
  assert(r.preference_applied === 'STATIC', 'preference_applied should be STATIC');
  assert(r.demotion === true, 'demotion should be true');
  assert(r.reason === 'system_dynamic_overrides_operator_static', `reason=${r.reason}`);
});

test('STATIC + UNKNOWN → dynamic (safety override)', () => {
  const r = mergeExecutionMode({ operatorPreference: 'STATIC', systemClassification: 'UNKNOWN' });
  assert(r.effective_execution_mode === 'dynamic', 'STATIC+UNKNOWN must be dynamic (safety)');
  assert(r.demotion === true, 'demotion should be true');
  assert(r.reason === 'system_unknown_overrides_operator_static', `reason=${r.reason}`);
});

// ── DYNAMIC preference ──────────────────────────────────────────────────

test('DYNAMIC + STATIC → dynamic', () => {
  const r = mergeExecutionMode({ operatorPreference: 'DYNAMIC', systemClassification: 'STATIC' });
  assert(r.effective_execution_mode === 'dynamic', 'DYNAMIC+STATIC should be dynamic');
  assert(r.preference_applied === 'DYNAMIC', 'preference_applied should be DYNAMIC');
  assert(r.reason === 'operator_chose_dynamic', `reason=${r.reason}`);
});

test('DYNAMIC + DYNAMIC → dynamic', () => {
  const r = mergeExecutionMode({ operatorPreference: 'DYNAMIC', systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'DYNAMIC+DYNAMIC should be dynamic');
  assert(r.reason === 'operator_chose_dynamic', `reason=${r.reason}`);
});

test('DYNAMIC + UNKNOWN → dynamic', () => {
  const r = mergeExecutionMode({ operatorPreference: 'DYNAMIC', systemClassification: 'UNKNOWN' });
  assert(r.effective_execution_mode === 'dynamic', 'DYNAMIC+UNKNOWN should be dynamic');
  assert(r.reason === 'operator_chose_dynamic', `reason=${r.reason}`);
});

// ── Edge cases ──────────────────────────────────────────────────────────

test('null preference defaults to AUTO', () => {
  const r = mergeExecutionMode({ operatorPreference: null, systemClassification: 'STATIC' });
  assert(r.effective_execution_mode === 'static', 'null pref + STATIC should be static');
  assert(r.preference_applied === 'AUTO', 'null defaults to AUTO');
});

test('undefined preference defaults to AUTO', () => {
  const r = mergeExecutionMode({ operatorPreference: undefined, systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'undefined pref + DYNAMIC should be dynamic');
  assert(r.preference_applied === 'AUTO', 'undefined defaults to AUTO');
});

test('lowercase preference normalized', () => {
  const r = mergeExecutionMode({ operatorPreference: 'static', systemClassification: 'STATIC' });
  assert(r.effective_execution_mode === 'static', 'lowercase static accepted');
  assert(r.preference_applied === 'STATIC', 'normalized to uppercase');
});

test('invalid preference falls back to AUTO', () => {
  const r = mergeExecutionMode({ operatorPreference: 'YOLO', systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'invalid pref + DYNAMIC → dynamic');
  assert(r.preference_applied === 'AUTO', 'invalid falls back to AUTO');
});

test('null classification defaults to UNKNOWN → dynamic', () => {
  const r = mergeExecutionMode({ operatorPreference: 'AUTO', systemClassification: null });
  assert(r.effective_execution_mode === 'dynamic', 'null classification → UNKNOWN → dynamic');
});

test('operator STATIC cannot disable demotion from DYNAMIC', () => {
  const r = mergeExecutionMode({ operatorPreference: 'STATIC', systemClassification: 'DYNAMIC' });
  assert(r.effective_execution_mode === 'dynamic', 'operator cannot override system DYNAMIC');
  assert(r.demotion === true, 'demotion flag set');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nExecution Mode Decision Table: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
