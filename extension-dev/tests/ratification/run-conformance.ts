#!/usr/bin/env node
/**
 * Phase 3.0 ratification: adversarial schema conformance.
 *
 * Loads the canonical Phase 3 JSON schemas with a real Draft 2020-12 validator
 * (AJV) and asserts:
 *   - every POSITIVE fixture validates, and
 *   - every MALICIOUS fixture is REJECTED.
 *
 * A malicious fixture that validates is a freeze blocker. Exit non-zero on any
 * miss. This is the enforceability proof the freeze is conditional on.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const read = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const schemas = {
  pageIr: ajv.compile(read('architecture/page-ir.schema.json')),
  actionPlan: ajv.compile(read('architecture/action-plan.schema.json')),
  execObs: ajv.compile(read('architecture/execution-observation.schema.json')),
};

let passed = 0;
let failed = 0;
const fail = (msg, detail) => { failed++; console.error(`  \u2717 FAIL: ${msg}${detail ? ' \u2014 ' + detail : ''}`); };
const pass = (msg) => { passed++; console.log(`  \u2713 ${msg}`); };

/** Assert a fixture is accepted by a validator. */
function expectValid(validate, name, data) {
  if (validate(data)) pass(`valid: ${name}`);
  else fail(`valid fixture rejected: ${name}`, ajv.errorsText(validate.errors));
}
/** Assert a fixture is rejected by a validator (the adversarial case). */
function expectInvalid(validate, name, data) {
  if (!validate(data)) pass(`rejected malicious: ${name}`);
  else fail(`MALICIOUS FIXTURE ACCEPTED: ${name}`, 'schema did not reject exploit payload');
}

// ─────────────────────────────────────────────────────────────────────
// Shared valid building blocks
// ─────────────────────────────────────────────────────────────────────
const producer = {
  name: 'cybercontrol-browser-perception',
  version: '2.0.0',
  detectors: { core: 'v1' },
};
const evidence = {
  source: 'observed', detector: 'core', detector_version: 'v1',
  confidence: 1, signals: ['role.textbox'], facts: ['input type text'],
};
const observed = {
  accessible_name: 'Full name', role: 'textbox', sanitized_text: null,
  language: 'en', description: null, value_state: 'empty',
};
const nodeState = {
  visible: true, enabled: true, readonly: false, required: true,
  focused: false, expanded: null, selected: null, checked: null,
};
const publicPrivacy = { classification: 'ordinary', redacted: false, reason: null };

const validNode = {
  node_id: 'n1', kind: 'control', context_id: 'ctx-top', parent_id: 'form1',
  order: 0, observed, state: nodeState, geometry: null, privacy: publicPrivacy,
  evidence: [evidence], affordances: ['focus', 'type_text'], widget: null,
};
const validContext = {
  context_id: 'ctx-top', parent_context_id: null, kind: 'top_level',
  document_id: 'doc1', origin: 'https://portal.example', access: 'accessible',
  root_node_id: 'page1', diagnostic_code: null,
};
const validState = { signals: [], candidates: [] };
const validPrivacy = { classification: 'ordinary', redacted: false, reason: null };

const validSnapshot = {
  kind: 'page_snapshot', schema_version: '2.0.0', producer,
  snapshot_id: 'snap1', document_id: 'doc1', revision: 0,
  observed_at: '2026-08-05T10:00:00Z',
  canonical_hash: 'sha256:' + 'a'.repeat(64),
  page: {
    origin: 'https://portal.example', path: '/apply', route_key: 'apply',
    title: 'Apply', language: 'en',
    viewport: { width: 1280, height: 800, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 },
  },
  contexts: [validContext],
  nodes: { n1: validNode },
  edges: [],
  state: validState,
  diagnostics: [],
  privacy: validPrivacy,
};

const validDelta = {
  kind: 'page_delta', schema_version: '2.0.0', producer,
  document_id: 'doc1', base_snapshot_id: 'snap1', base_revision: 0, revision: 1,
  observed_at: '2026-08-05T10:00:01Z',
  result_snapshot_id: 'snap2',
  result_canonical_hash: 'sha256:' + 'b'.repeat(64),
  operations: [
    { op: 'remove', entity: 'node', id: 'n1' },
    { op: 'add', entity: 'node', id: 'n2', value: { ...validNode, node_id: 'n2' } },
    { op: 'replace', entity: 'state', id: null, value: validState },
  ],
  diagnostics: [],
  privacy: validPrivacy,
};

const validActionPlan = {
  kind: 'action_plan', schema_version: '3.0.0', plan_id: 'plan1',
  correlation_id: 'corr1', issued_at: '2026-08-05T10:00:02Z',
  expires_at: '2026-08-05T10:05:02Z',
  target_binding: { document_id: 'doc1', snapshot_id: 'snap1', expected_revision: 0 },
  steps: [
    {
      step_id: 's1', target: { context_id: 'ctx-top', node_id: 'n1' },
      action: { op: 'type_text', value: 'Asha', clear_first: true },
      risk: 'reversible', required_affordance: 'type_text', required_adapter_id: null,
      postcondition: { type: 'value_state', expected_value_state: 'nonempty' },
      on_failure: 'stop_and_report',
    },
  ],
  authorization: { max_risk: 'reversible', operator_confirmed: false, allow_navigation: false, allow_submit: false },
};

const validExecObs = {
  kind: 'execution_observation', schema_version: '3.0.0', observation_id: 'obs1',
  plan_id: 'plan1', correlation_id: 'corr1', document_id: 'doc1',
  observed_at: '2026-08-05T10:00:03Z', outcome: 'completed',
  resulting_revision: 1, resulting_snapshot_id: 'snap2',
  steps: [{ step_id: 's1', status: 'succeeded', failure_code: null, postcondition_met: true, observed_value_state: 'nonempty', duration_ms: 12 }],
  diagnostics: [],
};

// Deep clone helper
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log('\n=== POSITIVE fixtures (must validate) ===');
expectValid(schemas.pageIr, 'PageSnapshot', validSnapshot);
expectValid(schemas.pageIr, 'PageDelta (typed ops)', validDelta);
expectValid(schemas.actionPlan, 'ActionPlan v3', validActionPlan);
expectValid(schemas.execObs, 'ExecutionObservation v3', validExecObs);
// A legitimately redacted secret node
{
  const s = clone(validSnapshot);
  s.nodes.n1.privacy = { classification: 'secret', redacted: true, reason: 'password' };
  s.nodes.n1.observed = { ...observed, sanitized_text: null, value_state: 'masked' };
  expectValid(schemas.pageIr, 'PageSnapshot with correctly-redacted secret node', s);
}

console.log('\n=== MALICIOUS fixtures (must be rejected) ===');

// 1. Selector smuggled into a node
{
  const s = clone(validSnapshot);
  s.nodes.n1.selector = '#password';
  expectInvalid(schemas.pageIr, 'node carrying a selector field', s);
}
// 2. outer_html smuggled into observed facts
{
  const s = clone(validSnapshot);
  s.nodes.n1.observed.outer_html = '<input value="secret">';
  expectInvalid(schemas.pageIr, 'observed facts carrying outer_html', s);
}
// 3. Untyped delta op with arbitrary object value (the original P0 escape hatch)
{
  const d = clone(validDelta);
  d.operations = [{ op: 'add', entity: 'node', id: 'x', value: { selector: '#x', outer_html: '<i>', binding_id: 'b1' } }];
  expectInvalid(schemas.pageIr, 'delta add-node with arbitrary selector-bearing value', d);
}
// 4. remove op carrying a value payload
{
  const d = clone(validDelta);
  d.operations = [{ op: 'remove', entity: 'node', id: 'n1', value: { anything: true } }];
  expectInvalid(schemas.pageIr, 'delta remove op with a value payload', d);
}
// 5. add op with NO value (missing typed payload)
{
  const d = clone(validDelta);
  d.operations = [{ op: 'add', entity: 'node', id: 'n2' }];
  expectInvalid(schemas.pageIr, 'delta add op missing typed value', d);
}
// 6. delta op with unknown entity
{
  const d = clone(validDelta);
  d.operations = [{ op: 'add', entity: 'selector_map', id: 'n2', value: {} }];
  expectInvalid(schemas.pageIr, 'delta op with unknown entity', d);
}
// 7. PageDelta missing result identity/hash/privacy
{
  const d = clone(validDelta);
  delete d.result_snapshot_id; delete d.result_canonical_hash; delete d.privacy;
  expectInvalid(schemas.pageIr, 'PageDelta missing result_snapshot_id/hash/privacy', d);
}
// 8. secret node not redacted
{
  const s = clone(validSnapshot);
  s.nodes.n1.privacy = { classification: 'secret', redacted: false, reason: null };
  expectInvalid(schemas.pageIr, 'secret node with redacted:false', s);
}
// 9. secret node carrying raw sanitized_text
{
  const s = clone(validSnapshot);
  s.nodes.n1.privacy = { classification: 'secret', redacted: true, reason: 'otp' };
  s.nodes.n1.observed = { ...observed, sanitized_text: '482913', value_state: 'nonempty' };
  expectInvalid(schemas.pageIr, 'secret node leaking raw text + unmasked value_state', s);
}
// 10. Context missing document_id (frame identity hole)
{
  const s = clone(validSnapshot);
  delete s.contexts[0].document_id;
  expectInvalid(schemas.pageIr, 'context missing document_id', s);
}
// 11. confidence out of bounds
{
  const s = clone(validSnapshot);
  s.nodes.n1.evidence[0].confidence = 1.5;
  expectInvalid(schemas.pageIr, 'evidence confidence > 1', s);
}
// 12. ActionPlan target as a selector instead of node identity
{
  const p = clone(validActionPlan);
  p.steps[0].target = { css_selector: '#name' };
  expectInvalid(schemas.actionPlan, 'ActionPlan step target using css_selector', p);
}
// 13. ActionPlan missing target_binding (no snapshot/revision pinning)
{
  const p = clone(validActionPlan);
  delete p.target_binding;
  expectInvalid(schemas.actionPlan, 'ActionPlan missing target_binding', p);
}
// 14. ActionPlan target_binding missing expected_revision
{
  const p = clone(validActionPlan);
  delete p.target_binding.expected_revision;
  expectInvalid(schemas.actionPlan, 'ActionPlan target_binding missing expected_revision', p);
}
// 15. ActionPlan missing expiry
{
  const p = clone(validActionPlan);
  delete p.expires_at;
  expectInvalid(schemas.actionPlan, 'ActionPlan missing expires_at', p);
}
// 16. ActionPlan unknown action op
{
  const p = clone(validActionPlan);
  p.steps[0].action = { op: 'run_script', code: 'alert(1)' };
  expectInvalid(schemas.actionPlan, 'ActionPlan with unknown/dangerous action op', p);
}
// 17. ActionPlan select_option targeting fuzzy text instead of an option node
{
  const p = clone(validActionPlan);
  p.steps[0].action = { op: 'select_option', option_text: 'Male' };
  expectInvalid(schemas.actionPlan, 'select_option using fuzzy option_text', p);
}
// 18. ActionPlan upload with raw filesystem path instead of reference token
{
  const p = clone(validActionPlan);
  p.steps[0].action = { op: 'upload', file_path: 'C:/Users/asha/aadhaar.pdf' };
  expectInvalid(schemas.actionPlan, 'upload with raw file_path', p);
}
// 19. ExecutionObservation leaking a raw value field
{
  const o = clone(validExecObs);
  o.steps[0].actual_value = 'Asha Kumar';
  expectInvalid(schemas.execObs, 'ExecutionObservation step leaking actual_value', o);
}
// 20. ExecutionObservation with unknown failure code
{
  const o = clone(validExecObs);
  o.steps[0] = { step_id: 's1', status: 'failed', failure_code: 'selector_not_found', postcondition_met: false };
  expectInvalid(schemas.execObs, 'ExecutionObservation with non-enum failure_code', o);
}
// 21. ExecutionObservation missing correlation_id (no replay correlation)
{
  const o = clone(validExecObs);
  delete o.correlation_id;
  expectInvalid(schemas.execObs, 'ExecutionObservation missing correlation_id', o);
}

console.log('\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
