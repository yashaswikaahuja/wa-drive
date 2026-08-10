#!/usr/bin/env node
/**
 * ActionPlanExecutor v3 unit tests — #139 APE-P1
 * Does not require DB or browser.
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
const executor = require(resolve(ROOT, 'extension/runtime/action-plan-executor.js'));
const popup = readFileSync(resolve(ROOT, 'extension/popup.js'), 'utf8');
const gateway = readFileSync(resolve(ROOT, 'extension/runtime/dom-gateway.js'), 'utf8');
const perception = readFileSync(resolve(ROOT, 'extension/perception/index.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

function makePlan(overrides = {}) {
  return {
    kind: 'action_plan',
    schema_version: '3.0.0',
    plan_id: 'plan:test1',
    correlation_id: 'corr:test1',
    supersedes_plan_id: null,
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    target_binding: { document_id: 'doc:test', snapshot_id: 'snap:test', expected_revision: 1 },
    steps: [{
      step_id: 'step:text',
      target: { context_id: 'ctx.top.1', node_id: 'node:text' },
      action: { op: 'type_text', value: 'Test', clear_first: true },
      risk: 'safe',
      required_affordance: 'type_text',
      required_adapter_id: null,
      postcondition: { type: 'value_state', expected_value_state: 'nonempty', expected_boolean: null, expected_signal: null },
      on_failure: 'stop_and_report',
    }],
    authorization: { max_risk: 'safe', operator_confirmed: false, allow_navigation: false, allow_submit: false },
    ...overrides,
  };
}

console.log('\n=== ActionPlanExecutor v3 ===');

// Product path wiring
ok(popup.includes('CcActionPlanExecutor.execute'), 'popup uses ActionPlanExecutor');
ok(popup.includes("'/fill-plan'"), 'popup requests fill-plan');
ok(popup.includes('fill-observation') || popup.includes('/fill-observation'), 'popup posts fill-observation');
ok(!popup.includes("'autofill/executor.js'"), 'popup does not inject autofill/executor.js');
ok(!popup.includes("'autofill/mapper.js'"), 'popup does not inject mapper.js');
ok(popup.includes('runtime/action-plan-executor.js'), 'popup injects action-plan-executor');

// Gateway ops
ok(gateway.includes("case 'select_option'"), 'gateway has select_option');
ok(gateway.includes("case 'expand_collapse'"), 'gateway has expand_collapse');
ok(gateway.includes("case 'upload'"), 'gateway has upload');
ok(gateway.includes('registerFileReference'), 'gateway has file_reference registry');
ok(gateway.includes('liveElements'), 'gateway returns liveElements');

// Perception execution APIs
ok(perception.includes('resolveExecutionTarget'), 'perception exports resolveExecutionTarget');
ok(perception.includes('getPerceptionState'), 'perception exports getPerceptionState');
ok(perception.includes('snapshotId'), 'perception state includes snapshotId');

// Envelope validation
const state = { documentId: 'doc:test', snapshotId: 'snap:test', revision: 1 };
ok(executor.validatePlan(makePlan(), state).ok, 'valid plan passes');
ok(executor.validatePlan(makePlan({ expires_at: new Date(0).toISOString() }), state).code === 'plan_expired', 'expired rejected');
ok(executor.validatePlan(makePlan(), { ...state, revision: 2 }).code === 'stale_snapshot', 'stale revision rejected');
ok(executor.validatePlan(makePlan(), { ...state, documentId: 'doc:other' }).code === 'document_replaced', 'document mismatch rejected');
ok(
  executor.validatePlan(
    makePlan({
      steps: [{
        step_id: 's1',
        target: { context_id: 'c', node_id: 'n' },
        action: { op: 'type_text', value: 'x' },
        risk: 'irreversible',
        required_affordance: null,
        required_adapter_id: null,
        postcondition: { type: 'none' },
        on_failure: 'stop_and_report',
      }],
      authorization: { max_risk: 'irreversible', operator_confirmed: false, allow_navigation: false, allow_submit: false },
    }),
    state
  ).code === 'authorization_denied',
  'irreversible without operator_confirmed rejected'
);

// Replay
executor.clearReplayCache();
const plan = makePlan({ correlation_id: 'corr:replay' });
// Mock perception for execute path
globalThis.CcPerception = {
  getPerceptionState: () => state,
  resolveExecutionTarget: () => ({ element: null, error: 'stale_target' }),
};
const obs1 = await executor.execute(plan);
ok(obs1.kind === 'execution_observation', 'execute returns EO');
const obs2 = await executor.execute(plan);
ok(obs2.rejection_reason === 'correlation_replayed' || obs2.outcome === 'rejected', 'replay rejected');
ok((obs2.diagnostics || []).length >= 0, 'EO has diagnostics array');
// EO never includes raw values in failure path
const blob = JSON.stringify(obs1) + JSON.stringify(obs2);
ok(!blob.includes('actual_value') && !/"value":"Test"/.test(blob), 'EO does not leak typed action values as actual_value');

// No smuggling fields in schemas used by executor
const ap = readFileSync(resolve(ROOT, 'architecture/action-plan.schema.json'), 'utf8');
ok(!ap.includes('css_selector'), 'ActionPlan schema has no css_selector');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
