// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Scope Resolution Engine (Phase 2.3, Issue #87)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Selects the correct knowledge record based on scope and precedence.
// Deterministic, explainable, and server-side only.
//
// Precedence (narrowest wins):
//   portal_form (5) > portal (4) > organization (3) > country (2) > global (1)
//
// Within same scope level:
//   1. Higher confidence wins
//   2. More recent updated_at wins
//   3. validated > active > draft
//
// Features:
//   - Deterministic resolution with explanation metadata
//   - Conflict detection when multiple records tie
//   - Inheritance: broader scope provides defaults when narrower is partial
//   - Runtime overrides via session context
//   - Batch resolution for fill-time efficiency
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { pool } from '../db/db.js';
import { ensureKnowledgeSchema } from './knowledge-store.js';

// ── Scope hierarchy ─────────────────────────────────────────────────

const SCOPE_LEVELS = ['global', 'country', 'organization', 'portal', 'portal_form'];
const SCOPE_PRIORITY = { portal_form: 5, portal: 4, organization: 3, country: 2, global: 1 };
const STATUS_PRIORITY = { validated: 3, active: 2, draft: 1, deprecated: 0, superseded: 0 };

// ── Resolution context ──────────────────────────────────────────────

/**
 * @typedef {Object} ResolutionContext
 * @property {string} kind - Knowledge record kind to resolve
 * @property {string} [portal_id] - Portal hostname
 * @property {string} [form_key] - Form identifier
 * @property {string} [organization_id] - Workspace/org UUID
 * @property {string} [country] - ISO 3166-1 alpha-2
 * @property {string} [semantic_key] - Specific field/entity to resolve
 * @property {Object} [overrides] - Runtime session overrides (highest priority)
 */

/**
 * @typedef {Object} ResolutionResult
 * @property {Object|null} record - The winning record (or null)
 * @property {Object} explanation - Why this record was chosen
 * @property {Object[]} [conflicts] - Tied records (if ambiguous)
 * @property {Object} [inherited] - Fields inherited from broader scopes
 */

// ── Core resolver ───────────────────────────────────────────────────

/**
 * Resolve a single knowledge record for a given context.
 * Returns the best match with full explanation metadata.
 */
export async function resolveOne(context) {
  const { candidates, explanation } = await fetchCandidates(context);

  if (!candidates.length) {
    return {
      record: null,
      explanation: { ...explanation, outcome: 'no_match', reason: 'No records found for this context' },
      conflicts: [],
      inherited: null,
    };
  }

  // Apply runtime overrides first
  if (context.overrides) {
    const override = findOverride(candidates, context.overrides);
    if (override) {
      return {
        record: override,
        explanation: { ...explanation, outcome: 'override', reason: 'Runtime override matched', source: 'session' },
        conflicts: [],
        inherited: null,
      };
    }
  }

  // Rank candidates
  const ranked = rankCandidates(candidates);
  const winner = ranked[0];

  // Detect conflicts (multiple records tied at same effective rank)
  const conflicts = detectConflicts(ranked);

  // Compute inheritance (merge broader scope defaults into narrower)
  const inherited = computeInheritance(ranked, winner);

  // Build explanation
  const resultExplanation = {
    ...explanation,
    outcome: conflicts.length ? 'resolved_with_conflicts' : 'resolved',
    reason: buildReason(winner, ranked),
    winner_scope: winner.scope_level,
    winner_confidence: parseFloat(winner.confidence),
    candidates_evaluated: candidates.length,
    scopes_checked: [...new Set(candidates.map(c => c.scope_level))],
  };

  return {
    record: formatRecord(winner),
    explanation: resultExplanation,
    conflicts: conflicts.map(formatRecord),
    inherited,
  };
}

/**
 * Resolve ALL matching records for a kind in a context (de-duplicated).
 * Used at fill-time to get all field_mappings for a form.
 */
export async function resolveAll(context) {
  const { candidates, explanation } = await fetchCandidates(context);
  if (!candidates.length) {
    return { records: [], explanation: { ...explanation, outcome: 'no_match' }, conflicts: [] };
  }

  // Group by semantic key (or component_class, or canonical)
  const groups = groupByEntity(candidates);
  const results = [];
  const allConflicts = [];

  for (const [key, group] of Object.entries(groups)) {
    const ranked = rankCandidates(group);
    const winner = ranked[0];
    const conflicts = detectConflicts(ranked);

    if (conflicts.length) allConflicts.push({ key, conflicts: conflicts.map(formatRecord) });
    results.push(formatRecord(winner));
  }

  return {
    records: results,
    explanation: {
      ...explanation,
      outcome: allConflicts.length ? 'resolved_with_conflicts' : 'resolved',
      records_resolved: results.length,
      candidates_evaluated: candidates.length,
      conflict_count: allConflicts.length,
    },
    conflicts: allConflicts,
  };
}

/**
 * Resolve with full inheritance chain visible.
 * Returns the effective record after merging broader scope defaults.
 */
export async function resolveWithInheritance(context) {
  const result = await resolveOne(context);
  if (!result.record) return result;

  // Fetch broader scope records for the same entity
  const { candidates } = await fetchCandidates({
    ...context,
    // Don't filter by portal_id/form_key for broader scope lookup
  });

  const byLevel = {};
  for (const c of candidates) {
    const key = entityKey(c);
    if (key === entityKey(result.record)) {
      if (!byLevel[c.scope_level] || parseFloat(c.confidence) > parseFloat(byLevel[c.scope_level].confidence)) {
        byLevel[c.scope_level] = c;
      }
    }
  }

  // Build inheritance chain from broadest to narrowest
  const chain = SCOPE_LEVELS
    .filter(level => byLevel[level])
    .map(level => ({ level, record: formatRecord(byLevel[level]) }));

  return {
    ...result,
    inheritance_chain: chain,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

async function fetchCandidates(context) {
  await ensureKnowledgeSchema();
  const { kind, portal_id, form_key, organization_id, country, semantic_key } = context;

  if (!kind) throw new Error('kind is required for resolution');

  const explanation = {
    kind,
    context: { portal_id, form_key, organization_id, country, semantic_key },
    resolved_at: new Date().toISOString(),
  };

  // Build query to fetch all possible candidates
  const conditions = [
    `kind = $1`,
    `status IN ('active','validated')`,
    `(expires_at IS NULL OR expires_at > now())`,
  ];
  const params = [kind];
  let paramIdx = 1;

  // Scope matching: include records that could apply to this context
  const scopeConditions = [`scope_level = 'global'`];

  if (country) {
    scopeConditions.push(`(scope_level = 'country' AND scope_country = $${++paramIdx})`);
    params.push(country);
  }
  if (organization_id) {
    scopeConditions.push(`(scope_level = 'organization' AND scope_org_id = $${++paramIdx})`);
    params.push(organization_id);
  }
  if (portal_id) {
    scopeConditions.push(`(scope_level = 'portal' AND scope_portal_id = $${++paramIdx})`);
    params.push(portal_id);
  }
  if (portal_id && form_key) {
    scopeConditions.push(`(scope_level = 'portal_form' AND scope_portal_id = $${++paramIdx} AND scope_form_key = $${++paramIdx})`);
    params.push(portal_id, form_key);
  }

  conditions.push(`(${scopeConditions.join(' OR ')})`);

  // Optional: filter by semantic key in payload
  if (semantic_key) {
    conditions.push(`(payload->>'semantic_key' = $${++paramIdx} OR payload->>'canonical' = $${++paramIdx} OR payload->>'component_class' = $${++paramIdx})`);
    params.push(semantic_key, semantic_key, semantic_key);
  }

  const sql = `SELECT * FROM knowledge_records WHERE ${conditions.join(' AND ')}`;
  const { rows } = await pool.query(sql, params);

  return { candidates: rows, explanation };
}

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    // 1. Scope priority (narrower wins)
    const scopeDiff = (SCOPE_PRIORITY[b.scope_level] || 0) - (SCOPE_PRIORITY[a.scope_level] || 0);
    if (scopeDiff !== 0) return scopeDiff;

    // 2. Confidence (higher wins)
    const confDiff = parseFloat(b.confidence) - parseFloat(a.confidence);
    if (Math.abs(confDiff) > 0.001) return confDiff;

    // 3. Status priority (validated > active > draft)
    const statusDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (statusDiff !== 0) return statusDiff;

    // 4. Recency (newer wins)
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

function detectConflicts(ranked) {
  if (ranked.length < 2) return [];
  const winner = ranked[0];
  const conflicts = [];

  for (let i = 1; i < ranked.length; i++) {
    const candidate = ranked[i];
    // A conflict exists if same scope level AND same confidence (within tolerance)
    if (candidate.scope_level === winner.scope_level &&
        Math.abs(parseFloat(candidate.confidence) - parseFloat(winner.confidence)) < 0.01 &&
        candidate.status === winner.status) {
      conflicts.push(candidate);
    } else {
      break; // sorted, so no more ties possible
    }
  }
  return conflicts;
}

function computeInheritance(ranked, winner) {
  // Find the broadest scope record that isn't the winner
  const broader = ranked.filter(r =>
    r.id !== winner.id &&
    (SCOPE_PRIORITY[r.scope_level] || 0) < (SCOPE_PRIORITY[winner.scope_level] || 0)
  );

  if (!broader.length) return null;

  // Merge payload fields from broader scopes that winner doesn't have
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

function findOverride(candidates, overrides) {
  // Override keys match payload semantic_key/canonical/component_class
  for (const candidate of candidates) {
    const key = entityKey(candidate);
    if (key && overrides[key]) return candidate;
  }
  return null;
}

function groupByEntity(candidates) {
  const groups = {};
  for (const c of candidates) {
    const key = entityKey(c) || c.id;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return groups;
}

function entityKey(record) {
  const p = record.payload || {};
  return p.semantic_key || p.canonical || p.component_class || p.capability_name || p.hostname || null;
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

function formatRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    lineage_id: row.lineage_id,
    status: row.status,
    scope: {
      level: row.scope_level,
      portal_id: row.scope_portal_id,
      form_key: row.scope_form_key,
      organization_id: row.scope_org_id,
      country: row.scope_country,
    },
    confidence: parseFloat(row.confidence),
    source: {
      origin: row.source_origin,
      actor: row.source_actor,
      evidence_ref: row.source_evidence_ref,
      created_at: row.created_at?.toISOString?.() || row.created_at,
      updated_at: row.updated_at?.toISOString?.() || row.updated_at,
    },
    tags: row.tags || [],
    supersedes: row.supersedes,
    expires_at: row.expires_at?.toISOString?.() || row.expires_at || null,
    payload: row.payload,
  };
}

// ── Exported pure functions for testing ─────────────────────────────

export { rankCandidates, detectConflicts, computeInheritance, buildReason, SCOPE_PRIORITY, STATUS_PRIORITY };
