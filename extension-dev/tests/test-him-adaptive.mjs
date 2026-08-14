#!/usr/bin/env node
/**
 * Phase 4.13 — HIM Runtime Integration with Adaptive Execution tests
 * Issue #207: Pause, resume, revalidation, state preservation.
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const modPath = resolve(ROOT, 'extension-service/him-adaptive-integration.js');
const {
  requiresHimCheckpoint, createCheckpointRequest, validateResume,
  captureExecutionState, HIM_REQUIRED_RISKS,
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

// ── requiresHimCheckpoint ───────────────────────────────────────────────

test('irreversible step requires HIM', () => {
  ok(requiresHimCheckpoint({ risk: 'irreversible', step_id: 's:1' }, { operator_confirmed: false }) === true, 'irreversible needs HIM');
});

test('irreversible step with operator_confirmed skips HIM', () => {
  ok(requiresHimCheckpoint({ risk: 'irreversible', step_id: 's:1' }, { operator_confirmed: true }) === false, 'confirmed skips HIM');
});

test('safe step does not require HIM', () => {
  ok(requiresHimCheckpoint({ risk: 'safe', step_id: 's:1' }, {}) === false, 'safe no HIM');
});

test('reversible step does not require HIM', () => {
  ok(requiresHimCheckpoint({ risk: 'reversible', step_id: 's:1' }, {}) === false, 'reversible no HIM');
});

test('step with him_required=true requires HIM', () => {
  ok(requiresHimCheckpoint({ risk: 'safe', step_id: 's:1', him_required: true }, {}) === true, 'explicit him_required');
});

test('HIM_REQUIRED_RISKS contains irreversible', () => {
  ok(HIM_REQUIRED_RISKS.has('irreversible'), 'has irreversible');
  ok(!HIM_REQUIRED_RISKS.has('safe'), 'no safe');
  ok(!HIM_REQUIRED_RISKS.has('reversible'), 'no reversible');
});

// ── createCheckpointRequest ─────────────────────────────────────────────

test('creates checkpoint with all fields', () => {
  const req = createCheckpointRequest({
    session_id: 'fsess:1', plan_id: 'plan:1',
    step: { step_id: 's:1', risk: 'irreversible', target: { node_id: 'node:upload' }, action: { op: 'upload' } },
  });
  ok(req.checkpoint_id.startsWith('him:'), `checkpoint_id=${req.checkpoint_id}`);
  ok(req.session_id === 'fsess:1', 'session_id');
  ok(req.plan_id === 'plan:1', 'plan_id');
  ok(req.step_id === 's:1', 'step_id');
  ok(req.nonce.length > 10, `nonce=${req.nonce}`);
  ok(req.reason === 'irreversible_action', `reason=${req.reason}`);
  ok(req.step_summary.target_node_id === 'node:upload', 'step_summary.target');
  ok(req.step_summary.action_op === 'upload', 'step_summary.op');
  ok(req.step_summary.risk === 'irreversible', 'step_summary.risk');
  ok(req.expires_at != null, 'expires_at set');
});

test('checkpoint expiry defaults to 2 minutes', () => {
  const req = createCheckpointRequest({
    session_id: 's', plan_id: 'p',
    step: { step_id: 's:1', risk: 'irreversible', target: {}, action: {} },
  });
  const expiry = new Date(req.expires_at).getTime();
  const now = Date.now();
  ok(expiry > now + 110000, 'expires > 110s from now');
  ok(expiry < now + 130000, 'expires < 130s from now');
});

test('custom timeout works', () => {
  const req = createCheckpointRequest({
    session_id: 's', plan_id: 'p',
    step: { step_id: 's:1', risk: 'safe', him_required: true, target: {}, action: {} },
    timeout_ms: 30000,
  });
  const expiry = new Date(req.expires_at).getTime();
  ok(expiry < Date.now() + 35000, 'custom 30s timeout');
  ok(req.reason === 'him_required', `reason=${req.reason}`);
});

// ── validateResume ──────────────────────────────────────────────────────

test('valid resume: same document and plan', () => {
  const r = validateResume({
    original_document_id: 'doc:1', current_document_id: 'doc:1',
    original_revision: 5, current_revision: 5,
    plan_id: 'plan:1', active_plan_id: 'plan:1',
  });
  ok(r.valid === true, 'valid');
  ok(r.rejection_reason === null, 'no rejection');
  ok(r.requires_reperception === false, 'no reperception needed');
});

test('invalid resume: plan superseded', () => {
  const r = validateResume({
    original_document_id: 'doc:1', current_document_id: 'doc:1',
    original_revision: 5, current_revision: 5,
    plan_id: 'plan:old', active_plan_id: 'plan:new',
  });
  ok(r.valid === false, 'invalid');
  ok(r.rejection_reason === 'plan_superseded', `reason=${r.rejection_reason}`);
});

test('invalid resume: document replaced (navigation)', () => {
  const r = validateResume({
    original_document_id: 'doc:1', current_document_id: 'doc:2',
    original_revision: 5, current_revision: 1,
    plan_id: 'plan:1', active_plan_id: 'plan:1',
  });
  ok(r.valid === false, 'invalid');
  ok(r.rejection_reason === 'document_replaced', `reason=${r.rejection_reason}`);
});

test('valid resume with reperception: revision changed', () => {
  const r = validateResume({
    original_document_id: 'doc:1', current_document_id: 'doc:1',
    original_revision: 5, current_revision: 8,
    plan_id: 'plan:1', active_plan_id: 'plan:1',
  });
  ok(r.valid === true, 'valid');
  ok(r.rejection_reason === null, 'no rejection');
  ok(r.requires_reperception === true, 'needs reperception');
});

// ── captureExecutionState ───────────────────────────────────────────────

test('captures execution state correctly', () => {
  const state = captureExecutionState({
    session_id: 'fsess:1', plan_id: 'plan:1',
    completed_steps: 3, total_steps: 10,
    document_id: 'doc:1', revision: 5,
    paused_at_step_id: 's:4',
  });
  ok(state.session_id === 'fsess:1', 'session_id');
  ok(state.plan_id === 'plan:1', 'plan_id');
  ok(state.completed_steps === 3, 'completed_steps');
  ok(state.total_steps === 10, 'total_steps');
  ok(state.document_id === 'doc:1', 'document_id');
  ok(state.revision === 5, 'revision');
  ok(state.paused_at_step_id === 's:4', 'paused_at_step');
  ok(state.paused_at != null, 'paused_at timestamp');
  ok(state.status === 'paused_for_him', `status=${state.status}`);
});

// ── Integration: HIM does not break existing contracts ──────────────────

test('HIM checkpoint does not modify step structure', () => {
  const step = { step_id: 's:1', risk: 'irreversible', target: { node_id: 'n:1' }, action: { op: 'upload' }, postcondition: { type: 'none' } };
  requiresHimCheckpoint(step, {});
  ok(step.step_id === 's:1', 'step unchanged');
  ok(step.action.op === 'upload', 'action unchanged');
});

test('validateResume uses same plan_id contract as plan race (M4.6)', () => {
  // Plan race: only active plan may execute. Resume must respect this.
  const r = validateResume({
    original_document_id: 'doc:1', current_document_id: 'doc:1',
    original_revision: 5, current_revision: 5,
    plan_id: 'plan:superseded', active_plan_id: 'plan:new',
  });
  ok(r.valid === false, 'superseded plan cannot resume');
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\nHIM Adaptive Integration (M4.13): ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
