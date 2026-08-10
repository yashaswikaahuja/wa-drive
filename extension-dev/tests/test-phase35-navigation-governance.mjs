#!/usr/bin/env node
/**
 * Phase 3.5 Navigation Understanding — architecture contract governance (#145).
 * Architecture-only: no runtime navigation behavior.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const jread = (rel) => JSON.parse(read(rel));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

const FORBIDDEN = [
  'selector', 'css_selector', 'xpath', 'outer_html', 'inner_html',
  'dom_handle', 'element_reference', 'binding_id', 'href_raw',
  'workflow_intent', 'business_step_id', 'query_string',
];

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

console.log('\n=== Phase 3.5 Navigation Understanding artifacts ===');
const required = [
  'architecture/navigation-understanding.yml',
  'architecture/navigation-understanding.draft-additives.json',
  'architecture/adrs/0008-navigation-transition-identity.md',
  'architecture/adrs/0009-navigation-target-mechanical-identity.md',
];
for (const rel of required) {
  ok(existsSync(resolve(ROOT, rel)), `${rel} exists`);
}

const contract = read('architecture/navigation-understanding.yml');
ok(contract.includes('status: architecture_draft'), 'contract is architecture_draft (not frozen)');
ok(contract.includes('phase: phase_3_5') || contract.includes('phase_3_5'), 'contract bound to phase_3_5');
ok(contract.includes('issue: "#145"') || contract.includes('#145'), 'contract references #145');
ok(contract.includes('browser_perception:') && contract.includes('extension_service:'), 'ownership split defined');
ok(contract.includes('must_not:') && contract.includes('business workflow intent'), 'browser must not own business intent');
ok(contract.includes('allow_navigation'), 'ActionPlan allow_navigation compatibility stated');
ok(contract.includes('binding_generation'), 'stale-target / generation TOCTOU referenced');
ok(contract.includes('document_replaced'), 'document_replaced semantics present');
ok(contract.includes('same_document') || contract.includes('same-document'), 'same-document navigation covered');
ok(contract.includes('redirect'), 'redirects covered');
ok(contract.includes('cross_origin') || contract.includes('cross-origin'), 'cross-origin covered');
ok(contract.includes('query_string') || contract.includes('sanitized_path'), 'URL privacy constraints present');
ok(contract.includes('WSS') || contract.includes('phase_3_4'), 'WSS compatibility noted');
ok(contract.includes('ActionPlanExecutor') || contract.includes('action_plan_executor'), 'APE is supporting, not a milestone');
ok(!contract.includes('status: frozen') || contract.includes('architecture_draft'), 'no freeze claim on this contract');

const adr8 = read('architecture/adrs/0008-navigation-transition-identity.md');
const adr9 = read('architecture/adrs/0009-navigation-target-mechanical-identity.md');
ok(adr8.includes('Proposed') || adr8.includes('architecture_draft'), 'ADR-0008 proposed (not accepted freeze)');
ok(adr9.includes('Proposed') || adr9.includes('architecture_draft'), 'ADR-0009 proposed (not accepted freeze)');
ok(adr9.includes('context_id') && adr9.includes('node_id'), 'ADR-0009 mechanical target identity');
ok(adr8.includes('document_id'), 'ADR-0008 document identity rules');

const additives = jread('architecture/navigation-understanding.draft-additives.json');
ok(additives.status === 'architecture_draft', 'draft additives not frozen');
ok(Array.isArray(additives.forbidden_even_in_draft), 'draft additives still forbid smuggling keys');
for (const k of ['selector', 'css_selector', 'xpath', 'workflow_intent']) {
  ok(additives.forbidden_even_in_draft.includes(k), `draft forbids ${k}`);
}

console.log('\n=== Fixtures ===');
const fixDir = resolve(ROOT, 'architecture/fixtures/navigation');
ok(existsSync(fixDir), 'architecture/fixtures/navigation exists');
const fixtures = readdirSync(fixDir).filter((f) => f.endsWith('.json'));
ok(fixtures.length >= 4, `at least 4 navigation fixtures (found ${fixtures.length})`);

for (const f of fixtures) {
  const data = jread(join('architecture/fixtures/navigation', f));
  ok(!!data.fixture_id, `${f} has fixture_id`);
  const keys = collectKeys(data);
  if (String(data.expect) === 'reject' || f.includes('malicious')) {
    ok(
      (data.forbidden_keys_present || []).length > 0,
      `${f} malicious fixture lists forbidden_keys_present`
    );
  } else {
    for (const bad of FORBIDDEN) {
      if (keys.has(bad) && !(data.forbidden_keys_present || []).includes(bad)) {
        ok(false, `${f} positive fixture must not contain ${bad}`);
      }
    }
    ok(true, `${f} scanned for forbidden public keys`);
  }
}

// Positive ActionPlan fragment must match frozen ActionPlan envelope shape enough for review
const planFix = jread('architecture/fixtures/navigation/positive-action-plan-activate.json');
ok(planFix.kind === 'action_plan' || planFix.schema_version === '3.0.0', 'plan fixture is ActionPlan-shaped');
ok(planFix.authorization?.allow_navigation === true, 'plan fixture allows navigation explicitly');
ok(planFix.steps?.[0]?.action?.op === 'activate', 'plan fixture uses mechanical activate');
ok(planFix.steps?.[0]?.target?.context_id && planFix.steps?.[0]?.target?.node_id, 'plan fixture public target only');
ok(!planFix.steps?.[0]?.target?.css_selector, 'plan fixture has no css_selector');

console.log('\n=== Registry alignment ===');
const phases = read('architecture/phases.yml');
ok(phases.includes('phase_3_5'), 'phases.yml mentions phase_3_5');
ok(
  /phase_3_5:[\s\S]*?status:\s*architecture_draft/.test(phases)
    || phases.includes('Navigation Understanding'),
  'phase_3_5 registered as Navigation Understanding architecture draft'
);
ok(
  /phase_3_5:\s*\n\s*name:\s*"Navigation Understanding"\s*\n\s*status:\s*architecture_draft/.test(phases),
  'phase_3_5 status is architecture_draft (not frozen)'
);
ok(phases.includes('phase_3_4') && phases.includes('WSS'), 'phase_3_4 WSS retained');

const ownership = read('architecture/ownership.yml');
ok(
  ownership.includes('navigation_understanding') || ownership.includes('phase_3_5'),
  'ownership maps navigation understanding'
);

const verification = read('architecture/verification.yml');
ok(verification.includes('CHECK-013') || verification.includes('navigation'), 'verification registers navigation contract check');

// Frozen contracts not weakened by forbidding renames
ok(phases.includes('POLICY A') || phases.includes('Repository numbering wins'), 'numbering policy still present');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
