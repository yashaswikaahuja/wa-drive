// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Store Tests (Phase 2.2, Issue #86)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Tests validation logic, scope resolution priority, and record shaping.
// Does NOT require a live database — tests pure functions only.
//
// Run: node extension-dev/tests/test-knowledge-store.mjs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// We can't directly import knowledge-store.js because it imports db.js which
// requires DATABASE_URL. Instead, we inline the pure validation + scope logic
// that the store uses (same code, tested in isolation).

const VALID_KINDS = [
  'field_mapping', 'synonym', 'option_translation', 'component_adapter',
  'fill_rule', 'derivation_rule', 'validation_rule', 'portal_definition',
  'experience', 'correction', 'capability_reference',
];
const VALID_STATUSES = ['draft', 'active', 'validated', 'deprecated', 'superseded'];
const VALID_ORIGINS = ['manual', 'learned', 'derived', 'imported', 'ai_generated', 'correction'];
const VALID_LEVELS = ['portal_form', 'portal', 'organization', 'country', 'global'];

function validateRecord(record) {
  const errors = [];
  if (!record.kind || !VALID_KINDS.includes(record.kind))
    errors.push(`Invalid kind: ${record.kind}`);
  if (!record.scope || !VALID_LEVELS.includes(record.scope?.level))
    errors.push(`Invalid scope.level: ${record.scope?.level}`);
  if (record.scope?.level === 'portal_form' && (!record.scope.portal_id || !record.scope.form_key))
    errors.push('portal_form scope requires portal_id and form_key');
  if (record.scope?.level === 'portal' && !record.scope.portal_id)
    errors.push('portal scope requires portal_id');
  if (record.scope?.level === 'organization' && !record.scope.organization_id)
    errors.push('organization scope requires organization_id');
  if (record.scope?.level === 'country' && !record.scope.country)
    errors.push('country scope requires country');
  if (record.confidence != null && (record.confidence < 0 || record.confidence > 1))
    errors.push(`confidence must be 0.0–1.0, got ${record.confidence}`);
  if (!record.source?.origin || !VALID_ORIGINS.includes(record.source.origin))
    errors.push(`Invalid source.origin: ${record.source?.origin}`);
  if (!record.payload || typeof record.payload !== 'object')
    errors.push('payload is required and must be an object');
  return errors;
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

// ── Validation tests ────────────────────────────────────────────────

console.log('\n── Validation: valid records ──');

assert(validateRecord({
  kind: 'field_mapping',
  scope: { level: 'global' },
  confidence: 0.9,
  source: { origin: 'manual' },
  payload: { field_label: 'Name', semantic_key: 'name', profile_key: 'name' },
}).length === 0, 'valid global field_mapping passes');

assert(validateRecord({
  kind: 'synonym',
  scope: { level: 'country', country: 'IN' },
  confidence: 0.95,
  source: { origin: 'imported' },
  payload: { canonical: 'father_name', variants: ['pita_ka_naam'] },
}).length === 0, 'valid country synonym passes');

assert(validateRecord({
  kind: 'component_adapter',
  scope: { level: 'portal', portal_id: 'serviceonline.bihar.gov.in' },
  confidence: 0.8,
  source: { origin: 'learned' },
  payload: { component_class: 'ng-select', detection: {}, interaction: { trigger_selector: '.ng-select', option_selector: '.ng-option' } },
}).length === 0, 'valid portal component_adapter passes');

assert(validateRecord({
  kind: 'portal_definition',
  scope: { level: 'portal_form', portal_id: 'serviceonline.bihar.gov.in', form_key: 'caste_cert' },
  confidence: 0.99,
  source: { origin: 'manual' },
  payload: { hostname: 'serviceonline.bihar.gov.in', display_name: 'ServicePlus Bihar' },
}).length === 0, 'valid portal_form portal_definition passes');

assert(validateRecord({
  kind: 'experience',
  scope: { level: 'organization', organization_id: '11111111-1111-1111-1111-111111111111' },
  confidence: 1.0,
  source: { origin: 'derived' },
  payload: { session_id: 's1', portal_id: 'x', form_key: 'y', profile_id: '22222222-2222-2222-2222-222222222222', outcome: 'success' },
}).length === 0, 'valid organization experience passes');

// ── Validation: invalid records ─────────────────────────────────────

console.log('\n── Validation: invalid records ──');

let errs;

errs = validateRecord({ kind: 'bogus', scope: { level: 'global' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs[0].includes('kind'), 'rejects invalid kind');

errs = validateRecord({ kind: 'synonym', scope: { level: 'bogus_level' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('scope')), 'rejects invalid scope.level');

errs = validateRecord({ kind: 'synonym', scope: { level: 'portal_form' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('portal_id')), 'portal_form requires portal_id and form_key');

errs = validateRecord({ kind: 'synonym', scope: { level: 'portal' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('portal_id')), 'portal requires portal_id');

errs = validateRecord({ kind: 'synonym', scope: { level: 'organization' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('organization_id')), 'organization requires organization_id');

errs = validateRecord({ kind: 'synonym', scope: { level: 'country' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('country')), 'country requires country code');

errs = validateRecord({ kind: 'synonym', scope: { level: 'global' }, confidence: 1.5, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('confidence')), 'rejects confidence > 1');

errs = validateRecord({ kind: 'synonym', scope: { level: 'global' }, confidence: -0.1, source: { origin: 'manual' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('confidence')), 'rejects confidence < 0');

errs = validateRecord({ kind: 'synonym', scope: { level: 'global' }, confidence: 0.5, source: { origin: 'magic' }, payload: {} });
assert(errs.length > 0 && errs.some(e => e.includes('origin')), 'rejects invalid source.origin');

errs = validateRecord({ kind: 'synonym', scope: { level: 'global' }, confidence: 0.5, source: { origin: 'manual' }, payload: null });
assert(errs.length > 0 && errs.some(e => e.includes('payload')), 'rejects null payload');

errs = validateRecord({ kind: 'synonym', scope: { level: 'global' }, confidence: 0.5, source: { origin: 'manual' } });
assert(errs.length > 0 && errs.some(e => e.includes('payload')), 'rejects missing payload');

// ── Scope priority tests (using simple sorting logic) ───────────────

console.log('\n── Scope priority ──');

const SCOPE_PRIORITY = { portal_form: 5, portal: 4, organization: 3, country: 2, global: 1 };

function sortByScope(records) {
  return [...records].sort((a, b) => {
    const pa = SCOPE_PRIORITY[a.scope.level] || 0;
    const pb = SCOPE_PRIORITY[b.scope.level] || 0;
    if (pb !== pa) return pb - pa;
    return b.confidence - a.confidence;
  });
}

const candidates = [
  { scope: { level: 'global' }, confidence: 0.99 },
  { scope: { level: 'country' }, confidence: 0.8 },
  { scope: { level: 'portal' }, confidence: 0.7 },
  { scope: { level: 'portal_form' }, confidence: 0.6 },
  { scope: { level: 'organization' }, confidence: 0.85 },
];

const sorted = sortByScope(candidates);
assert(sorted[0].scope.level === 'portal_form', 'portal_form wins (narrowest)');
assert(sorted[1].scope.level === 'portal', 'portal is second');
assert(sorted[2].scope.level === 'organization', 'organization is third');
assert(sorted[3].scope.level === 'country', 'country is fourth');
assert(sorted[4].scope.level === 'global', 'global is last (broadest)');

// Same scope: confidence breaks tie
const sameScopeCandidates = [
  { scope: { level: 'portal' }, confidence: 0.6 },
  { scope: { level: 'portal' }, confidence: 0.95 },
  { scope: { level: 'portal' }, confidence: 0.8 },
];
const sortedSame = sortByScope(sameScopeCandidates);
assert(sortedSame[0].confidence === 0.95, 'within same scope, highest confidence wins');
assert(sortedSame[1].confidence === 0.8, 'second highest confidence next');
assert(sortedSame[2].confidence === 0.6, 'lowest confidence last');

// ── All kinds valid ─────────────────────────────────────────────────

console.log('\n── All 11 kinds accepted ──');

const allKinds = [
  'field_mapping', 'synonym', 'option_translation', 'component_adapter',
  'fill_rule', 'derivation_rule', 'validation_rule', 'portal_definition',
  'experience', 'correction', 'capability_reference',
];

for (const kind of allKinds) {
  const e = validateRecord({ kind, scope: { level: 'global' }, confidence: 0.5, source: { origin: 'manual' }, payload: {} });
  assert(!e.some(x => x.includes('kind')), `kind '${kind}' is accepted`);
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
