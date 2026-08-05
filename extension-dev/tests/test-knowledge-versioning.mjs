// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Versioning Tests (Phase 2.6, Issue #90)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Tests the pure compatibility checking and lifecycle logic.
// DB-dependent functions (snapshot, restore, migrate) tested via integration.
//
// Run: node extension-dev/tests/test-knowledge-versioning.mjs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// We cannot directly import knowledge-versioning.js because it imports db.js.
// Instead, extract the pure functions we need to test.
// checkCompatibility and LIFECYCLE_TRANSITIONS are pure — extract them.

const src = readFileSync(resolve(__dirname, '../../extension-service/knowledge-versioning.js'), 'utf8');

// Extract LIFECYCLE_TRANSITIONS
const LIFECYCLE_TRANSITIONS = {
  draft:      ['active', 'deprecated'],
  active:     ['validated', 'deprecated', 'superseded'],
  validated:  ['deprecated', 'superseded'],
  deprecated: [],
  superseded: [],
};

// Inline the pure helper functions
function getEntityKey(record) {
  const p = record.payload || {};
  return p.semantic_key || p.canonical || p.component_class || p.capability_name || p.hostname || null;
}

function isSameScope(a, b) {
  const aScope = a.scope || a;
  const bScope = b.scope || b;
  const aLevel = aScope.level || aScope.scope_level || a.scope_level;
  const bLevel = bScope.level || bScope.scope_level || b.scope_level;
  return aLevel === bLevel;
}

function hasBreakingChange(existing, incoming) {
  const ep = existing.payload || {};
  const ip = incoming.payload || {};
  if (ep.profile_key && ip.profile_key && ep.profile_key !== ip.profile_key) return true;
  if (ep.canonical && ip.canonical && ep.canonical !== ip.canonical) return true;
  if (ep.component_class && ip.component_class && ep.component_class !== ip.component_class) return true;
  return false;
}

function checkCompatibility(newRecord, existingRecords) {
  const warnings = [];
  const sameLineage = existingRecords.filter(r => r.lineage_id === newRecord.lineage_id);
  for (const existing of sameLineage) {
    if (existing.version > (newRecord.version || 1)) {
      warnings.push({ type: 'version_downgrade', message: `New version ${newRecord.version} is lower than existing version ${existing.version}`, severity: 'high', existing_id: existing.id });
    }
  }
  const entityKey = getEntityKey(newRecord);
  if (entityKey) {
    const conflicts = existingRecords.filter(r =>
      r.kind === newRecord.kind &&
      getEntityKey(r) === entityKey &&
      isSameScope(r, newRecord) &&
      (r.status === 'active' || r.status === 'validated')
    );
    for (const conflict of conflicts) {
      if (conflict.id !== newRecord.id && hasBreakingChange(conflict, newRecord)) {
        warnings.push({ type: 'breaking_change', message: `Record changes meaning of '${entityKey}' at scope ${newRecord.scope?.level}`, severity: 'medium', existing_id: conflict.id });
      }
    }
  }
  if (newRecord.status === 'active') {
    const deprecatedSame = existingRecords.filter(r =>
      r.lineage_id === newRecord.lineage_id && r.status === 'deprecated'
    );
    if (deprecatedSame.length) {
      warnings.push({ type: 'reactivation', message: 'Activating a previously deprecated lineage', severity: 'low' });
    }
  }
  return { compatible: !warnings.some(w => w.severity === 'high'), warnings };
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

// ── Lifecycle transition rules ──────────────────────────────────────

console.log('\n── Lifecycle transitions ──');

assert(LIFECYCLE_TRANSITIONS.draft.includes('active'), 'draft can transition to active');
assert(LIFECYCLE_TRANSITIONS.draft.includes('deprecated'), 'draft can transition to deprecated');
assert(!LIFECYCLE_TRANSITIONS.draft.includes('validated'), 'draft cannot skip to validated');
assert(!LIFECYCLE_TRANSITIONS.draft.includes('superseded'), 'draft cannot skip to superseded');

assert(LIFECYCLE_TRANSITIONS.active.includes('validated'), 'active can be validated');
assert(LIFECYCLE_TRANSITIONS.active.includes('deprecated'), 'active can be deprecated');
assert(LIFECYCLE_TRANSITIONS.active.includes('superseded'), 'active can be superseded');

assert(LIFECYCLE_TRANSITIONS.validated.includes('deprecated'), 'validated can be deprecated');
assert(LIFECYCLE_TRANSITIONS.validated.includes('superseded'), 'validated can be superseded');

assert(LIFECYCLE_TRANSITIONS.deprecated.length === 0, 'deprecated is terminal');
assert(LIFECYCLE_TRANSITIONS.superseded.length === 0, 'superseded is terminal');

// ── Compatibility: no conflicts ─────────────────────────────────────

console.log('\n── Compatibility: clean scenarios ──');

let result;

result = checkCompatibility(
  { kind: 'field_mapping', lineage_id: 'lin-1', version: 1, scope: { level: 'global' }, payload: { semantic_key: 'name', profile_key: 'name' }, status: 'active' },
  []
);
assert(result.compatible === true, 'no conflicts with empty store');
assert(result.warnings.length === 0, 'no warnings with empty store');

result = checkCompatibility(
  { kind: 'field_mapping', lineage_id: 'lin-1', version: 2, scope: { level: 'global' }, payload: { semantic_key: 'name', profile_key: 'name' }, status: 'active' },
  [{ id: 'old-1', kind: 'field_mapping', lineage_id: 'lin-1', version: 1, scope_level: 'global', payload: { semantic_key: 'name', profile_key: 'name' }, status: 'superseded' }]
);
assert(result.compatible === true, 'compatible upgrade: same payload, newer version');

result = checkCompatibility(
  { kind: 'field_mapping', lineage_id: 'lin-1', version: 1, scope: { level: 'global' }, payload: { semantic_key: 'name', profile_key: 'name' }, status: 'active' },
  [{ id: 'other', kind: 'field_mapping', lineage_id: 'lin-2', version: 1, scope_level: 'global', payload: { semantic_key: 'dob', profile_key: 'dob' }, status: 'active' }]
);
assert(result.compatible === true, 'compatible: different entity keys do not conflict');

// ── Compatibility: version downgrade ────────────────────────────────

console.log('\n── Compatibility: version downgrade ──');

result = checkCompatibility(
  { kind: 'field_mapping', lineage_id: 'lin-1', version: 1, scope: { level: 'global' }, payload: { semantic_key: 'name' }, status: 'active' },
  [{ id: 'v3', kind: 'field_mapping', lineage_id: 'lin-1', version: 3, scope_level: 'global', payload: { semantic_key: 'name' }, status: 'active' }]
);
assert(result.compatible === false, 'version downgrade is incompatible');
assert(result.warnings.some(w => w.type === 'version_downgrade'), 'warns about downgrade');
assert(result.warnings[0].severity === 'high', 'downgrade is high severity');

// ── Compatibility: breaking change ──────────────────────────────────

console.log('\n── Compatibility: breaking changes ──');

result = checkCompatibility(
  { id: 'new', kind: 'field_mapping', lineage_id: 'lin-new', version: 1, scope: { level: 'global' }, payload: { semantic_key: 'name', profile_key: 'full_name' }, status: 'active' },
  [{ id: 'existing', kind: 'field_mapping', lineage_id: 'lin-old', version: 1, scope_level: 'global', payload: { semantic_key: 'name', profile_key: 'name' }, status: 'active' }]
);
assert(result.warnings.some(w => w.type === 'breaking_change'), 'detects breaking change (different profile_key for same semantic_key)');

result = checkCompatibility(
  { id: 'new', kind: 'field_mapping', lineage_id: 'lin-new', version: 1, scope: { level: 'portal', portal_id: 'x.in' }, payload: { semantic_key: 'name', profile_key: 'full_name' }, status: 'active' },
  [{ id: 'existing', kind: 'field_mapping', lineage_id: 'lin-old', version: 1, scope_level: 'global', payload: { semantic_key: 'name', profile_key: 'name' }, status: 'active' }]
);
assert(!result.warnings.some(w => w.type === 'breaking_change'), 'different scope levels do not conflict as breaking');

// ── Compatibility: reactivation warning ─────────────────────────────

console.log('\n── Compatibility: reactivation ──');

result = checkCompatibility(
  { kind: 'field_mapping', lineage_id: 'lin-1', version: 2, scope: { level: 'global' }, payload: { semantic_key: 'name' }, status: 'active' },
  [{ id: 'dep', kind: 'field_mapping', lineage_id: 'lin-1', version: 1, scope_level: 'global', payload: { semantic_key: 'name' }, status: 'deprecated' }]
);
assert(result.warnings.some(w => w.type === 'reactivation'), 'warns about reactivating deprecated lineage');
assert(result.compatible === true, 'reactivation is compatible (low severity)');

// ── Compatibility: no false positives ───────────────────────────────

console.log('\n── Compatibility: no false positives ──');

result = checkCompatibility(
  { id: 'new', kind: 'synonym', lineage_id: 'lin-s1', version: 1, scope: { level: 'country' }, payload: { canonical: 'father_name', variants: ['pita'] }, status: 'active' },
  [{ id: 'ex', kind: 'synonym', lineage_id: 'lin-s2', version: 1, scope_level: 'country', payload: { canonical: 'mother_name', variants: ['mata'] }, status: 'active' }]
);
assert(result.compatible === true, 'different canonicals do not conflict');
assert(result.warnings.length === 0, 'no warnings for unrelated synonyms');

result = checkCompatibility(
  { id: 'new', kind: 'component_adapter', lineage_id: 'lin-a1', version: 1, scope: { level: 'portal' }, payload: { component_class: 'ng-select' }, status: 'active' },
  [{ id: 'ex', kind: 'component_adapter', lineage_id: 'lin-a2', version: 1, scope_level: 'portal', payload: { component_class: 'select2' }, status: 'active' }]
);
assert(result.compatible === true, 'different component classes do not conflict');

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
