import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://localhost:5432/cc_test_action_plan';
const { buildPlan } = await import('../../extension-service/plan-builder.js');
const { classifyField, FieldClassification } = await import('../../extension-service/mapping-engine.js');
const { createSession, attachPlan, getSession } = await import('../../extension-service/fill-session.js');

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
const executor = require(resolve(ROOT, 'extension/runtime/action-plan-executor.js'));

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failed++; console.error(`  ✗ ${message}`); }
}

function makePlan(overrides = {}) {
  return {
    kind: 'action_plan',
    schema_version: '3.0.0',
    plan_id: 'plan:test',
    correlation_id: 'corr:test',
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

console.log('\n=== ActionPlan v3 Product Path ===');

const popupSource = readFileSync(resolve(ROOT, 'extension/popup.js'), 'utf8');
ok(popupSource.includes('CcActionPlanExecutor.execute(actionPlan)'), 'side-panel delegates execution to the dedicated v3 executor');
ok(!popupSource.includes('Fallback: accessible-name matching'), 'side-panel has no semantic alternative-target fallback');
ok(popupSource.includes('body: JSON.stringify(executionObservation)'), 'side-panel posts the canonical ExecutionObservation body');

const state = { documentId: 'doc:test', snapshotId: 'snap:test', revision: 1 };
ok(executor.validatePlan(makePlan(), state).ok, 'valid ActionPlan passes envelope checks');
ok(executor.validatePlan(makePlan({ expires_at: new Date(0).toISOString() }), state).code === 'plan_expired', 'expired plan is rejected');
ok(executor.validatePlan(makePlan(), { ...state, revision: 2 }).code === 'stale_snapshot', 'revision mismatch is rejected');

const targetElement = { isConnected: true };
globalThis.CcPerception = {
  getPerceptionState: () => state,
  resolveExecutionTarget: () => ({ element: targetElement, error: null }),
};
globalThis.CcDomGateway = {
  performAction: () => ({ success: true, error: null }),
  readAriaState: () => ({ valueState: 'nonempty', selected: null, checked: null, expanded: null, focused: false }),
};
const successObservation = await executor.execute(makePlan());
ok(successObservation.kind === 'execution_observation' && successObservation.schema_version === '3.0.0', 'executor emits ExecutionObservation v3');
ok(successObservation.outcome === 'completed' && successObservation.steps[0].status === 'succeeded', 'verified mechanical action completes');
ok(!('actual_value' in successObservation.steps[0]), 'observation does not leak raw values');

globalThis.CcPerception.resolveExecutionTarget = () => ({ element: null, error: 'stale_target' });
const staleObservation = await executor.execute(makePlan());
ok(staleObservation.outcome === 'aborted', 'stale target aborts a plan with no successful steps');
ok(staleObservation.steps[0].failure_code === 'stale_target', 'stale target is reported explicitly');

const selectNode = {
  node_id: 'node:select', context_id: 'ctx.top.1', kind: 'control', parent_id: null,
  affordances: ['select_one'], observed: { accessible_name: 'Gender' }, widget: null,
};
const optionNode = {
  node_id: 'node:option:female', context_id: 'ctx.top.1', kind: 'option', parent_id: 'node:select',
  affordances: ['activate'], observed: { accessible_name: 'Female' }, widget: null,
};
const selectPlan = buildPlan({
  snapshot: {
    document_id: 'doc:test', snapshot_id: 'snap:test', revision: 1,
    nodes: { [selectNode.node_id]: selectNode, [optionNode.node_id]: optionNode },
  },
  mappings: [{
    node_id: selectNode.node_id, context_id: selectNode.context_id,
    semantic_key: 'gender', profile_key: 'gender', value: 'Female', mapping_record: null,
  }],
  correlationId: 'corr:select',
  orderedNodeIds: [selectNode.node_id],
});
ok(selectPlan.steps[0].action.option_target.node_id === optionNode.node_id, 'server resolves select to a concrete option node');
ok(!JSON.stringify(selectPlan).includes(':pending'), 'plan contains no placeholder option target');

const noOptionPlan = buildPlan({
  snapshot: { document_id: 'doc:test', snapshot_id: 'snap:test', revision: 1, nodes: { [selectNode.node_id]: selectNode } },
  mappings: [{ node_id: selectNode.node_id, context_id: selectNode.context_id, semantic_key: 'gender', profile_key: 'gender', value: 'Female' }],
  correlationId: 'corr:nooption',
  orderedNodeIds: [selectNode.node_id],
});
ok(noOptionPlan === null, 'select without a public option node is safely omitted');

const piiNode = { affordances: ['type_text'], privacy: { classification: 'sensitive' }, state: { enabled: true, readonly: false } };
const secretNode = { affordances: ['type_text'], privacy: { classification: 'secret' }, state: { enabled: true, readonly: false } };
ok(classifyField(piiNode) === FieldClassification.PROFILE_DATA, 'privacy-sensitive Aadhaar/PAN-like data remains fillable profile data');
ok(classifyField(secretNode) === FieldClassification.SENSITIVE, 'secret authentication data remains non-fillable');

const fillSession = createSession({
  workspace_id: 'workspace:test', document_id: 'doc:test', snapshot_id: 'snap:test', correlation_id: 'corr:test',
  metadata: { portal_id: 'ssc.gov.in', form_key: '/form', profile_id: null },
});
attachPlan(fillSession.session_id, 'plan:test', 1, ['step:text'], ['node:text'], [{
  context_id: 'ctx.top.1', label: 'Full Name', semantic_key: 'name', profile_key: 'name',
  knowledge_record_id: 'record:test', action_op: 'type_text', risk: 'safe',
}]);
const storedStep = getSession(fillSession.session_id).steps[0];
ok(storedStep.label === 'Full Name' && storedStep.knowledge_record_id === 'record:test', 'fill session retains semantic and learning evidence links');

const originalFetch = globalThis.fetch;
const originalAIEnv = {
  AI_API_KEY: process.env.AI_API_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
};
try {
  process.env.AI_API_KEY = 'test-timeout-key';
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_TIMEOUT_MS = '25';
  const aiKeyManager = await import('../../extension-service/ai-key-manager.js');
  aiKeyManager._reset();
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const startedAt = Date.now();
  const timedOut = await aiKeyManager.callAI({ systemPrompt: 'system', userPrompt: 'user' });
  ok(timedOut?.ok === false && /timed out after 25ms/.test(timedOut.error || ''), 'AI provider calls fail with an explicit bounded-timeout diagnostic');
  ok(Date.now() - startedAt < 1000, 'AI timeout returns well before the public gateway deadline');
  aiKeyManager._reset();
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalAIEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
