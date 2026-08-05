// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scope Resolution Engine Tests (Phase 2.3, Issue #87)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Tests the pure ranking, conflict detection, inheritance, and explanation
// logic without requiring a live database.
//
// Run: node extension-dev/tests/test-scope-resolver.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Pure functions from scope-resolver.js (inlined for DB-free testing)

const SCOPE_PRIORITY = { portal_form: 5, portal: 4, organization: 3, country: 2, global: 1 };
const STATUS_PRIORITY = { validated: 3, active: 2, draft: 1, deprecated: 0, superseded: 0 };

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const scopeDiff = (SCOPE_PRIORITY[b.scope_level] || 0) - (SCOPE_PRIORITY[a.scope_level] || 0);
    if (scopeDiff !== 0) return scopeDiff;
    const confDiff = parseFloat(b.confidence) - parseFloat(a.confidence);
    if (Math.abs(confDiff) > 0.001) return confDiff;
    const statusDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

function detectConflicts(ranked) {
  if (ranked.length < 2) return [];
  const winner = ranked[0];
  const conflicts = [];
  for (let i = 1; i < ranked.length; i++) {
    const candidate = ranked[i];
    if (candidate.scope_level === winner.scope_level &&
        Math.abs(parseFloat(candidate.confidence) - parseFloat(winner.confidence)) < 0.01 &&
        candidate.status === winner.status) {
      conflicts.push(candidate);
    } else {
      break;
    }
  }
  return conflicts;
}

function computeInheritance(ranked, winner) {
  const broader = ranked.filter(r =>
    r.id !== winner.id &&
    (SCOPE_PRIORITY[r.scope_level] || 0) < (SCOPE_PRIORITY[winner.scope_level] || 0)
  );
  if (!broader.length) return null;
  const inherited = {};
  for (const record of broader) {
    const payload = record.payload || {};
    for (const [key, value] of Object.entries(payload)) {
      if (!(key in (winner.payload || {})) && !(key in inherited)) {
        inherited[key] = { value, from_scope: record.scope_level, from_id: record.id };
      }
    }
  }
  return Object.keys(inherited).length ? inherited : null;
}

function buildReason(winner, ranked) {
  const level = winner.scope_level;
  const conf = parseFloat(winner.confidence);
  if (ranked.length === 1) {
    return `Only matching record (scope: ${level}, confidence: ${conf})`;
  }
  const nextLevel = ranked[1]?.scope_level;
  if (nextLevel !== level) {
    return `Narrowest scope wins: ${level} (priority ${SCOPE_PRIORITY[level]}) over ${nextLevel} (priority ${SCOPE_PRIORITY[nextLevel]})`;
  }
  return `Highest confidence at scope ${level}: ${conf} vs ${parseFloat(ranked[1].confidence)}`;
}

// ── Test harness ────────────────────────────────────────────────────

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

// ── Ranking: scope priority ─────────────────────────────────────────

console.log('\n── Ranking: scope priority ──');

const scopeCandidates = [
  { id: 'g1', scope_level: 'global', confidence: '0.99', status: 'validated', updated_at: '2026-01-01', payload: {} },
  { id: 'c1', scope_level: 'country', confidence: '0.80', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'p1', scope_level: 'portal', confidence: '0.70', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'pf1', scope_level: 'portal_form', confidence: '0.60', status: 'draft', updated_at: '2026-01-01', payload: {} },
  { id: 'o1', scope_level: 'organization', confidence: '0.85', status: 'validated', updated_at: '2026-01-01', payload: {} },
];

const ranked = rankCandidates(scopeCandidates);
assert(ranked[0].id === 'pf1', 'portal_form wins regardless of lower confidence');
assert(ranked[1].id === 'p1', 'portal is second');
assert(ranked[2].id === 'o1', 'organization is third');
assert(ranked[3].id === 'c1', 'country is fourth');
assert(ranked[4].id === 'g1', 'global is last even with highest confidence');

// ── Ranking: confidence breaks ties within scope ────────────────────

console.log('\n── Ranking: confidence tiebreaker ──');

const confidenceCandidates = [
  { id: 'a', scope_level: 'portal', confidence: '0.60', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'b', scope_level: 'portal', confidence: '0.95', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'c', scope_level: 'portal', confidence: '0.80', status: 'active', updated_at: '2026-01-01', payload: {} },
];

const rankedConf = rankCandidates(confidenceCandidates);
assert(rankedConf[0].id === 'b', 'highest confidence wins within same scope');
assert(rankedConf[1].id === 'c', '0.80 second');
assert(rankedConf[2].id === 'a', '0.60 last');

// ── Ranking: status breaks ties at same scope+confidence ────────────

console.log('\n── Ranking: status tiebreaker ──');

const statusCandidates = [
  { id: 'draft', scope_level: 'portal', confidence: '0.90', status: 'draft', updated_at: '2026-01-01', payload: {} },
  { id: 'active', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'validated', scope_level: 'portal', confidence: '0.90', status: 'validated', updated_at: '2026-01-01', payload: {} },
];

const rankedStatus = rankCandidates(statusCandidates);
assert(rankedStatus[0].id === 'validated', 'validated beats active at same confidence');
assert(rankedStatus[1].id === 'active', 'active beats draft');
assert(rankedStatus[2].id === 'draft', 'draft is last');

// ── Ranking: recency breaks final ties ──────────────────────────────

console.log('\n── Ranking: recency tiebreaker ──');

const recencyCandidates = [
  { id: 'old', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'new', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-08-01', payload: {} },
];

const rankedRecent = rankCandidates(recencyCandidates);
assert(rankedRecent[0].id === 'new', 'newer record wins at same scope+confidence+status');

// ── Conflict detection ──────────────────────────────────────────────

console.log('\n── Conflict detection ──');

const noConflict = [
  { id: 'a', scope_level: 'portal', confidence: '0.95', status: 'active', payload: {} },
  { id: 'b', scope_level: 'global', confidence: '0.99', status: 'active', payload: {} },
];
assert(detectConflicts(rankCandidates(noConflict)).length === 0, 'different scopes = no conflict');

const hasConflict = [
  { id: 'a', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-08-01', payload: {} },
  { id: 'b', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-07-01', payload: {} },
];
const rankedConflict = rankCandidates(hasConflict);
const conflicts = detectConflicts(rankedConflict);
assert(conflicts.length === 1, 'same scope + same confidence + same status = conflict');
assert(conflicts[0].id === 'b', 'conflict is the losing record');

const almostConflict = [
  { id: 'a', scope_level: 'portal', confidence: '0.90', status: 'active', updated_at: '2026-08-01', payload: {} },
  { id: 'b', scope_level: 'portal', confidence: '0.85', status: 'active', updated_at: '2026-07-01', payload: {} },
];
assert(detectConflicts(rankCandidates(almostConflict)).length === 0, 'confidence diff > 0.01 = no conflict');

// ── Inheritance ─────────────────────────────────────────────────────

console.log('\n── Inheritance ──');

const inheritanceCandidates = [
  {
    id: 'pf', scope_level: 'portal_form', confidence: '0.9', status: 'active', updated_at: '2026-01-01',
    payload: { semantic_key: 'district', profile_key: 'district', field_type: 'select' }
  },
  {
    id: 'g', scope_level: 'global', confidence: '0.8', status: 'active', updated_at: '2026-01-01',
    payload: { semantic_key: 'district', match_patterns: ['jila', 'district_name'], default_timeout: 3000 }
  },
];

const rankedInherit = rankCandidates(inheritanceCandidates);
const winner = rankedInherit[0]; // portal_form
const inherited = computeInheritance(rankedInherit, winner);
assert(inherited !== null, 'inheritance is computed from broader scope');
assert(inherited.match_patterns !== undefined, 'match_patterns inherited from global (not in portal_form payload)');
assert(inherited.match_patterns.from_scope === 'global', 'inherited field tracks source scope');
assert(inherited.default_timeout !== undefined, 'default_timeout also inherited');
assert(!inherited.semantic_key, 'semantic_key NOT inherited (winner already has it)');
assert(!inherited.profile_key, 'profile_key NOT inherited (winner already has it)');

// No inheritance when winner is the broadest
const onlyGlobal = [
  { id: 'g', scope_level: 'global', confidence: '0.8', status: 'active', updated_at: '2026-01-01', payload: { x: 1 } },
];
const rankedGlobal = rankCandidates(onlyGlobal);
const noInherit = computeInheritance(rankedGlobal, rankedGlobal[0]);
assert(noInherit === null, 'no inheritance when only global scope present');

// ── Explanation building ────────────────────────────────────────────

console.log('\n── Explanation ──');

const singleRecord = [
  { id: 'a', scope_level: 'portal', confidence: '0.85', status: 'active', payload: {} },
];
assert(buildReason(singleRecord[0], singleRecord).includes('Only matching'), 'single record explains itself');

const scopeWin = rankCandidates([
  { id: 'a', scope_level: 'portal_form', confidence: '0.5', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'b', scope_level: 'global', confidence: '0.99', status: 'active', updated_at: '2026-01-01', payload: {} },
]);
assert(buildReason(scopeWin[0], scopeWin).includes('Narrowest scope wins'), 'explains scope-based win');

const confWin = rankCandidates([
  { id: 'a', scope_level: 'portal', confidence: '0.95', status: 'active', updated_at: '2026-01-01', payload: {} },
  { id: 'b', scope_level: 'portal', confidence: '0.60', status: 'active', updated_at: '2026-01-01', payload: {} },
]);
assert(buildReason(confWin[0], confWin).includes('Highest confidence'), 'explains confidence-based win');

// ── Fallback: global provides answer when no narrow scope exists ────

console.log('\n── Fallback behavior ──');

const fallbackOnly = [
  { id: 'g1', scope_level: 'global', confidence: '0.7', status: 'active', updated_at: '2026-01-01', payload: { semantic_key: 'name' } },
];
const fallbackRanked = rankCandidates(fallbackOnly);
assert(fallbackRanked[0].id === 'g1', 'global record is returned when no narrower scope matches');
assert(detectConflicts(fallbackRanked).length === 0, 'single global = no conflict');

// ── Mixed scenario: form-specific overrides global ──────────────────

console.log('\n── Full resolution scenario ──');

const fullScenario = [
  { id: 'global_name', scope_level: 'global', confidence: '0.95', status: 'validated', updated_at: '2026-01-01',
    payload: { semantic_key: 'name', profile_key: 'name', match_patterns: ['naam', 'candidate_name'] } },
  { id: 'country_name', scope_level: 'country', confidence: '0.90', status: 'active', updated_at: '2026-03-01',
    payload: { semantic_key: 'name', match_patterns: ['pratyashi_ka_naam', 'applicant_name_english'] } },
  { id: 'portal_name', scope_level: 'portal', confidence: '0.85', status: 'active', updated_at: '2026-06-01',
    payload: { semantic_key: 'name', profile_key: 'name', field_type: 'text' } },
];

const fullRanked = rankCandidates(fullScenario);
assert(fullRanked[0].id === 'portal_name', 'portal-level record wins in full scenario');

const fullInherited = computeInheritance(fullRanked, fullRanked[0]);
assert(fullInherited !== null, 'inherits from broader scopes');
assert(fullInherited.match_patterns !== undefined, 'match_patterns inherited (portal record lacks it)');
// First broader record with match_patterns is country
assert(fullInherited.match_patterns.from_scope === 'country', 'match_patterns comes from country (narrowest broader)');

// ── Deprecated/superseded excluded ──────────────────────────────────

console.log('\n── Status filtering (simulated) ──');

// In production, deprecated/superseded are excluded by the SQL query.
// Here we verify rank puts them last.
const withDeprecated = [
  { id: 'dep', scope_level: 'portal', confidence: '0.99', status: 'deprecated', updated_at: '2026-08-01', payload: {} },
  { id: 'active', scope_level: 'global', confidence: '0.50', status: 'active', updated_at: '2026-01-01', payload: {} },
];
const rankedDep = rankCandidates(withDeprecated);
// Scope still wins (portal > global), but in production the deprecated would not be in candidates
assert(rankedDep[0].id === 'dep', 'deprecated still ranks by scope (filtered at query time)');

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
