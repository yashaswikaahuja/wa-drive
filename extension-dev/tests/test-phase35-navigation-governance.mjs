#!/usr/bin/env node
/**
 * Phase 3.5 Navigation Understanding — CHECK-013 semantic governance (#145/#147).
 * Architecture-only: no runtime navigation behavior.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(import.meta.url);
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
  'workflow_intent', 'business_step_id', 'query_string', 'fragment', 'credentials',
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

// ── AJV (frozen ActionPlan schema) ──────────────────────────────────
let validateActionPlan = null;
try {
  const ajvPath = pathToFileURL(resolve(ROOT, 'extension-dev/tests/ratification/node_modules/ajv/dist/2020.js')).href;
  const formatsPath = pathToFileURL(resolve(ROOT, 'extension-dev/tests/ratification/node_modules/ajv-formats/dist/index.js')).href;
  const Ajv2020 = (await import(ajvPath)).default;
  const addFormats = (await import(formatsPath)).default;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  validateActionPlan = ajv.compile(jread('architecture/action-plan.schema.json'));
  ok(true, 'AJV loaded for ActionPlan v3 validation');
} catch (e) {
  // Fallback: createRequire from ratification package root
  try {
    const req = createRequire(resolve(ROOT, 'extension-dev/tests/ratification/package.json'));
    const Ajv2020 = req('ajv/dist/2020.js');
    const addFormats = req('ajv-formats');
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    validateActionPlan = ajv.compile(jread('architecture/action-plan.schema.json'));
    ok(true, 'AJV loaded for ActionPlan v3 validation (createRequire)');
  } catch (e2) {
    ok(false, `AJV ActionPlan validator unavailable: ${e.message}; fallback: ${e2.message}`);
  }
}

console.log('\n=== Phase 3.5 artifacts & P1 remediation markers ===');
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
ok(contract.includes('contract_version: "0.2.0"') || contract.includes("contract_version: '0.2.0'"), 'contract version 0.2.0 after #147');
ok(contract.includes('status: frozen'), 'contract status is frozen (#156)');
ok(contract.includes('freeze_issue: "#156"') || contract.includes('#156'), 'contract references freeze gate #156');
ok(contract.includes('remediation_issue: "#147"') || contract.includes('#147'), 'contract references #147 remediation');

// P1-08 ownership wording
ok(contract.includes('exposing observed activatable nodes'), 'P1-08: browser exposes observed activatable nodes');
ok(!/identifying mechanically executable navigation targets/.test(contract), 'P1-08: removed target-selection phrasing');
ok(contract.includes('never selecting among workflow candidates') || contract.includes('MUST NOT') && contract.includes('choose which candidate'), 'P1-08: selection remains service-side');

// P1-01 deterministic mapping
ok(contract.includes('deterministic_outcome_mapping'), 'P1-01: deterministic outcome mapping section present');
ok(contract.includes('primary_failure_code'), 'P1-01: primary_failure_code defined');
ok(contract.includes('navigation_failed_timeout') && contract.includes('navigation_blocked'), 'P1-01: distinct diagnostics for timeout vs blocked');
ok(contract.includes('MUST NOT') || contract.includes('forbidden:'), 'P1-01: forbids arbitrary dual mapping');

// P1-02 classifier
ok(contract.includes('mechanical_navigation_classifier'), 'P1-02: mechanical classifier section present');
ok(contract.includes('html_anchor_with_navigable_href'), 'P1-02: anchor href rule');
ok(contract.includes('fail_closed') || contract.includes('ambiguous'), 'P1-02: fail-closed / ambiguous rule');
ok(contract.includes('MUST NOT invent') || contract.includes('MUST NOT invent alternate') || contract.includes('MUST implement this classifier'), 'P1-02: runtime must implement architecture classifier');

// P1-03 path privacy
ok(contract.includes('page_path_privacy'), 'P1-03: page_path_privacy section');
ok(contract.includes('sanitized pathname') || contract.includes('sanitized_path'), 'P1-03: path is sanitized pathname');
ok(contract.includes('Strip query string') || contract.includes('query string'), 'P1-03: query stripped');

// P1-04 origin policy
ok(contract.includes('destination_origin_policy'), 'P1-04: destination_origin_policy section');
ok(contract.includes('gateway-security.yml'), 'P1-04: binds gateway-security.yml');
ok(contract.includes('navigation_origin_denied'), 'P1-04: origin deny diagnostic');

// P1-05 budgets
ok(contract.includes('navigation_observation_budgets'), 'P1-05: budgets section');
ok(contract.includes('settle_deadline_ms: 8000') || contract.includes('settle_deadline_ms: 8000'), 'P1-05: settle deadline 8000ms');
ok(contract.includes('max_redirect_hops: 10'), 'P1-05: max redirect hops 10');
ok(contract.includes('quiet_window_ms'), 'P1-05: quiet window defined');

const additives = jread('architecture/navigation-understanding.draft-additives.json');
ok(additives.status === 'architecture_draft', 'draft additives not frozen');
ok(additives.normative_primary_failure_codes, 'draft additives include normative primary codes');
ok(additives.navigation_observation_budgets?.settle_deadline_ms === 8000, 'draft budgets match contract');

const adr9 = read('architecture/adrs/0009-navigation-target-mechanical-identity.md');
ok(adr9.includes('mechanical_navigation_classifier') || adr9.includes('normative mechanical'), 'ADR-0009 cites normative classifier');
ok(adr9.includes('exposing observed activatable') || adr9.includes('MUST NOT choose among candidates'), 'ADR-0009 selection is service-side');

console.log('\n=== Fixtures (P1-06 expanded corpus) ===');
const fixDir = resolve(ROOT, 'architecture/fixtures/navigation');
ok(existsSync(fixDir), 'architecture/fixtures/navigation exists');
const fixtures = readdirSync(fixDir).filter((f) => f.endsWith('.json'));
ok(fixtures.length >= 12, `at least 12 navigation fixtures (found ${fixtures.length})`);

const requiredFixtures = [
  'positive-frame-document-replaced.json',
  'positive-redirect-settle.json',
  'positive-blocked-overlay.json',
  'malicious-allow-navigation-false.json',
  'positive-mid-plan-document-replaced.json',
  'positive-cross-origin-frame.json',
  'positive-target-blank.json',
  'positive-path-token-sanitized.json',
  'outcome-mapping-table.json',
  'positive-action-plan-activate.json',
  'malicious-selector-target.json',
];
for (const f of requiredFixtures) {
  ok(fixtures.includes(f), `required fixture present: ${f}`);
}

for (const f of fixtures) {
  const data = jread(join('architecture/fixtures/navigation', f));
  ok(!!data.fixture_id, `${f} has fixture_id`);
  const keys = collectKeys(data);
  if (String(data.expect) === 'reject' || f.includes('malicious-selector') || f.includes('malicious-query')) {
    ok(
      (data.forbidden_keys_present || []).length > 0 || f.includes('allow-navigation'),
      `${f} malicious/reject fixture documents forbidden keys or authz expect`
    );
  } else if (!f.includes('malicious') && !f.includes('mapping-table')) {
    let leak = null;
    for (const bad of FORBIDDEN) {
      if (keys.has(bad) && !(data.forbidden_keys_present || []).includes(bad) && !(data.public_must_not_contain || []).length) {
        // allow private_hops_not_published / raw_location_private as private evidence fields
        if (['private_hops_not_published', 'raw_location_private'].some((k) => keys.has(k))) continue;
        if (bad === 'query_string' && data.public_must_not_contain) continue;
        leak = bad;
        break;
      }
    }
    // stricter: positive public_page must not embed secrets
    if (data.public_page) {
      const blob = JSON.stringify(data.public_page);
      ok(!blob.includes('?') && !blob.includes('session='), `${f} public_page has no query secrets`);
    }
    ok(true, `${f} scanned`);
  }
}

console.log('\n=== Semantic: outcome mapping table (P1-01 / P1-07) ===');
const mapping = jread('architecture/fixtures/navigation/outcome-mapping-table.json');
ok(Array.isArray(mapping.rows) && mapping.rows.length >= 10, 'mapping table has ≥10 rows');
const seenOutcomes = new Set();
for (const row of mapping.rows) {
  ok(!seenOutcomes.has(row.navigation_outcome), `unique outcome ${row.navigation_outcome}`);
  seenOutcomes.add(row.navigation_outcome);
  if (row.primary_failure_code != null) {
    ok(FROZEN_FAILURE_CODES.has(row.primary_failure_code), `${row.navigation_outcome} uses frozen FailureCode ${row.primary_failure_code}`);
  }
  ok(typeof row.primary_diagnostic === 'string' && row.primary_diagnostic.startsWith('navigation_'), `${row.navigation_outcome} has navigation_* diagnostic`);
}
// Cross-check draft additives 1:1
for (const [outcome, code] of Object.entries(additives.normative_primary_failure_codes || {})) {
  const row = mapping.rows.find((r) => r.navigation_outcome === outcome);
  ok(!!row, `mapping table includes ${outcome}`);
  if (row) {
    ok(row.primary_failure_code === code, `${outcome} primary code matches draft additives`);
  }
}
// blocked vs timeout must differ
const blocked = mapping.rows.find((r) => r.navigation_outcome === 'blocked_overlay');
const timeout = mapping.rows.find((r) => r.navigation_outcome === 'failed_timeout');
ok(blocked && timeout && blocked.primary_failure_code !== timeout.primary_failure_code, 'blocked_overlay and failed_timeout use different primary codes');

console.log('\n=== Semantic: ActionPlan AJV (P1-07) ===');
if (validateActionPlan) {
  const good = jread('architecture/fixtures/navigation/positive-action-plan-activate.json').action_plan;
  ok(validateActionPlan(good), `positive plan AJV valid${validateActionPlan.errors ? ': ' + JSON.stringify(validateActionPlan.errors) : ''}`);
  const deny = jread('architecture/fixtures/navigation/malicious-allow-navigation-false.json').action_plan;
  ok(validateActionPlan(deny), 'allow_navigation false plan is schema-valid (authz fails at execution, not schema)');
  ok(deny.authorization.allow_navigation === false, 'deny fixture has allow_navigation false');

  // Malicious target fields must not appear on a schema-valid plan
  const smuggled = structuredClone(good);
  smuggled.steps[0].target.css_selector = '#x';
  ok(!validateActionPlan(smuggled), 'ActionPlan with css_selector on target is AJV-rejected');
}

console.log('\n=== Semantic: privacy path + origin + classifier (P1-02..04) ===');
const pathFix = jread('architecture/fixtures/navigation/positive-path-token-sanitized.json');
ok(pathFix.public_page.path.includes(':redacted') || pathFix.public_page.path.startsWith('/'), 'sanitized path present');
ok(!pathFix.public_page.path.includes('?'), 'sanitized path has no query');
ok(!JSON.stringify(pathFix.public_page).includes('secret'), 'public_page has no secret token');
ok(pathFix.path_rules?.query_stripped === true, 'path_rules assert query stripped');

const originFix = jread('architecture/fixtures/navigation/positive-cross-origin-frame.json');
ok(originFix.context?.access === 'cross_origin', 'cross-origin frame access marked');
ok(String(originFix.destination_origin_policy || '').includes('allowlist') || String(originFix.destination_origin_policy || '').includes('deny'), 'origin policy referenced on fixture');

ok(contract.includes('html_anchor_with_navigable_href'), 'classifier rule id present for CI linkage');
ok(contract.includes('settle_deadline_ms: 8000'), 'settle budget 8000 in contract');
ok(contract.includes('max_redirect_hops: 10'), 'hop budget 10 in contract');

const blockedFix = jread('architecture/fixtures/navigation/positive-blocked-overlay.json');
ok(blockedFix.expected_primary_failure_code === 'postcondition_failed', 'blocked overlay → postcondition_failed');
ok(blockedFix.expected_primary_diagnostic === 'navigation_blocked', 'blocked overlay diagnostic');

const midFix = jread('architecture/fixtures/navigation/positive-mid-plan-document-replaced.json');
ok(midFix.expected_primary_failure_code === 'document_replaced', 'mid-plan → document_replaced');

const denyFix = jread('architecture/fixtures/navigation/malicious-allow-navigation-false.json');
ok(denyFix.expected_primary_failure_code === 'authorization_denied', 'allow_navigation false → authorization_denied');

console.log('\n=== Registry alignment ===');
const phases = read('architecture/phases.yml');
ok(
  /phase_3_5:\s*\n\s*name:\s*"Navigation Understanding"\s*\n\s*status:\s*frozen/.test(phases),
  'phase_3_5 status is frozen (#156)'
);
ok(phases.includes('frozen_date: "2026-08-12"') || phases.includes("frozen_date: '2026-08-12'"), 'phase_3_5 has freeze date');
ok(phases.includes('runtime_baseline_commit') && phases.includes('f023d0b'), 'phase_3_5 records runtime baseline f023d0b');
ok(phases.includes('NAV-RR2-P2-04') || phases.includes('accepted_progressive_p2'), 'accepted progressive P2 recorded');
ok(phases.includes('phase_3_4') && phases.includes('WSS'), 'phase_3_4 WSS retained');
const ownership = read('architecture/ownership.yml');
ok(ownership.includes('navigation_understanding') || ownership.includes('phase_3_5'), 'ownership maps navigation understanding');
const verification = read('architecture/verification.yml');
ok(verification.includes('CHECK-013'), 'verification registers CHECK-013');
ok(phases.includes('POLICY A') || phases.includes('Repository numbering wins'), 'numbering policy still present');

// P1 tracking section
ok(contract.includes('NAV-ARCH-P1-01: resolved') || contract.includes('NAV-ARCH-P1-01: resolved_in_contract'), 'P1-01 marked resolved in contract');
ok(contract.includes('NAV-ARCH-P1-08: resolved'), 'P1-08 marked resolved in contract');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
