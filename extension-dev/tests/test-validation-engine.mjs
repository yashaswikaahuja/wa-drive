// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation Engine Tests (Phase 2.4, Issue #88)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Run: node extension-dev/tests/test-validation-engine.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { validate, detectConflicts, validateTransition, VALID_TRANSITIONS } from '../../extension-service/validation-engine.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

function validBase(overrides = {}) {
  return {
    kind: 'field_mapping',
    scope: { level: 'global' },
    confidence: 0.8,
    source: { origin: 'manual' },
    payload: { field_label: 'Name', semantic_key: 'name', profile_key: 'name' },
    ...overrides,
  };
}

// ── Envelope validation ─────────────────────────────────────────────

console.log('\n── Envelope: valid records ──');

assert(validate(validBase()).valid, 'minimal valid record passes');
assert(validate(validBase({ status: 'active', version: 3, tags: ['test'] })).valid, 'record with optional fields passes');

console.log('\n── Envelope: missing fields ──');

let r;
r = validate({});
assert(!r.valid && r.errors.some(e => e.field === 'kind'), 'rejects missing kind');
r = validate({ kind: 'synonym' });
assert(!r.valid && r.errors.some(e => e.field === 'scope'), 'rejects missing scope');
r = validate({ kind: 'synonym', scope: { level: 'global' } });
assert(!r.valid && r.errors.some(e => e.field === 'source'), 'rejects missing source');
r = validate({ kind: 'synonym', scope: { level: 'global' }, source: { origin: 'manual' } });
assert(!r.valid && r.errors.some(e => e.field === 'payload'), 'rejects missing payload');

console.log('\n── Envelope: invalid values ──');

r = validate(validBase({ kind: 'bogus' }));
assert(!r.valid && r.errors.some(e => e.field === 'kind'), 'rejects invalid kind');
r = validate(validBase({ status: 'imaginary' }));
assert(!r.valid && r.errors.some(e => e.field === 'status'), 'rejects invalid status');
r = validate(validBase({ source: { origin: 'magic' } }));
assert(!r.valid && r.errors.some(e => e.field === 'source.origin'), 'rejects invalid origin');
r = validate(validBase({ payload: null }));
assert(!r.valid && r.errors.some(e => e.field === 'payload'), 'rejects null payload');
r = validate(validBase({ payload: [1,2,3] }));
assert(!r.valid && r.errors.some(e => e.field === 'payload'), 'rejects array payload');
r = validate(validBase({ version: 0 }));
assert(!r.valid && r.errors.some(e => e.field === 'version'), 'rejects version 0');
r = validate(validBase({ version: 1.5 }));
assert(!r.valid && r.errors.some(e => e.field === 'version'), 'rejects non-integer version');
r = validate(validBase({ tags: 'not-array' }));
assert(!r.valid && r.errors.some(e => e.field === 'tags'), 'rejects non-array tags');

// ── Scope validation ────────────────────────────────────────────────

console.log('\n── Scope validation ──');

r = validate(validBase({ scope: { level: 'portal_form', portal_id: 'x.gov.in', form_key: 'caste' } }));
assert(r.valid, 'portal_form with portal_id + form_key passes');
r = validate(validBase({ scope: { level: 'portal_form' } }));
assert(!r.valid && r.errors.some(e => e.field === 'scope.portal_id'), 'portal_form without portal_id fails');
r = validate(validBase({ scope: { level: 'portal_form', portal_id: 'x.gov.in' } }));
assert(!r.valid && r.errors.some(e => e.field === 'scope.form_key'), 'portal_form without form_key fails');

r = validate(validBase({ scope: { level: 'portal', portal_id: 'x.gov.in' } }));
assert(r.valid, 'portal with portal_id passes');
r = validate(validBase({ scope: { level: 'portal' } }));
assert(!r.valid, 'portal without portal_id fails');

r = validate(validBase({ scope: { level: 'organization', organization_id: '11111111-1111-1111-1111-111111111111' } }));
assert(r.valid, 'organization with org_id passes');
r = validate(validBase({ scope: { level: 'organization' } }));
assert(!r.valid, 'organization without org_id fails');

r = validate(validBase({ scope: { level: 'country', country: 'IN' } }));
assert(r.valid, 'country with valid code passes');
r = validate(validBase({ scope: { level: 'country' } }));
assert(!r.valid, 'country without code fails');
r = validate(validBase({ scope: { level: 'country', country: 'india' } }));
assert(!r.valid && r.errors.some(e => e.message.includes('ISO')), 'country with invalid format fails');

r = validate(validBase({ scope: { level: 'global' } }));
assert(r.valid, 'global requires nothing extra');

// ── Confidence validation ───────────────────────────────────────────

console.log('\n── Confidence ──');

r = validate(validBase({ confidence: 0.0 }));
assert(r.valid, 'confidence 0.0 passes');
r = validate(validBase({ confidence: 1.0 }));
assert(r.valid, 'confidence 1.0 passes');
r = validate(validBase({ confidence: -0.1 }));
assert(!r.valid, 'confidence -0.1 fails');
r = validate(validBase({ confidence: 1.1 }));
assert(!r.valid, 'confidence 1.1 fails');
r = validate(validBase({ confidence: 'high' }));
assert(!r.valid, 'confidence string fails');

// ── Lifecycle transitions ───────────────────────────────────────────

console.log('\n── Lifecycle transitions ──');

assert(validateTransition('draft', 'active').length === 0, 'draft → active allowed');
assert(validateTransition('draft', 'deprecated').length === 0, 'draft → deprecated allowed');
assert(validateTransition('active', 'validated').length === 0, 'active → validated allowed');
assert(validateTransition('active', 'superseded').length === 0, 'active → superseded allowed');
assert(validateTransition('validated', 'deprecated').length === 0, 'validated → deprecated allowed');

assert(validateTransition('draft', 'validated').length > 0, 'draft → validated NOT allowed');
assert(validateTransition('deprecated', 'active').length > 0, 'deprecated → active NOT allowed (terminal)');
assert(validateTransition('superseded', 'active').length > 0, 'superseded → active NOT allowed (terminal)');
assert(validateTransition('active', 'draft').length > 0, 'active → draft NOT allowed (no downgrade)');

assert(validateTransition('active', 'active').length === 0, 'same status transition is no-op (allowed)');

// ── Per-kind payload: field_mapping ─────────────────────────────────

console.log('\n── Payload: field_mapping ──');

r = validate(validBase());
assert(r.valid, 'complete field_mapping passes');
r = validate(validBase({ payload: { semantic_key: 'name', profile_key: 'name' } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.field_label'), 'field_mapping requires field_label');
r = validate(validBase({ payload: { field_label: 'X', profile_key: 'name' } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.semantic_key'), 'field_mapping requires semantic_key');
r = validate(validBase({ payload: { field_label: 'X', semantic_key: 'x', profile_key: 'x', field_type: 'bogus' } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.field_type'), 'field_mapping rejects invalid field_type');

// ── Per-kind payload: synonym ───────────────────────────────────────

console.log('\n── Payload: synonym ──');

r = validate(validBase({ kind: 'synonym', payload: { canonical: 'name', variants: ['naam', 'full_name'] } }));
assert(r.valid, 'valid synonym passes');
r = validate(validBase({ kind: 'synonym', payload: { variants: ['x'] } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.canonical'), 'synonym requires canonical');
r = validate(validBase({ kind: 'synonym', payload: { canonical: 'x', variants: [] } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.variants'), 'synonym requires non-empty variants');
r = validate(validBase({ kind: 'synonym', payload: { canonical: 'x', variants: [123] } }));
assert(!r.valid && r.errors.some(e => e.message.includes('strings')), 'synonym variants must be strings');

// ── Per-kind payload: component_adapter ─────────────────────────────

console.log('\n── Payload: component_adapter ──');

r = validate(validBase({ kind: 'component_adapter', payload: { component_class: 'ng-select', detection: {}, interaction: { trigger_selector: '.ng', option_selector: '.opt' } } }));
assert(r.valid, 'valid component_adapter passes');
r = validate(validBase({ kind: 'component_adapter', payload: { detection: {}, interaction: {} } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.component_class'), 'adapter requires component_class');
r = validate(validBase({ kind: 'component_adapter', payload: { component_class: 'x', detection: {}, interaction: {} } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.interaction.trigger_selector'), 'adapter requires trigger_selector');

// ── Per-kind payload: experience ────────────────────────────────────

console.log('\n── Payload: experience ──');

r = validate(validBase({ kind: 'experience', payload: { session_id: 's1', portal_id: 'x.in', form_key: 'f', profile_id: 'uuid', outcome: 'success' } }));
assert(r.valid, 'valid experience passes');
r = validate(validBase({ kind: 'experience', payload: { session_id: 's1', portal_id: 'x.in', form_key: 'f', profile_id: 'uuid', outcome: 'bogus' } }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.outcome'), 'experience rejects invalid outcome');
r = validate(validBase({ kind: 'experience', payload: {} }));
assert(!r.valid && r.errors.length >= 4, 'empty experience payload has multiple errors');

// ── Per-kind payload: correction ────────────────────────────────────

console.log('\n── Payload: correction ──');

r = validate(validBase({ kind: 'correction', payload: { target_record_id: 'uuid', target_kind: 'field_mapping', after: { profile_key: 'new' } } }));
assert(r.valid, 'valid correction passes');
r = validate(validBase({ kind: 'correction', payload: {} }));
assert(!r.valid && r.errors.some(e => e.field === 'payload.target_record_id'), 'correction requires target_record_id');

// ── Conflict detection ──────────────────────────────────────────────

console.log('\n── Conflict detection ──');

const newRecord = {
  id: 'new-1', kind: 'field_mapping', lineage_id: 'lin-1', version: 1,
  scope: { level: 'global' }, payload: { semantic_key: 'name' }, status: 'active',
};
const existingDup = {
  id: 'existing-1', kind: 'field_mapping', lineage_id: 'lin-1', version: 1,
  scope: { level: 'global' }, scope_level: 'global', payload: { semantic_key: 'name' }, status: 'active',
};
const existingDiff = {
  id: 'existing-2', kind: 'field_mapping', lineage_id: 'lin-2', version: 1,
  scope: { level: 'global' }, scope_level: 'global', payload: { semantic_key: 'dob' }, status: 'active',
};
const existingSameEntity = {
  id: 'existing-3', kind: 'field_mapping', lineage_id: 'lin-3', version: 1,
  scope: { level: 'global' }, scope_level: 'global', payload: { semantic_key: 'name' }, status: 'active',
};

let c;
c = detectConflicts(newRecord, [existingDup]);
assert(c.length > 0 && c[0].type === 'duplicate_version', 'detects duplicate version in same lineage');

c = detectConflicts(newRecord, [existingDiff]);
assert(c.length === 0, 'no conflict with different entity key');

c = detectConflicts(newRecord, [existingSameEntity]);
assert(c.length > 0 && c[0].type === 'ambiguous_scope', 'detects ambiguous scope (same kind+scope+entity)');

c = detectConflicts(newRecord, []);
assert(c.length === 0, 'no conflicts with empty existing set');

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
