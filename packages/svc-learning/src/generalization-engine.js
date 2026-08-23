// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Generalization Engine — extension-service/generalization-engine.js
// Phase 5.2 — Learning Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Cross-user knowledge promotion: when multiple operators produce
// consistent mappings, promote scope level.
//
// Scope promotion path:
//   portal_form → portal → organization → country → global
//
// Design principles (D11):
//   - Evidence-based promotion only
//   - Requires minimum N successful fills from distinct operators
//   - Aggregates evidence across workspaces
//   - No single-percentage threshold — multi-evidence decision
//   - Consistent mappings from multiple operators → promote scope
//   - Any inconsistency resets promotion candidate status
//
// Does NOT own: Knowledge CRUD (delegates to knowledge-store),
//   per-record confidence (delegates to confidence-manager),
//   AI calls, fill execution.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import * as knowledgeStore from '../../svc-knowledge/src/index.js';
import { getConfidenceState, checkBlockers } from './confidence-manager.js';

// ── Configuration ───────────────────────────────────────────────────

/**
 * Default minimum number of successful fills before scope promotion is considered.
 * Configurable per deployment.
 */
const DEFAULT_MIN_SUCCESSFUL_FILLS = 5;

/**
 * Minimum number of distinct operators who must produce consistent results
 * before cross-user promotion occurs.
 */
const DEFAULT_MIN_DISTINCT_OPERATORS = 2;

/**
 * Minimum consistency ratio (matching results / total results) for promotion.
 * Must be very high — inconsistency means we cannot generalize.
 */
const MIN_CONSISTENCY_RATIO = 0.9;

/**
 * Maximum age (in days) for evidence to be considered "recent" enough for promotion.
 */
const EVIDENCE_MAX_AGE_DAYS = 90;

/**
 * Scope promotion path — each level can promote to the next broader level.
 */
const SCOPE_PROMOTION_PATH = ['portal_form', 'portal', 'organization', 'country', 'global'];

// ── Evidence Aggregation ────────────────────────────────────────────

/**
 * @typedef {object} EvidenceRecord
 * @property {string} recordId — Knowledge record ID
 * @property {string} operator — Operator/user who produced this evidence
 * @property {string} workspaceId — Workspace where evidence was collected
 * @property {string} semanticKey — The semantic mapping key
 * @property {string} profileKey — The profile key mapped to
 * @property {string} kind — Knowledge kind
 * @property {string} scopeLevel — Current scope level
 * @property {object} scopeContext — Full scope details
 * @property {number} successfulFills — Number of successful fills
 * @property {number} totalFills — Total fill attempts
 * @property {boolean} verified — Whether verification has passed
 * @property {number} confidence — Current confidence
 * @property {string} lastUsedAt — Last usage timestamp
 */

/**
 * In-memory evidence store for cross-user aggregation.
 * Keyed by a canonical grouping key (kind + semantic_key + scope_level + scope_context).
 *
 * @type {Map<string, EvidenceRecord[]>}
 */
const evidenceStore = new Map();

// ── Evidence Collection ─────────────────────────────────────────────

/**
 * Submit evidence that a knowledge record was used successfully.
 * Called after successful fill execution.
 *
 * @param {object} params
 * @param {string} params.recordId — Knowledge record ID
 * @param {string} params.operator — User/operator ID
 * @param {string} params.workspaceId — Workspace ID
 * @param {string} params.semanticKey — Field semantic key
 * @param {string} params.profileKey — Profile key mapped
 * @param {string} params.kind — Knowledge record kind
 * @param {object} params.scope — Scope details { level, portal_id, form_key, organization_id, country }
 * @param {number} params.successfulFills — Successful fills count
 * @param {number} params.totalFills — Total fills count
 * @param {boolean} params.verified — Verification status
 * @param {number} params.confidence — Current confidence score
 */
export function submitEvidence(params) {
  const groupKey = buildGroupKey(params);

  if (!evidenceStore.has(groupKey)) {
    evidenceStore.set(groupKey, []);
  }

  const records = evidenceStore.get(groupKey);

  // Update or add evidence for this operator/workspace combo
  const existingIdx = records.findIndex(
    r => r.operator === params.operator && r.workspaceId === params.workspaceId
  );

  const evidence = {
    recordId: params.recordId,
    operator: params.operator,
    workspaceId: params.workspaceId,
    semanticKey: params.semanticKey,
    profileKey: params.profileKey,
    kind: params.kind,
    scopeLevel: params.scope.level,
    scopeContext: { ...params.scope },
    successfulFills: params.successfulFills || 0,
    totalFills: params.totalFills || 0,
    verified: params.verified || false,
    confidence: params.confidence || 0.5,
    lastUsedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    records[existingIdx] = evidence;
  } else {
    records.push(evidence);
  }
}

/**
 * Build a canonical group key for evidence aggregation.
 * Records with the same group key are compared for consistency.
 */
function buildGroupKey(params) {
  const parts = [
    params.kind,
    params.semanticKey,
    params.scope.level,
  ];

  // Add scope context based on level
  switch (params.scope.level) {
    case 'portal_form':
      parts.push(params.scope.portal_id || '', params.scope.form_key || '');
      break;
    case 'portal':
      parts.push(params.scope.portal_id || '');
      break;
    case 'organization':
      parts.push(params.scope.organization_id || '');
      break;
    case 'country':
      parts.push(params.scope.country || '');
      break;
    case 'global':
      // No additional context
      break;
  }

  return parts.join('::');
}

// ── Promotion Evaluation ────────────────────────────────────────────

/**
 * @typedef {object} PromotionCandidate
 * @property {string} groupKey — Evidence group key
 * @property {string} kind — Knowledge kind
 * @property {string} semanticKey — Semantic key being promoted
 * @property {string} profileKey — Consistent profile key
 * @property {string} currentScope — Current scope level
 * @property {string} targetScope — Target (broader) scope level
 * @property {number} distinctOperators — Number of distinct operators
 * @property {number} totalSuccessfulFills — Aggregate successful fills
 * @property {number} consistencyRatio — How consistent the evidence is
 * @property {boolean} eligible — Whether promotion criteria are met
 * @property {string[]} blockers — Reasons promotion is blocked
 */

/**
 * Evaluate all evidence groups for promotion candidates.
 * Returns a list of knowledge records eligible for scope promotion.
 *
 * @param {object} [options]
 * @param {number} [options.minSuccessfulFills] — Override default minimum fills
 * @param {number} [options.minDistinctOperators] — Override default minimum operators
 * @returns {PromotionCandidate[]}
 */
export function evaluatePromotionCandidates(options = {}) {
  const minFills = options.minSuccessfulFills || DEFAULT_MIN_SUCCESSFUL_FILLS;
  const minOperators = options.minDistinctOperators || DEFAULT_MIN_DISTINCT_OPERATORS;
  const candidates = [];

  for (const [groupKey, evidenceRecords] of evidenceStore) {
    const candidate = evaluateGroup(groupKey, evidenceRecords, { minFills, minOperators });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * Evaluate a single evidence group for promotion eligibility.
 *
 * @param {string} groupKey
 * @param {EvidenceRecord[]} evidenceRecords
 * @param {object} thresholds
 * @returns {PromotionCandidate|null}
 */
function evaluateGroup(groupKey, evidenceRecords, thresholds) {
  if (!evidenceRecords || evidenceRecords.length === 0) return null;

  const blockers = [];
  const now = Date.now();
  const maxAgeMs = EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  // Filter to recent evidence only
  const recentEvidence = evidenceRecords.filter(r => {
    if (!r.lastUsedAt) return false;
    const age = now - new Date(r.lastUsedAt).getTime();
    return age <= maxAgeMs;
  });

  if (recentEvidence.length === 0) return null;

  // Extract core info from first record
  const representative = recentEvidence[0];
  const kind = representative.kind;
  const semanticKey = representative.semanticKey;
  const currentScope = representative.scopeLevel;

  // Determine target scope
  const targetScope = getNextBroaderScope(currentScope);
  if (!targetScope) {
    // Already at global scope — cannot promote further
    return null;
  }

  // Count distinct operators
  const distinctOperators = new Set(recentEvidence.map(r => r.operator));

  // Count distinct workspaces
  const distinctWorkspaces = new Set(recentEvidence.map(r => r.workspaceId));

  // Aggregate successful fills
  const totalSuccessfulFills = recentEvidence.reduce(
    (sum, r) => sum + (r.successfulFills || 0), 0
  );

  // Check consistency — all evidence must map to the same profile key
  const profileKeys = recentEvidence.map(r => r.profileKey).filter(Boolean);
  const uniqueProfileKeys = new Set(profileKeys);
  const consistencyRatio = uniqueProfileKeys.size === 1 ? 1.0 :
    profileKeys.length === 0 ? 0 :
    Math.max(...[...uniqueProfileKeys].map(
      pk => profileKeys.filter(p => p === pk).length
    )) / profileKeys.length;

  const dominantProfileKey = getMostCommonValue(profileKeys);

  // ── Check promotion criteria ────────────────────────────────────

  // 1. Minimum successful fills
  if (totalSuccessfulFills < thresholds.minFills) {
    blockers.push(
      `insufficient_fills: Need ${thresholds.minFills}, have ${totalSuccessfulFills}`
    );
  }

  // 2. Minimum distinct operators
  if (distinctOperators.size < thresholds.minOperators) {
    blockers.push(
      `insufficient_operators: Need ${thresholds.minOperators}, have ${distinctOperators.size}`
    );
  }

  // 3. Consistency requirement
  if (consistencyRatio < MIN_CONSISTENCY_RATIO) {
    blockers.push(
      `inconsistent_mappings: Consistency ${(consistencyRatio * 100).toFixed(1)}% < ${(MIN_CONSISTENCY_RATIO * 100).toFixed(1)}%`
    );
  }

  // 4. All evidence must have passed verification (for org+ promotions)
  if (shouldRequireVerification(targetScope)) {
    const unverified = recentEvidence.filter(r => !r.verified);
    if (unverified.length > 0) {
      blockers.push(
        `unverified_evidence: ${unverified.length} of ${recentEvidence.length} records unverified`
      );
    }
  }

  // 5. Check confidence-manager blockers for all source records
  for (const evidence of recentEvidence) {
    const blockCheck = checkBlockers(evidence.recordId);
    if (blockCheck.blocked) {
      blockers.push(
        `record_blocked: ${evidence.recordId} has blockers: ${blockCheck.reasons.join(', ')}`
      );
      break; // One blocked record is enough to block promotion
    }
  }

  // 6. For country/global promotion, require evidence from multiple workspaces
  if (targetScope === 'country' || targetScope === 'global') {
    if (distinctWorkspaces.size < 2) {
      blockers.push(
        `single_workspace: Need evidence from multiple workspaces for ${targetScope} scope`
      );
    }
  }

  return {
    groupKey,
    kind,
    semanticKey,
    profileKey: dominantProfileKey,
    currentScope,
    targetScope,
    distinctOperators: distinctOperators.size,
    distinctWorkspaces: distinctWorkspaces.size,
    totalSuccessfulFills,
    consistencyRatio,
    eligible: blockers.length === 0,
    blockers,
    evidenceCount: recentEvidence.length,
  };
}

// ── Promotion Execution ─────────────────────────────────────────────

/**
 * Execute scope promotion for eligible candidates.
 * Creates a new knowledge record at the broader scope level.
 *
 * @param {PromotionCandidate} candidate
 * @param {object} [options]
 * @param {string} [options.actor] — Who is triggering the promotion
 * @returns {Promise<{ promoted: boolean, recordId: string|null, reason: string }>}
 */
export async function executePromotion(candidate, options = {}) {
  if (!candidate.eligible) {
    return {
      promoted: false,
      recordId: null,
      reason: `Not eligible: ${candidate.blockers[0]}`,
    };
  }

  // Gather evidence records for the promoted mapping
  const evidenceRecords = evidenceStore.get(candidate.groupKey) || [];
  if (evidenceRecords.length === 0) {
    return { promoted: false, recordId: null, reason: 'No evidence records found' };
  }

  // Use the highest-confidence source record as the template
  const sourceRecord = evidenceRecords.reduce(
    (best, r) => (r.confidence > best.confidence ? r : best),
    evidenceRecords[0]
  );

  // Build scope for the broader level
  const broaderScope = buildBroaderScope(candidate.targetScope, sourceRecord.scopeContext);

  // Create the promoted record
  try {
    const promotedRecord = await knowledgeStore.create({
      kind: candidate.kind,
      status: 'active',
      scope: broaderScope,
      confidence: Math.min(0.85, candidate.consistencyRatio * 0.9),
      source: {
        origin: 'learned',
        actor: options.actor || 'generalization-engine',
        evidence_ref: `generalization:${candidate.groupKey}`,
      },
      tags: ['generalized', `promoted_from_${candidate.currentScope}`],
      payload: buildPromotedPayload(candidate, evidenceRecords, sourceRecord),
    });

    return {
      promoted: true,
      recordId: promotedRecord.id,
      reason: `Promoted from ${candidate.currentScope} to ${candidate.targetScope} based on ${candidate.distinctOperators} operators, ${candidate.totalSuccessfulFills} fills`,
    };
  } catch (err) {
    return {
      promoted: false,
      recordId: null,
      reason: `Promotion failed: ${err.message}`,
    };
  }
}

/**
 * Run a full promotion cycle: evaluate candidates and execute eligible promotions.
 *
 * @param {object} [options]
 * @param {number} [options.minSuccessfulFills]
 * @param {number} [options.minDistinctOperators]
 * @param {string} [options.actor]
 * @param {number} [options.maxPromotions] — Limit promotions per cycle (default 10)
 * @returns {Promise<{ evaluated: number, promoted: number, results: object[] }>}
 */
export async function runPromotionCycle(options = {}) {
  const maxPromotions = options.maxPromotions || 10;
  const candidates = evaluatePromotionCandidates(options);
  const eligible = candidates.filter(c => c.eligible);
  const results = [];

  let promoted = 0;
  for (const candidate of eligible.slice(0, maxPromotions)) {
    const result = await executePromotion(candidate, options);
    results.push({
      candidate: {
        kind: candidate.kind,
        semanticKey: candidate.semanticKey,
        currentScope: candidate.currentScope,
        targetScope: candidate.targetScope,
      },
      ...result,
    });
    if (result.promoted) promoted++;
  }

  return {
    evaluated: candidates.length,
    eligible: eligible.length,
    promoted,
    results,
  };
}

// ── Scope Helpers ───────────────────────────────────────────────────

/**
 * Get the next broader scope level from the promotion path.
 *
 * @param {string} currentScope
 * @returns {string|null} — Next broader scope or null if already global
 */
function getNextBroaderScope(currentScope) {
  const idx = SCOPE_PROMOTION_PATH.indexOf(currentScope);
  if (idx < 0 || idx >= SCOPE_PROMOTION_PATH.length - 1) return null;
  return SCOPE_PROMOTION_PATH[idx + 1];
}

/**
 * Determine if verification is required for a given target scope.
 * Higher scopes require more evidence.
 */
function shouldRequireVerification(targetScope) {
  return targetScope === 'organization' || targetScope === 'country' || targetScope === 'global';
}

/**
 * Build scope object for the broader level, stripping narrower details.
 *
 * @param {string} targetLevel
 * @param {object} sourceScope — Original scope context
 * @returns {object} — Scope object for the broader level
 */
function buildBroaderScope(targetLevel, sourceScope) {
  const scope = { level: targetLevel };

  switch (targetLevel) {
    case 'portal':
      scope.portal_id = sourceScope.portal_id || null;
      break;
    case 'organization':
      scope.organization_id = sourceScope.organization_id || null;
      break;
    case 'country':
      scope.country = sourceScope.country || null;
      break;
    case 'global':
      // No additional scope context for global
      break;
    default:
      // portal_form shouldn't be a promotion target (it's the narrowest)
      scope.portal_id = sourceScope.portal_id || null;
      scope.form_key = sourceScope.form_key || null;
      break;
  }

  return scope;
}

/**
 * Build the payload for a promoted knowledge record.
 * Includes generalization metadata showing the evidence trail.
 */
function buildPromotedPayload(candidate, evidenceRecords, sourceRecord) {
  const payload = {
    semantic_key: candidate.semanticKey,
    profile_key: candidate.profileKey,
    transformation: 'direct', // Generalized mappings are always direct
    generalization_metadata: {
      promoted_from: candidate.currentScope,
      promoted_to: candidate.targetScope,
      evidence_summary: {
        distinct_operators: candidate.distinctOperators,
        distinct_workspaces: candidate.distinctWorkspaces,
        total_successful_fills: candidate.totalSuccessfulFills,
        consistency_ratio: candidate.consistencyRatio,
        evidence_count: candidate.evidenceCount,
      },
      source_records: evidenceRecords.map(r => ({
        recordId: r.recordId,
        operator: r.operator,
        workspaceId: r.workspaceId,
        successfulFills: r.successfulFills,
        confidence: r.confidence,
        verified: r.verified,
      })),
      promoted_at: new Date().toISOString(),
    },
    execution_stats: {
      successful_executions: candidate.totalSuccessfulFills,
      total_executions: evidenceRecords.reduce((sum, r) => sum + (r.totalFills || 0), 0),
      human_confirmed: false,
      last_executed_at: new Date().toISOString(),
    },
  };

  // Carry forward any field_label from the source record
  if (sourceRecord.semanticKey) {
    payload.field_label = sourceRecord.semanticKey;
  }

  return payload;
}

// ── Evidence Management ─────────────────────────────────────────────

/**
 * Get the current evidence summary for a specific group.
 *
 * @param {object} params — { kind, semanticKey, scope }
 * @returns {object|null}
 */
export function getEvidenceSummary(params) {
  const groupKey = buildGroupKey(params);
  const records = evidenceStore.get(groupKey);
  if (!records || records.length === 0) return null;

  const distinctOperators = new Set(records.map(r => r.operator));
  const distinctWorkspaces = new Set(records.map(r => r.workspaceId));
  const profileKeys = records.map(r => r.profileKey).filter(Boolean);
  const uniqueProfileKeys = new Set(profileKeys);

  return {
    groupKey,
    evidenceCount: records.length,
    distinctOperators: distinctOperators.size,
    distinctWorkspaces: distinctWorkspaces.size,
    totalSuccessfulFills: records.reduce((sum, r) => sum + (r.successfulFills || 0), 0),
    profileKeys: [...uniqueProfileKeys],
    dominantProfileKey: getMostCommonValue(profileKeys),
    consistencyRatio: uniqueProfileKeys.size === 1 ? 1.0 :
      profileKeys.length === 0 ? 0 :
      Math.max(...[...uniqueProfileKeys].map(
        pk => profileKeys.filter(p => p === pk).length
      )) / profileKeys.length,
    lastUpdated: records.reduce((latest, r) => {
      const t = r.lastUsedAt || '';
      return t > latest ? t : latest;
    }, ''),
  };
}

/**
 * Clear evidence for a specific group (e.g., after inconsistency detected).
 *
 * @param {string} groupKey
 */
export function clearEvidenceGroup(groupKey) {
  evidenceStore.delete(groupKey);
}

/**
 * Clear all evidence older than the configured max age.
 */
export function cleanupStaleEvidence() {
  const now = Date.now();
  const maxAgeMs = EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const [groupKey, records] of evidenceStore) {
    const fresh = records.filter(r => {
      if (!r.lastUsedAt) return false;
      return (now - new Date(r.lastUsedAt).getTime()) <= maxAgeMs;
    });

    if (fresh.length === 0) {
      evidenceStore.delete(groupKey);
    } else if (fresh.length < records.length) {
      evidenceStore.set(groupKey, fresh);
    }
  }
}

/**
 * Get all evidence groups (for diagnostics).
 *
 * @returns {Array<{ groupKey: string, count: number }>}
 */
export function listEvidenceGroups() {
  const groups = [];
  for (const [groupKey, records] of evidenceStore) {
    groups.push({ groupKey, count: records.length });
  }
  return groups;
}

// ── Inconsistency Detection ─────────────────────────────────────────

/**
 * Check a group for inconsistencies that should reset promotion progress.
 * Called when a new evidence record contradicts existing ones.
 *
 * @param {object} params — { kind, semanticKey, scope, profileKey }
 * @returns {{ inconsistent: boolean, reason: string|null }}
 */
export function checkForInconsistency(params) {
  const groupKey = buildGroupKey(params);
  const records = evidenceStore.get(groupKey);

  if (!records || records.length === 0) {
    return { inconsistent: false, reason: null };
  }

  const existingKeys = new Set(records.map(r => r.profileKey).filter(Boolean));

  // If the new evidence disagrees with existing
  if (params.profileKey && existingKeys.size > 0 && !existingKeys.has(params.profileKey)) {
    return {
      inconsistent: true,
      reason: `New mapping "${params.profileKey}" contradicts existing: ${[...existingKeys].join(', ')}`,
    };
  }

  return { inconsistent: false, reason: null };
}

/**
 * Handle an inconsistency by resetting the evidence group.
 * The conflicting evidence starts fresh — cannot be generalized until
 * operators converge again.
 *
 * @param {object} params — { kind, semanticKey, scope }
 * @param {string} reason
 */
export function handleInconsistency(params, reason) {
  const groupKey = buildGroupKey(params);
  evidenceStore.delete(groupKey);
  // The group will be rebuilt from scratch as new evidence arrives
}

// ── Utilities ───────────────────────────────────────────────────────

/**
 * Get the most common value in an array.
 * @param {string[]} arr
 * @returns {string|null}
 */
function getMostCommonValue(arr) {
  if (!arr || arr.length === 0) return null;
  const counts = {};
  let maxCount = 0;
  let maxValue = null;

  for (const val of arr) {
    counts[val] = (counts[val] || 0) + 1;
    if (counts[val] > maxCount) {
      maxCount = counts[val];
      maxValue = val;
    }
  }
  return maxValue;
}

// ── Periodic maintenance ────────────────────────────────────────────

const _cleanupInterval = setInterval(cleanupStaleEvidence, 60 * 60 * 1000); // hourly
if (_cleanupInterval.unref) _cleanupInterval.unref();

// ── Exports ─────────────────────────────────────────────────────────

export {
  DEFAULT_MIN_SUCCESSFUL_FILLS,
  DEFAULT_MIN_DISTINCT_OPERATORS,
  MIN_CONSISTENCY_RATIO,
  EVIDENCE_MAX_AGE_DAYS,
  SCOPE_PROMOTION_PATH,
  getNextBroaderScope,
  buildGroupKey,
};
