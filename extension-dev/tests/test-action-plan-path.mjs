import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATABASE_URL ||= 'postgresql://localhost:5432/cc_test_action_plan';
const { buildPlan } = await import('../../extension-service/plan-builder.js');
const { classifyField, FieldClassification, resolveNodeMapping } = await import('../../extension-service/mapping-engine.js');
const { buildRecords } = await import('../../extension-service/execution-evidence.js');
const { buildMappingObservationEntries, applyMappingObservations } = await import('../../extension-service/mapping-observations.js');
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

const textNode = (node_id, label) => ({
  node_id, context_id: 'ctx.top.1', kind: 'control',
  affordances: ['type_text'], state: { enabled: true, readonly: false },
  observed: { accessible_name: label, description: '' },
});
const boardRecord = {
  id: 'record:board', lineage_id: 'lineage:board', version: 1, status: 'active', confidence: 0.9,
  source: { origin: 'imported' }, scope: { level: 'global' },
  payload: {
    field_label: 'board_10th', semantic_key: 'board_10th', profile_key: 'board_10th',
    match_patterns: ['matriculation', 'class_10'],
  },
};
const nameRecord = {
  id: 'record:name', status: 'active', confidence: 0.9, source: { origin: 'imported' },
  scope: { level: 'global' },
  payload: { field_label: 'name', semantic_key: 'name', profile_key: 'name', match_patterns: ['full_name'] },
};
const rollRecord = {
  id: 'record:roll', status: 'active', confidence: 0.9, source: { origin: 'imported' },
  scope: { level: 'global' },
  payload: { field_label: 'roll_number', semantic_key: 'roll_number', profile_key: 'roll_number', match_patterns: ['roll number'] },
};
const roll10thRecord = {
  id: 'record:roll-10th', status: 'active', confidence: 0.9, source: { origin: 'imported' },
  scope: { level: 'global' },
  payload: {
    field_label: 'roll_number_10th', semantic_key: 'roll_number_10th', profile_key: 'roll_number_10th',
    match_patterns: ['matriculation_10th_class_roll_number'],
  },
};
const mappingProfile = { name: 'Applicant', board_10th: 'Expected Board', roll_no_10th: '1500099' };
const scribeMapping = resolveNodeMapping(
  textNode('node:scribe', "Scribe's Name (As per Matriculation Certificate)"),
  [boardRecord, nameRecord], [], mappingProfile
);
ok(scribeMapping === null, 'Scribe Name is not filled from applicant name or broad matriculation board knowledge');
const rollMapping = resolveNodeMapping(
  textNode('node:roll', 'Matriculation (10th class) Roll Number'),
  [boardRecord, rollRecord, roll10thRecord], [], mappingProfile
);
ok(rollMapping?.semantic_key === 'roll_number_10th' && rollMapping?.profile_key === 'roll_number_10th', 'matriculation roll number resolves to the 10th-roll semantic/profile key');
ok(rollMapping?.value === '1500099' && rollMapping?.mapping_record?.id === 'record:roll-10th', '10th-roll mapping reads roll_no_10th through the specific knowledge record');
ok(rollMapping?.matched_pattern === 'matriculation 10th class roll number', 'punctuation-normalized match provenance identifies the exact 10th-roll pattern');
const contextualRollFallback = resolveNodeMapping(
  textNode('node:roll-fallback', 'Matriculation (10th class) Roll Number'),
  [rollRecord], [], mappingProfile
);
ok(contextualRollFallback?.profile_key === 'roll_number_10th' && contextualRollFallback?.transformation === 'contextual_profile_alias', 'generic roll knowledge safely falls back to the contextual 10th-roll profile alias');
const actualBoardMapping = resolveNodeMapping(
  textNode('node:board', 'Matriculation Education Board'),
  [boardRecord], [], mappingProfile
);
ok(actualBoardMapping?.profile_key === 'board_10th' && actualBoardMapping?.matched_pattern === 'matriculation', 'explicit board label can still use board_10th with matched-pattern provenance');

const fillSession = createSession({
  workspace_id: 'workspace:test', document_id: 'doc:test', snapshot_id: 'snap:test', correlation_id: 'corr:test',
  metadata: { portal_id: 'ssc.gov.in', form_key: '/form', profile_id: null },
});
attachPlan(fillSession.session_id, 'plan:test', 1, ['step:text'], ['node:text'], [{
  context_id: 'ctx.top.1', label: 'Full Name', semantic_key: 'name', profile_key: 'name',
  knowledge_record_id: 'record:test', mapping_lineage_id: 'lineage:test', mapping_version: 2,
  mapping_source: 'imported', mapping_status: 'active', mapping_confidence: 0.9,
  mapping_scope: { level: 'global' }, mapping_disposition: null,
  mapping_matched_pattern: 'full name', mapping_match_score: 9,
  mapping_match_patterns: ['full_name', 'candidate_name'], transformation: 'direct',
  action_op: 'type_text', risk: 'safe',
}]);
const storedStep = getSession(fillSession.session_id).steps[0];
ok(storedStep.label === 'Full Name' && storedStep.knowledge_record_id === 'record:test', 'fill session retains semantic and learning evidence links');
ok(storedStep.mapping_source === 'imported' && storedStep.mapping_matched_pattern === 'full name', 'fill session retains source and exact match provenance');

const evidenceObservation = {
  observation_id: 'obs:test', plan_id: 'plan:test', correlation_id: 'corr:test',
  document_id: 'doc:test', observed_at: new Date().toISOString(), outcome: 'completed',
  steps: [{
    step_id: 'step:text', status: 'succeeded', failure_code: null,
    postcondition_met: true, observed_value_state: 'nonempty', duration_ms: 4,
  }],
};
const evidenceRecords = buildRecords(getSession(fillSession.session_id), evidenceObservation);
ok(evidenceRecords[0].knowledgeRecordId === 'record:test' && evidenceRecords[0].mappingConfidence === 0.9, 'PostgreSQL session record includes mapping record ID, source, status, confidence, and scope');
ok(evidenceRecords[0].mappingMatchedPattern === 'full name' && evidenceRecords[0].transformation === 'direct', 'PostgreSQL session record explains the match and transformation');
const mappingEntries = buildMappingObservationEntries(getSession(fillSession.session_id), evidenceObservation, 'persistent:test');
ok(mappingEntries[0].semanticKey === 'name' && mappingEntries[0].contextId === 'ctx.top.1' && mappingEntries[0].nodeId === 'node:text', 'mapping journal links observed label and semantic/profile keys to public context/node IDs');
ok(mappingEntries[0].result === 'filled' && mappingEntries[0].postconditionMet === true, 'mapping journal records mechanical result and postcondition without claiming semantic confirmation');
const redactedEvidence = JSON.stringify({ evidenceRecords, mappingEntries });
ok(!redactedEvidence.includes('selector') && !redactedEvidence.includes('binding') && !redactedEvidence.includes('Test'), 'persisted evidence contains no selectors, private binding IDs, or raw action/profile values');
ok(mappingEntries[0].source === 'observed-server-plan', 'mechanical success remains observed diagnostic evidence rather than confirmed knowledge');
const mappingDocument = {
  '/form': {
    name: { label: 'Full Name', profileKey: 'manually_reviewed_name', source: 'manual' },
    email: { label: 'Email', profileKey: 'email', source: 'confirmed' },
  },
};
applyMappingObservations(mappingDocument, {
  formKey: '/form', hostname: 'ssc.gov.in', observedAt: evidenceObservation.observed_at, entries: mappingEntries,
});
ok(mappingDocument['/form'].name.profileKey === 'manually_reviewed_name' && mappingDocument['/form'].email.source === 'confirmed', 'observation persistence never overwrites manual or confirmed mappings');
ok(mappingDocument['/form']._observations.length === 1, 'redacted evidence is retained in reserved metadata inside the existing per-form mappings store');

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
  globalThis.fetch = async (_url, options = {}) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted during body read')), { once: true });
    }),
  });
  const startedAt = Date.now();
  const timedOut = await Promise.race([
    aiKeyManager.callAI({ systemPrompt: 'system', userPrompt: 'user' }),
    new Promise(resolve => setTimeout(() => resolve({ ok: false, error: 'test watchdog expired' }), 500)),
  ]);
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
