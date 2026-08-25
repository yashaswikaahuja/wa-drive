#!/usr/bin/env node
/**
 * Phase 3.7 Hardening & Repository Architecture — CHECK-015 semantic governance (#164).
 * Architecture-only: no mass reorg / no freeze.
 * Conceptual taxonomy slot 3.9 maps to repository key phase_3_7 (Policy A).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const jread = (rel) => JSON.parse(read(rel));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

const FORBIDDEN_ERROR_KEYS = [
  'css_selector', 'xpath', 'outer_html', 'inner_html', 'raw_value',
  'binding_id', 'password', 'dom_handle', 'credentials',
];

const FROZEN_FAILURE_CODES = new Set([
  'plan_expired', 'stale_target', 'stale_snapshot', 'adapter_mismatch',
  'affordance_mismatch', 'document_replaced', 'authorization_denied',
  'correlation_replayed', 'file_reference_invalid', 'action_unsupported',
  'postcondition_failed', 'gateway_error',
]);

function collectKeys(obj, out = new Set()) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectKeys(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    out.add(k);
    collectKeys(v, out);
  }
  return out;
}

console.log('\n=== Phase 3.7 Hardening artifacts ===');
const required = [
  'architecture/hardening-repository.yml',
  'architecture/hardening-repository.migration-map.json',
  'architecture/adrs/0012-repository-module-boundaries.md',
  'architecture/adrs/0013-error-taxonomy-ownership.md',
];
for (const rel of required) {
  ok(existsSync(resolve(ROOT, rel)), `${rel} exists`);
}

const contract = read('architecture/hardening-repository.yml');
ok(contract.includes('contract_version: "0.1.0"') || contract.includes("contract_version: '0.1.0'"), 'contract version 0.1.0');
ok(contract.includes('status: architecture_draft'), 'contract remains architecture_draft (not frozen)');
ok(contract.includes('phase: phase_3_7') || contract.includes('phase_3_7'), 'registry key phase_3_7');
ok(contract.includes('conceptual_roadmap_slot: "3.9"') || contract.includes('3.9'), 'maps conceptual 3.9');
ok(contract.includes('issue: "#164"') || contract.includes('#164'), 'references #164');

// Required architecture sections
const topics = [
  ['as_is_inventory', /as_is_inventory:/],
  ['target_structure', /target_structure:/],
  ['error_architecture', /error_architecture:/],
  ['decomposition_rules', /decomposition_rules:/],
  ['dependency_direction', /dependency_direction:/],
  ['test_taxonomy', /test_taxonomy:/],
  ['implementation_allowed', /implementation_allowed_after_review:/],
  ['out_of_scope', /out_of_scope_this_issue:|Mass file moves/],
];
for (const [name, re] of topics) {
  ok(re.test(contract), `contract covers ${name}`);
}

// Ownership / boundary
ok(contract.includes('browser_extension:') || contract.includes('browser_extension'), 'browser ownership');
ok(contract.includes('extension_service:') || contract.includes('extension_service'), 'service ownership');
ok(/must_not:[\s\S]*business workflow|must_not:[\s\S]*candidate selection/i.test(contract)
  || contract.includes('business workflow candidate selection'), 'forbids browser business selection');
ok(contract.includes('FailureCode') || contract.includes('failure_code'), 'FailureCode mapping referenced');
ok(contract.includes('operator_message') || contract.includes('operator messages'), 'operator-safe messages');

// Must not weaken frozen phases
ok(contract.includes('phase_3_6') || contract.includes('phase_3_5'), 'depends on frozen 3.5/3.6');
ok(contract.includes('MUST NOT invent new public FailureCodes')
  || contract.includes('MUST NOT invent new public FailureCodes'.toLowerCase())
  || /MUST NOT invent new public FailureCodes|must not invent new public/i.test(contract)
  || contract.includes('without a contract amendment'), 'no silent FailureCode invention');

// No mass reorg from this issue
ok(/Mass file moves|mass reorg|Does NOT implement mass/i.test(contract), 'explicitly no mass reorg in this issue');

// Boundary diagram + freeze-file split procedure (#165 P1 rem)
ok(/boundary_diagram:|BROWSER EXTENSION|eyes \+ hands|apps/extension-service/i.test(contract),
  'extension↔server boundary diagram present');
ok(contract.includes('freeze_file_internal_split') || contract.includes('frozen_files path'),
  'freeze-file internal split procedure present');
ok(/stable public facade|facade export/i.test(contract), 'freeze split requires stable facade');

console.log('\n=== ADRs ===');
const adr12 = read('architecture/adrs/0012-repository-module-boundaries.md');
const adr13 = read('architecture/adrs/0013-error-taxonomy-ownership.md');
ok(adr12.includes('facade') || adr12.includes('Facades'), 'ADR-0012 facades decision');
ok(adr12.includes('Rejected alternatives'), 'ADR-0012 rejected alternatives');
ok(adr13.includes('FailureCode') || adr13.includes('operator'), 'ADR-0013 error ownership');
ok(adr13.includes('Rejected alternatives'), 'ADR-0013 rejected alternatives');
ok(!/Status: Accepted \(frozen/.test(adr12), 'ADR-0012 not frozen yet');

console.log('\n=== Migration map ===');
const mig = jread('architecture/hardening-repository.migration-map.json');
ok(mig.status === 'architecture_draft', 'migration map not frozen');
ok(Array.isArray(mig.entries) && mig.entries.length >= 5, 'migration entries present');
ok(Array.isArray(mig.priority_order) && mig.priority_order.length >= 3, 'priority_order present');
const ids = new Set(mig.entries.map((e) => e.id));
ok(ids.has('MIG-POPUP-01'), 'MIG-POPUP-01 present');
ok(ids.has('MIG-ERR-01'), 'MIG-ERR-01 present');
ok(ids.has('MIG-GW-01'), 'MIG-GW-01 present');
for (const e of mig.entries) {
  ok(e.current && e.proposed && e.compatibility_risk, `${e.id} has current/proposed/risk`);
}

console.log('\n=== Fixtures (semantic) ===');
const fixDir = resolve(ROOT, 'architecture/fixtures/hardening');
ok(existsSync(fixDir), 'fixtures/hardening exists');
const fixFiles = readdirSync(fixDir).filter((f) => f.endsWith('.json'));
ok(fixFiles.length >= 4, `at least 4 hardening fixtures (have ${fixFiles.length})`);

const depPos = jread('architecture/fixtures/hardening/positive-dependency-direction.json');
ok(Array.isArray(depPos.allowed_edges) && depPos.allowed_edges.length > 0, 'positive dependency edges');
const depMal = jread('architecture/fixtures/hardening/malicious-forbidden-imports.json');
ok(depMal.expect === 'reject' && Array.isArray(depMal.forbidden_edges), 'malicious forbidden imports');
ok(depMal.forbidden_edges.some((e) => String(e.from).includes('perception') && String(e.to).includes('mapper')),
  'forbids perception→mapper');
ok(depMal.forbidden_edges.some((e) => String(e.to).includes('fill-planner')),
  'forbids runtime→fill-planner');

const errPos = jread('architecture/fixtures/hardening/positive-error-operator-safe.json');
ok(FROZEN_FAILURE_CODES.has(errPos.envelope?.failure_code), 'positive error uses frozen FailureCode');
ok(errPos.envelope?.operator_message && !errPos.envelope.operator_message.includes('#'),
  'operator message non-selector-ish');
const errKeys = collectKeys(errPos.envelope);
ok([...errKeys].every((k) => !FORBIDDEN_ERROR_KEYS.includes(k)), 'positive error envelope no forbidden keys');

const errMal = jread('architecture/fixtures/hardening/malicious-error-leak.json');
ok(errMal.expect === 'reject', 'malicious error expect reject');
ok(Array.isArray(errMal.forbidden_keys_present) && errMal.forbidden_keys_present.length > 0, 'lists forbidden keys');
const malKeys = collectKeys(errMal.envelope || {});
const present = errMal.forbidden_keys_present.filter((k) => malKeys.has(k));
ok(present.length > 0, 'malicious envelope contains declared leak keys');

console.log('\n=== Frozen contracts not weakened ===');
const phases = read('architecture/phases.yml');
ok(/phase_3_5:[\s\S]*?status:\s*frozen/.test(phases), 'phase_3_5 remains frozen');
ok(/phase_3_6:[\s\S]*?status:\s*frozen/.test(phases), 'phase_3_6 remains frozen');
ok(/phase_3_4:[\s\S]*WSS/.test(phases), 'phase_3_4 remains WSS');
ok(phases.includes('POLICY A') || phases.includes('Repository numbering wins'), 'Policy A present');

const nav = read('architecture/navigation-understanding.yml');
ok(nav.includes('status: frozen'), 'navigation contract frozen');
const vis = read('architecture/visual-context.yml');
ok(vis.includes('status: frozen'), 'visual-context contract frozen');

// Perception product path must not import autofill mapper (current tree check)
const percIndex = read('apps/extension/perception/index.js');
ok(!percIndex.includes('autofill/mapper') && !percIndex.includes('autofill\\mapper'),
  'perception index does not import autofill mapper');
const ape = read('apps/extension/runtime/action-plan-executor.js');
ok(!ape.includes('autofill/mapper'), 'APE does not import autofill mapper');

console.log('\n=== Registry / ownership / verification ===');
ok(
  /phase_3_7:\s*\n\s*name:\s*"Hardening, Validation & Repository Architecture"\s*\n\s*status:\s*(architecture_draft|implemented_unfrozen)/.test(phases),
  'phase_3_7 status is architecture_draft or implemented_unfrozen (not frozen)'
);
ok(!/phase_3_7:\s*\n\s*name:\s*"Hardening, Validation & Repository Architecture"\s*\n\s*status:\s*frozen/.test(phases),
  'phase_3_7 is not frozen');
ok(phases.includes('conceptual_roadmap_slot: "3.9"') || phases.includes("conceptual_roadmap_slot: '3.9'"),
  'phase_3_7 maps conceptual 3.9');

const ownership = read('architecture/ownership.yml');
ok(ownership.includes('hardening_repository:'), 'ownership maps hardening_repository');
ok(ownership.includes('architecture/hardening-repository.yml'), 'ownership lists hardening contract path');

const verification = read('architecture/verification.yml');
ok(verification.includes('CHECK-015'), 'verification registers CHECK-015');
ok(verification.includes('test-phase37-hardening-governance.mjs'), 'CHECK-015 points at this suite');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
