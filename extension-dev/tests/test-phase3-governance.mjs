#!/usr/bin/env node
/**
 * Phase 3.0 architecture contract tests (issue #96).
 * Architecture-only: validates governance and schema shape, not perception runtime behavior.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let passed = 0;
let failed = 0;

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}
function ok(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

const requiredContracts = [
  'architecture/perception-contract.yml',
  'architecture/page-ir.yml',
  'architecture/page-ir.schema.json',
  'architecture/dom-access-policy.yml',
  'architecture/widget-taxonomy.yml',
  'architecture/perception-lifecycle.yml',
  'architecture/perception-privacy.yml',
  'architecture/perception-confidence.yml',
  'architecture/perception-performance.yml',
  'architecture/ir-migrations/README.md',
];
const requiredAdrs = [
  'architecture/adrs/0001-public-ir-private-bindings.md',
  'architecture/adrs/0002-snapshot-revision-lifecycle.md',
  'architecture/adrs/0003-dom-gateway-boundaries.md',
  'architecture/adrs/0004-perception-identity.md',
  'architecture/adrs/0005-cross-origin-contexts.md',
  'architecture/adrs/0006-screenshot-privacy.md',
  'architecture/adrs/0007-service-adapter-no-selector.md',
];

console.log('\n=== Phase 3.0 Deliverables ===');
for (const rel of [...requiredContracts, ...requiredAdrs]) {
  ok(existsSync(resolve(ROOT, rel)), `${rel} exists`);
}
for (const rel of requiredAdrs) {
  if (existsSync(resolve(ROOT, rel))) ok(read(rel).includes('Status: Accepted'), `${rel} is accepted`);
}

console.log('\n=== Canonical Page IR Schema ===');
let schema = null;
try {
  schema = JSON.parse(read('architecture/page-ir.schema.json'));
  ok(true, 'page-ir.schema.json is valid JSON');
} catch (error) {
  ok(false, `page-ir.schema.json parses (${error.message})`);
}

if (schema) {
  ok(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'uses JSON Schema Draft 2020-12');
  ok(schema.$id?.includes('page-ir-2.0.0'), 'schema ID identifies Page IR 2.0.0');
  ok(Array.isArray(schema.oneOf) && schema.oneOf.length === 2, 'validates PageSnapshot and PageDelta wire types');
  for (const def of ['PageSnapshot', 'PageDelta', 'Node', 'Edge', 'Context', 'Evidence', 'Privacy', 'Widget']) {
    ok(!!schema.$defs?.[def], `defines ${def}`);
  }

  const forbiddenPublicKeys = new Set([
    'selector', 'css_selector', 'xpath', 'outer_html', 'inner_html',
    'dom_handle', 'element_reference', 'binding_id', 'option_selectors',
  ]);
  const found = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.properties && typeof value.properties === 'object') {
      for (const key of Object.keys(value.properties)) {
        if (forbiddenPublicKeys.has(key.toLowerCase())) found.add(key);
      }
    }
    if (Array.isArray(value.required)) {
      for (const key of value.required) {
        if (typeof key === 'string' && forbiddenPublicKeys.has(key.toLowerCase())) found.add(key);
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(schema);
  ok(found.size === 0, `public schema has no private locator/binding fields${found.size ? ': ' + [...found].join(', ') : ''}`);

  const snapshot = schema.$defs?.PageSnapshot;
  const required = new Set(snapshot?.required || []);
  for (const field of ['snapshot_id', 'document_id', 'revision', 'canonical_hash', 'contexts', 'nodes', 'edges', 'privacy']) {
    ok(required.has(field), `PageSnapshot requires ${field}`);
  }
  ok(schema.$defs?.PageDelta?.properties?.base_revision?.type === 'integer', 'PageDelta has integer base_revision');
  ok(schema.$defs?.Evidence?.properties?.confidence?.maximum === 1, 'evidence confidence is bounded at 1');
  ok(schema.$defs?.Node?.properties?.observed?.$ref === '#/$defs/ObservedFacts', 'nodes expose bounded observed facts');
}

console.log('\n=== Phase 3.0.1 Contract Hardening (issue #97) ===');
if (schema) {
  const delta = schema.$defs?.PageDelta;
  const dReq = new Set(delta?.properties ? Object.keys(delta.properties) : []);
  ok(delta?.required?.includes('result_snapshot_id'), 'PageDelta requires result_snapshot_id');
  ok(delta?.required?.includes('result_canonical_hash'), 'PageDelta requires result_canonical_hash');
  ok(delta?.required?.includes('privacy'), 'PageDelta requires privacy');
  ok(Array.isArray(schema.$defs?.DeltaOperation?.oneOf) && schema.$defs.DeltaOperation.oneOf.length >= 10,
    'DeltaOperation is a typed discriminated union (no arbitrary value)');
  ok(schema.$defs?.RemoveNodeOp && !('value' in (schema.$defs.RemoveNodeOp.properties || {})),
    'remove operations forbid a value payload');
  ok(schema.$defs?.AddNodeOp?.properties?.value?.$ref === '#/$defs/Node',
    'add node operation requires a typed Node value');
  ok(schema.$defs?.Context?.required?.includes('document_id'), 'Context carries a document_id for frame identity');
  ok(!!schema.$defs?.Evidence?.properties?.signals, 'Evidence exposes fact-addressable signals');
  ok(Array.isArray(schema.$defs?.Node?.allOf) && schema.$defs.Node.allOf.length >= 1,
    'Node enforces conditional secret-redaction constraints in-schema');
}

let actionPlan = null;
let execObs = null;
try { actionPlan = JSON.parse(read('architecture/action-plan.schema.json')); ok(true, 'action-plan.schema.json is valid JSON'); }
catch (e) { ok(false, `action-plan.schema.json parses (${e.message})`); }
try { execObs = JSON.parse(read('architecture/execution-observation.schema.json')); ok(true, 'execution-observation.schema.json is valid JSON'); }
catch (e) { ok(false, `execution-observation.schema.json parses (${e.message})`); }

if (actionPlan) {
  ok(actionPlan.$id?.includes('action-plan-3.0.0'), 'ActionPlan schema is v3.0.0');
  const tb = actionPlan.properties?.target_binding?.required || [];
  ok(['document_id', 'snapshot_id', 'expected_revision'].every(k => tb.includes(k)),
    'ActionPlan target_binding pins document/snapshot/expected_revision');
  ok(!!actionPlan.properties?.correlation_id && !!actionPlan.properties?.expires_at,
    'ActionPlan has correlation_id and expires_at');
  ok(actionPlan.$defs?.Target?.required?.join(',') === 'context_id,node_id',
    'ActionPlan targets are node identities (context_id,node_id), not selectors');
  const apStr = read('architecture/action-plan.schema.json');
  ok(!/"(css_selector|xpath|dom_handle|outer_html|inner_html)"\s*:/.test(apStr),
    'ActionPlan defines no selector/handle property');
}
if (execObs) {
  ok(execObs.$id?.includes('execution-observation-3.0.0'), 'ExecutionObservation schema is v3.0.0');
  ok(!!execObs.$defs?.FailureCode?.enum?.includes('stale_target'),
    'ExecutionObservation defines stale_target failure code');
  ok(!!execObs.properties?.correlation_id, 'ExecutionObservation echoes correlation_id');
}

const gatewaySecurity = read('architecture/gateway-security.yml');
ok(gatewaySecurity.includes('page_reachable: false'), 'gateway is not page-reachable');
ok(gatewaySecurity.includes('SEC-002'), 'gateway-security records the token-leak defect');
ok(gatewaySecurity.includes('toctou_revalidation'), 'gateway defines TOCTOU revalidation');

ok(existsSync(resolve(ROOT, 'extension-dev/tests/ratification/run-conformance.mjs')),
  'adversarial schema conformance harness exists');
ok(existsSync(resolve(ROOT, 'architecture/action-plan.schema.json')), 'ActionPlan v3 schema present');
ok(existsSync(resolve(ROOT, 'architecture/execution-observation.schema.json')), 'ExecutionObservation v3 schema present');

const lifecycleText = read('architecture/perception-lifecycle.yml');
ok(lifecycleText.includes('expected_revision exactly equals'), 'lifecycle requires exact revision equality');
ok(lifecycleText.includes('rebinding_continuity'), 'lifecycle defines rerender rebinding continuity');

const pageIrText = read('architecture/page-ir.yml');
ok(pageIrText.includes('RFC 8785'), 'canonicalization adopts RFC 8785 JCS');

console.log('\n=== Public/Private and Safety Contracts ===');
const pageIr = read('architecture/page-ir.yml');
const perception = read('architecture/perception-contract.yml');
const domPolicy = read('architecture/dom-access-policy.yml');
const privacy = read('architecture/perception-privacy.yml');
const lifecycle = read('architecture/perception-lifecycle.yml');
const migration = read('architecture/ir-migrations/README.md');

ok(pageIr.includes('schema_version: "2.0.0"'), 'readable Page IR matches schema version 2.0.0');
ok(pageIr.includes('status: frozen_contract'), 'Page IR contract is frozen');
ok(pageIr.includes('private_binding_table:'), 'public IR is separated from private binding table');
ok(perception.includes('Browser Perception may interpret DOM structure'), 'perception owns structural interpretation');
ok(perception.includes('Execution may access live elements solely through a constrained browser DOM gateway'), 'execution is restricted to the DOM gateway');
ok(domPolicy.includes('grandfathered_not_approved_for_expansion'), 'legacy DOM access is explicit and cannot expand');
ok(domPolicy.includes('Return stale_target'), 'stale targets fail without selector fallback');
ok(privacy.includes('raw_value: prohibited_by_default'), 'raw field values are denied by default');
ok(privacy.includes('default: disabled'), 'screenshots are disabled by default');
ok(lifecycle.includes('scope: "one active Document lifetime"'), 'document identity has an explicit lifetime');
ok(lifecycle.includes('never portable across reloads'), 'node identity does not claim cross-reload stability');
ok(migration.includes('Compatibility matrix'), 'IR migration defines old/new compatibility matrix');
ok(migration.includes('No negotiation means'), 'migration defines no-negotiation behavior');

console.log('\n=== Governance Alignment ===');
const phases = read('architecture/phases.yml');
const ownership = read('architecture/ownership.yml');
const boundaries = read('architecture/boundaries.yml');
const constitution = read('architecture/constitution.yml');
const verification = read('architecture/verification.yml');
const workflow = read('.github/workflows/architecture.yml');
const protocol = read('architecture/protocol.yml');

ok(/phase_2:[\s\S]*?status: frozen/.test(phases), 'Phase 2 remains frozen');
ok(/phase_3_0:[\s\S]*?status: frozen/.test(phases), 'Phase 3.0 is frozen');
ok(phases.includes('issues: ["#96"]'), 'Phase 3.0 records issue #96');
// #144 — repository numbering policy + phase_3_1 registry hygiene
ok(phases.includes('POLICY A') || phases.includes('Repository numbering wins'), 'Phase 3 numbering policy recorded (repo keys win)');
ok(phases.includes('conceptual perception taxonomy') || phases.includes('Conceptual perception taxonomy'), 'conceptual 3.0–3.10 mapping recorded without replacing registry keys');
ok(/phase_3_1:[\s\S]*?status: complete/.test(phases), 'Phase 3.1 Core Perception Engine is registered complete');
ok(phases.includes('issues: ["#99"]') || phases.includes('#99'), 'Phase 3.1 records issue #99');
ok(/phase_3_2:[\s\S]*?status: complete/.test(phases), 'Phase 3.2 Widget Classification is complete');
ok(/phase_3_3:[\s\S]*?status: frozen/.test(phases), 'Phase 3.3 Relationships/deltas is frozen');
ok(/phase_3_4:[\s\S]*?name: "WSS Protocol"/.test(phases), 'Phase 3.4 remains WSS Protocol (not widgets)');
// #156: phase_3_5 Navigation Understanding is frozen
ok(
  /phase_3_5:\s*\n\s*name:\s*"Navigation Understanding"\s*\n\s*status:\s*frozen/.test(phases),
  'phase_3_5 Navigation Understanding is frozen (#156)'
);
ok(phases.includes('freeze_issue') || phases.includes('#156') || phases.includes('runtime_baseline_commit'), 'phase_3_5 freeze evidence recorded');
// #158–#160: phase_3_6 Visual Context (conceptual 3.8) draft or implemented_unfrozen
ok(
  /phase_3_6:\s*\n\s*name:\s*"Visual Context"\s*\n\s*status:\s*(architecture_draft|implemented_unfrozen)/.test(phases),
  'phase_3_6 Visual Context registered as architecture_draft or implemented_unfrozen'
);
ok(!/phase_3_6:\s*\n\s*name:\s*"Visual Context"\s*\n\s*status:\s*frozen/.test(phases), 'phase_3_6 is not frozen');
ok(phases.includes('ActionPlanExecutor') && phases.includes('NOT a phase_3_'), 'APE excluded from phase_3_* milestones');
ok(
  ownership.includes('migration_phase: "phase_3_1"') || ownership.includes("migration_phase: 'phase_3_1'"),
  'ownership maps gateway/perception engine to phase_3_1'
);
ok(ownership.includes('browser_perception_contract:'), 'ownership maps the Phase 3 contract');
ok(ownership.includes('browser_dom_gateway:'), 'ownership reserves the DOM gateway');
ok(boundaries.includes('FB-008') && boundaries.includes('FB-009'), 'boundaries define public-IR and DOM-access checks');
ok(constitution.includes('phase_3_0_boundary:'), 'constitution contains the frozen Phase 3 boundary');
ok(verification.includes('CHECK-008') && verification.includes('CHECK-009'), 'verification registers Phase 3 contract and DOM checks');
ok(verification.includes('CHECK-010'), 'verification registers adversarial schema conformance');
ok(verification.includes('CHECK-011'), 'verification registers permanent extension/browser security regressions');
ok(workflow.includes('run-conformance.mjs'), 'CI runs adversarial schema conformance');
ok(workflow.includes('extension-security:'), 'CI defines a dedicated extension security job');
ok(workflow.includes('extension-dev/tests/security/run.mjs'), 'CI runs the permanent extension/browser security suite');
ok(gatewaySecurity.includes('security_regression_policy:'), 'gateway policy requires security regression coverage before issue closure');
ok(protocol.includes('phase_3_compatibility:'), 'protocol reserves negotiated Page IR compatibility');
ok(!workflow.includes('| Phase 2 | 🔄 Active |'), 'CI no longer reports Phase 2 as active');
ok(workflow.includes('test-phase3-governance.mjs'), 'CI runs Phase 3 governance tests');
ok(workflow.includes('dom-boundary-check.mjs'), 'CI enforces the added-line DOM boundary');
ok(existsSync(resolve(ROOT, 'tools/dom-boundary-check.mjs')), 'DOM boundary CI tool is present and trackable');

console.log('\n─────────────────────────────────');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
