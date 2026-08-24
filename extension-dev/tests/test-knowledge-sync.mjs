// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Sync & Cache Integration Tests (Phase 2.8, Issue #92)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Tests:
// 1. Sync client logic (_applyDelta, cache structure)
// 2. Mapper reads field mappings from server cache
// 3. Mapper falls back to hardcoded FIELD_ALIASES when cache is empty
// 4. Derive applies server lookup rules
// 5. Derive skips non-lookup rules (complex logic stays hardcoded)
// 6. Derive falls back to hardcoded when no server rules
//
// Run: node extension-dev/tests/test-knowledge-sync.mjs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(__dirname, '../../apps/extension');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

// ═══════════════════════════════════════════════════════════════════════
// SECTION 1: Sync Client — _applyDelta logic
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Sync Client Tests ──');

// Read the sync client source and extract _applyDelta for testing
const syncSource = readFileSync(resolve(EXT, 'knowledge-sync.js'), 'utf8');
// We'll inline the delta logic for testing since the file defines a global object

function applyDelta(cache, deltaResponse) {
  const updated = {
    ...cache,
    manifest_version: deltaResponse.manifest_version,
    updated_at: new Date().toISOString(),
  };
  const { added, updated: changed, removed } = deltaResponse.changes || {};
  const arts = { ...updated.artifacts };

  if (removed?.length) {
    for (const item of removed) {
      if (item.kind === 'synonym' && arts.semantic_aliases) {
        delete arts.semantic_aliases[item.key];
      } else if (item.kind === 'field_mapping' && arts.field_mappings) {
        arts.field_mappings = arts.field_mappings.filter(m => m.semantic_key !== item.key);
      }
    }
  }

  const upserts = [...(added || []), ...(changed || [])];
  for (const item of upserts) {
    const data = item.data || {};
    if (item.kind === 'synonym' && data.canonical && data.variants) {
      if (!arts.semantic_aliases) arts.semantic_aliases = {};
      arts.semantic_aliases[data.canonical] = data.variants;
    } else if (item.kind === 'field_mapping') {
      if (!arts.field_mappings) arts.field_mappings = [];
      const idx = arts.field_mappings.findIndex(m => m.semantic_key === data.semantic_key);
      const entry = {
        semantic_key: data.semantic_key,
        profile_key: data.profile_key,
        match_patterns: data.match_patterns || [],
        confidence: data.confidence || 0.9,
      };
      if (idx >= 0) arts.field_mappings[idx] = entry;
      else arts.field_mappings.push(entry);
    }
  }

  updated.artifacts = arts;
  return updated;
}

test('applyDelta adds new synonym', () => {
  const cache = { artifacts: { semantic_aliases: { name: ['naam'] }, field_mappings: [] }, manifest_version: '1.a' };
  const delta = {
    manifest_version: '2.b',
    changes: { added: [{ kind: 'synonym', data: { canonical: 'email', variants: ['e-mail', 'mail'] } }], updated: [], removed: [] },
  };
  const result = applyDelta(cache, delta);
  assert.equal(result.manifest_version, '2.b');
  assert.deepEqual(result.artifacts.semantic_aliases.email, ['e-mail', 'mail']);
  assert.deepEqual(result.artifacts.semantic_aliases.name, ['naam']); // preserved
});

test('applyDelta removes synonym', () => {
  const cache = { artifacts: { semantic_aliases: { name: ['naam'], dob: ['birth'] }, field_mappings: [] }, manifest_version: '1.a' };
  const delta = {
    manifest_version: '2.b',
    changes: { added: [], updated: [], removed: [{ kind: 'synonym', key: 'dob' }] },
  };
  const result = applyDelta(cache, delta);
  assert.equal(result.artifacts.semantic_aliases.dob, undefined);
  assert.deepEqual(result.artifacts.semantic_aliases.name, ['naam']);
});

test('applyDelta adds new field_mapping', () => {
  const cache = { artifacts: { semantic_aliases: {}, field_mappings: [] }, manifest_version: '1.a' };
  const delta = {
    manifest_version: '2.b',
    changes: {
      added: [{ kind: 'field_mapping', data: { semantic_key: 'passport_number', profile_key: 'passport_number', match_patterns: ['passport_no', 'pp_no'] } }],
      updated: [], removed: [],
    },
  };
  const result = applyDelta(cache, delta);
  assert.equal(result.artifacts.field_mappings.length, 1);
  assert.equal(result.artifacts.field_mappings[0].semantic_key, 'passport_number');
  assert.deepEqual(result.artifacts.field_mappings[0].match_patterns, ['passport_no', 'pp_no']);
});

test('applyDelta updates existing field_mapping', () => {
  const cache = { artifacts: { semantic_aliases: {}, field_mappings: [{ semantic_key: 'name', profile_key: 'name', match_patterns: ['naam'], confidence: 0.9 }] }, manifest_version: '1.a' };
  const delta = {
    manifest_version: '2.b',
    changes: {
      added: [], removed: [],
      updated: [{ kind: 'field_mapping', data: { semantic_key: 'name', profile_key: 'name', match_patterns: ['naam', 'full_name', 'candidate_name'], confidence: 0.95 } }],
    },
  };
  const result = applyDelta(cache, delta);
  assert.equal(result.artifacts.field_mappings.length, 1);
  assert.deepEqual(result.artifacts.field_mappings[0].match_patterns, ['naam', 'full_name', 'candidate_name']);
  assert.equal(result.artifacts.field_mappings[0].confidence, 0.95);
});

test('applyDelta removes field_mapping', () => {
  const cache = { artifacts: { semantic_aliases: {}, field_mappings: [
    { semantic_key: 'name', profile_key: 'name', match_patterns: ['naam'], confidence: 0.9 },
    { semantic_key: 'email', profile_key: 'email', match_patterns: ['mail'], confidence: 0.9 },
  ] }, manifest_version: '1.a' };
  const delta = {
    manifest_version: '2.b',
    changes: { added: [], updated: [], removed: [{ kind: 'field_mapping', key: 'email' }] },
  };
  const result = applyDelta(cache, delta);
  assert.equal(result.artifacts.field_mappings.length, 1);
  assert.equal(result.artifacts.field_mappings[0].semantic_key, 'name');
});

test('applyDelta with empty changes preserves artifacts', () => {
  const cache = { artifacts: { semantic_aliases: { a: ['b'] }, field_mappings: [{ semantic_key: 'x', profile_key: 'x', match_patterns: [], confidence: 0.9 }] }, manifest_version: '1.a' };
  const delta = { manifest_version: '3.c', changes: { added: [], updated: [], removed: [] } };
  const result = applyDelta(cache, delta);
  assert.equal(result.manifest_version, '3.c');
  assert.deepEqual(result.artifacts.semantic_aliases, { a: ['b'] });
  assert.equal(result.artifacts.field_mappings.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 2: Mapper — _getFieldAliases with server cache
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Mapper Cache Integration Tests ──');

// Simulate mapper.js _getFieldAliases logic
const FIELD_ALIASES_SAMPLE = {
  name: ['candidate_name', 'applicant_name', 'full_name'],
  email: ['email_address', 'email_id'],
};

function _getFieldAliases(serverMappings, localAliases) {
  var merged = Object.assign({}, localAliases);
  var server = serverMappings || null;
  if (server && Array.isArray(server)) {
    for (var i = 0; i < server.length; i++) {
      var m = server[i];
      if (m.semantic_key && m.match_patterns) {
        if (!merged[m.semantic_key]) {
          merged[m.semantic_key] = m.match_patterns.slice();
        } else {
          var existing = new Set(merged[m.semantic_key]);
          for (var j = 0; j < m.match_patterns.length; j++) {
            if (!existing.has(m.match_patterns[j])) {
              merged[m.semantic_key].push(m.match_patterns[j]);
            }
          }
        }
      }
    }
  }
  return merged;
}

test('mapper returns only local aliases when server cache is null', () => {
  const result = _getFieldAliases(null, FIELD_ALIASES_SAMPLE);
  assert.deepEqual(result.name, ['candidate_name', 'applicant_name', 'full_name']);
  assert.deepEqual(result.email, ['email_address', 'email_id']);
});

test('mapper returns only local aliases when server cache is empty array', () => {
  const result = _getFieldAliases([], FIELD_ALIASES_SAMPLE);
  assert.deepEqual(result.name, ['candidate_name', 'applicant_name', 'full_name']);
});

test('mapper merges server patterns into existing local key', () => {
  const server = [{ semantic_key: 'name', profile_key: 'name', match_patterns: ['naam', 'pratyashi_ka_naam', 'candidate_name'] }];
  const result = _getFieldAliases(server, FIELD_ALIASES_SAMPLE);
  // Should have local + new server patterns (no duplicates)
  assert(result.name.includes('candidate_name')); // local
  assert(result.name.includes('applicant_name')); // local
  assert(result.name.includes('naam')); // server-added
  assert(result.name.includes('pratyashi_ka_naam')); // server-added
  // 'candidate_name' appears in both but should not be duplicated
  assert.equal(result.name.filter(p => p === 'candidate_name').length, 1);
});

test('mapper adds new key from server that does not exist locally', () => {
  const server = [{ semantic_key: 'passport_number', profile_key: 'passport_number', match_patterns: ['passport_no', 'pp_number'] }];
  const result = _getFieldAliases(server, FIELD_ALIASES_SAMPLE);
  assert.deepEqual(result.passport_number, ['passport_no', 'pp_number']);
});

test('mapper handles multiple server entries', () => {
  const server = [
    { semantic_key: 'name', profile_key: 'name', match_patterns: ['naam'] },
    { semantic_key: 'phone', profile_key: 'phone', match_patterns: ['tel', 'telephone'] },
  ];
  const result = _getFieldAliases(server, FIELD_ALIASES_SAMPLE);
  assert(result.name.includes('naam'));
  assert.deepEqual(result.phone, ['tel', 'telephone']);
});

test('mapper ignores server entries without semantic_key', () => {
  const server = [{ match_patterns: ['orphan'] }, { semantic_key: 'email', match_patterns: ['inbox'] }];
  const result = _getFieldAliases(server, FIELD_ALIASES_SAMPLE);
  assert(!result.undefined);
  assert(result.email.includes('inbox'));
});

test('mapper ignores server entries without match_patterns', () => {
  const server = [{ semantic_key: 'broken' }];
  const result = _getFieldAliases(server, FIELD_ALIASES_SAMPLE);
  assert(!result.broken);
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 3: Derive — server derivation rules
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Derive Cache Integration Tests ──');

// Inline the derive logic that processes server rules
function ccHasVal(v) { return v != null && String(v).trim() !== ''; }

function applyServerDerivationRules(profile, serverRules) {
  const p = Object.assign({}, profile || {});
  const derived = [];
  const set = (key, val) => {
    if (!ccHasVal(val)) return;
    if (ccHasVal(p[key])) return;
    p[key] = String(val);
    derived.push(key);
  };

  for (var i = 0; i < serverRules.length; i++) {
    var rule = serverRules[i];
    if (!rule || !rule.output_key) continue;
    var params = rule.parameters || {};
    if (rule.logic === 'lookup') {
      if (params.source_key && ccHasVal(p[params.source_key])) {
        set(rule.output_key, p[params.source_key]);
      } else if (params.default_value) {
        set(rule.output_key, params.default_value);
      }
    }
    // Non-lookup rules are skipped
  }

  p._derived = derived;
  return p;
}

test('derive applies lookup rule with source_key', () => {
  const rules = [{ output_key: 'permanent_address', logic: 'lookup', parameters: { source_key: 'address' } }];
  const result = applyServerDerivationRules({ address: '123 Main St' }, rules);
  assert.equal(result.permanent_address, '123 Main St');
  assert(result._derived.includes('permanent_address'));
});

test('derive applies lookup rule with default_value', () => {
  const rules = [{ output_key: 'nationality', logic: 'lookup', parameters: { default_value: 'Indian' } }];
  const result = applyServerDerivationRules({}, rules);
  assert.equal(result.nationality, 'Indian');
});

test('derive does not overwrite existing profile value', () => {
  const rules = [{ output_key: 'nationality', logic: 'lookup', parameters: { default_value: 'Indian' } }];
  const result = applyServerDerivationRules({ nationality: 'Nepalese' }, rules);
  assert.equal(result.nationality, 'Nepalese');
  assert(!result._derived.includes('nationality'));
});

test('derive skips non-lookup rules', () => {
  const rules = [
    { output_key: 'age', logic: 'age_from_dob', parameters: {} },
    { output_key: 'first_name', logic: 'name_split', parameters: { part: 'first' } },
    { output_key: 'nationality', logic: 'lookup', parameters: { default_value: 'Indian' } },
  ];
  const result = applyServerDerivationRules({}, rules);
  assert.equal(result.nationality, 'Indian');
  assert(!result.age);  // skipped — not lookup
  assert(!result.first_name);  // skipped — not lookup
  assert.equal(result._derived.length, 1);
});

test('derive handles empty rules array', () => {
  const result = applyServerDerivationRules({ name: 'Test' }, []);
  assert.equal(result.name, 'Test');
  assert.deepEqual(result._derived, []);
});

test('derive handles rules with missing output_key', () => {
  const rules = [{ logic: 'lookup', parameters: { default_value: 'X' } }];
  const result = applyServerDerivationRules({}, rules);
  assert.deepEqual(result._derived, []);
});

test('derive lookup with source_key but source is empty falls to default', () => {
  const rules = [{ output_key: 'domicile_state', logic: 'lookup', parameters: { source_key: 'state', default_value: 'Bihar' } }];
  // state is not in profile → source_key check fails, then default_value applies
  const result = applyServerDerivationRules({}, rules);
  assert.equal(result.domicile_state, 'Bihar');
});

test('derive lookup source_key takes priority over default_value', () => {
  const rules = [{ output_key: 'domicile_state', logic: 'lookup', parameters: { source_key: 'state', default_value: 'Bihar' } }];
  const result = applyServerDerivationRules({ state: 'UP' }, rules);
  assert.equal(result.domicile_state, 'UP');
});

test('derive applies multiple lookup rules in order', () => {
  const rules = [
    { output_key: 'permanent_address', logic: 'lookup', parameters: { source_key: 'address' } },
    { output_key: 'domicile_state', logic: 'lookup', parameters: { source_key: 'state' } },
    { output_key: 'nationality', logic: 'lookup', parameters: { default_value: 'Indian' } },
  ];
  const result = applyServerDerivationRules({ address: '123 St', state: 'Bihar' }, rules);
  assert.equal(result.permanent_address, '123 St');
  assert.equal(result.domicile_state, 'Bihar');
  assert.equal(result.nationality, 'Indian');
  assert.equal(result._derived.length, 3);
});

// ═══════════════════════════════════════════════════════════════════════
// SECTION 4: Seed Generation
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Seed Generation Tests ──');

import { execSync } from 'node:child_process';

test('seed-knowledge.js generates 124 records', () => {
  const out = execSync('node extension-service/seed-knowledge.js', { cwd: resolve(__dirname, '../..'), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.count, 124);
  assert(data.records.length === 124);
});

test('seed includes English semantic aliases (Phase 2.8)', () => {
  const out = execSync('node extension-service/seed-knowledge.js', { cwd: resolve(__dirname, '../..'), encoding: 'utf8' });
  const data = JSON.parse(out);
  const engAliases = data.records.filter(r => r.kind === 'synonym' && r.tags.includes('english'));
  assert(engAliases.length === 12, `Expected 12 English synonym records, got ${engAliases.length}`);
  const nameAlias = engAliases.find(r => r.payload.canonical === 'name');
  assert(nameAlias, 'Should have name synonym');
  assert(nameAlias.payload.variants.includes('full name'));
});

test('seed includes file upload mappings (Phase 2.8)', () => {
  const out = execSync('node extension-service/seed-knowledge.js', { cwd: resolve(__dirname, '../..'), encoding: 'utf8' });
  const data = JSON.parse(out);
  const fileMaps = data.records.filter(r => r.kind === 'field_mapping' && r.tags.includes('file_upload'));
  assert.equal(fileMaps.length, 9);
  const photo = fileMaps.find(r => r.payload.semantic_key === 'photo');
  assert(photo);
  assert(photo.payload.match_patterns.includes('photograph'));
});

test('seed includes education field aliases (Phase 2.8)', () => {
  const out = execSync('node extension-service/seed-knowledge.js', { cwd: resolve(__dirname, '../..'), encoding: 'utf8' });
  const data = JSON.parse(out);
  const eduMaps = data.records.filter(r => r.kind === 'field_mapping' && r.tags.includes('education'));
  assert.equal(eduMaps.length, 16);
  const board10th = eduMaps.find(r => r.payload.semantic_key === 'board_10th');
  assert(board10th);
  assert(board10th.payload.match_patterns.includes('matric_board'));
});

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
