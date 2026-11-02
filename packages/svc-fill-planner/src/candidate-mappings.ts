/**
 * Ephemeral candidate-mapping hand-off (issue #351).
 *
 * Semantic Mapper candidates are request-scoped. They must not be promoted
 * to active knowledge here. Stored knowledge still wins when it already
 * mapped a node. AI selectors are ignored; binding is snapshot node_id only.
 */

const REJECT_CONFIDENCE = 0.3;
const PROFILE_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/i;

export const CANDIDATE_CODES = Object.freeze({
  MISSING_NODE: 'missing_node',
  STALE_SNAPSHOT: 'stale_snapshot',
  NOT_ELIGIBLE: 'not_eligible',
  SCOPE_MISMATCH: 'scope_mismatch',
  REJECT: 'reject',
  LOW_CONFIDENCE: 'low_confidence',
  INVALID_PROFILE_KEY: 'invalid_profile_key',
  NO_PROFILE_KEY: 'no_profile_key',
  UNMAPPABLE: 'unmappable',
  NEEDS_CONFIRMATION: 'needs_confirmation',
});

export function isAllowedProfileKey(key: any) {
  if (!key || typeof key !== 'string') return false;
  const k = key.trim();
  if (!PROFILE_KEY_RE.test(k)) return false;
  if (/[#.\[\]>=:]/.test(k)) return false;
  return true;
}

function asList(value: any) {
  return Array.isArray(value) ? value : [];
}

function nodeOf(snapshot: any, nodeId: any) {
  const nodes = snapshot && snapshot.nodes;
  if (!nodes || !nodeId) return null;
  return nodes[nodeId] || null;
}

function defaultEligible(node: any) {
  if (!node) return false;
  if (node.state && (node.state.hidden === true || node.state.visible === false || node.state.enabled === false)) {
    return false;
  }
  const affordances = node.affordances || [];
  return affordances.some((a: any) => ['type_text', 'select_one', 'select_many', 'toggle', 'upload'].includes(a));
}

function scopeMismatch(candidate: any, scope: any) {
  const cs = candidate && candidate.scope;
  if (!cs || !scope) return false;
  if (cs.portal_id && scope.portal_id && String(cs.portal_id) !== String(scope.portal_id)) return true;
  if (cs.form_key && scope.form_key && String(cs.form_key) !== String(scope.form_key)) return true;
  return false;
}

function normalizeDisposition(candidate: any) {
  if (candidate && (candidate.human_confirmed === true || candidate.disposition === 'confirmed')) {
    return 'confirmed';
  }
  const d = String((candidate && candidate.disposition) || '').toLowerCase();
  if (d === 'auto_accept' || d === 'needs_confirmation' || d === 'reject') return d;
  if (candidate && candidate.needsHumanConfirmation) return 'needs_confirmation';
  return 'needs_confirmation';
}

/**
 * Validate mapper/operator candidates against the current snapshot.
 * Confirmed candidates (subsequent pass) may enter the plan. Cold-start
 * needs_confirmation never becomes a fill action on this request.
 */
export function validateCandidateMappings({
  snapshot,
  scope,
  candidates,
  confirmed,
  isNodeEligible,
}: any = {}) {
  const eligible = typeof isNodeEligible === 'function' ? isNodeEligible : defaultEligible;
  const byNode = new Map();

  for (const raw of asList(candidates)) {
    if (!raw || !raw.node_id) continue;
    byNode.set(String(raw.node_id), { ...raw, node_id: String(raw.node_id) });
  }
  for (const raw of asList(confirmed)) {
    if (!raw || !raw.node_id) continue;
    const nodeId = String(raw.node_id);
    byNode.set(nodeId, {
      ...raw,
      node_id: nodeId,
      human_confirmed: true,
      disposition: raw.disposition === 'reject' ? 'reject' : 'confirmed',
    });
  }

  const accepted: any[] = [];
  const confirmation_required: any[] = [];
  const rejected: any[] = [];

  for (const candidate of byNode.values()) {
    const nodeId = candidate.node_id;
    if (candidate.snapshot_id && snapshot && snapshot.snapshot_id
      && String(candidate.snapshot_id) !== String(snapshot.snapshot_id)) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.STALE_SNAPSHOT, reason: 'candidate snapshot_id does not match the current snapshot' });
      continue;
    }
    const node = nodeOf(snapshot, nodeId);
    if (!node) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.MISSING_NODE, reason: 'node_id is not in the current snapshot' });
      continue;
    }
    if (!eligible(node)) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.NOT_ELIGIBLE, reason: 'node is not eligible for fill' });
      continue;
    }
    if (scopeMismatch(candidate, scope)) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.SCOPE_MISMATCH, reason: 'candidate scope does not match the current form' });
      continue;
    }

    const disposition = normalizeDisposition(candidate);
    const confidence = Number(candidate.confidence);
    const score = Number.isFinite(confidence) ? confidence : 0;

    if (disposition === 'reject') {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.REJECT, reason: 'mapper disposition is reject' });
      continue;
    }
    if (score < REJECT_CONFIDENCE) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.LOW_CONFIDENCE, reason: 'confidence below reject threshold' });
      continue;
    }
    if (!candidate.profile_key) {
      rejected.push({
        node_id: nodeId,
        code: disposition === 'auto_accept' ? CANDIDATE_CODES.UNMAPPABLE : CANDIDATE_CODES.NO_PROFILE_KEY,
        reason: 'candidate has no profile_key',
      });
      continue;
    }
    if (!isAllowedProfileKey(candidate.profile_key)) {
      rejected.push({ node_id: nodeId, code: CANDIDATE_CODES.INVALID_PROFILE_KEY, reason: 'profile_key is not an allowed schema key' });
      continue;
    }

    const item = {
      node_id: nodeId,
      profile_key: String(candidate.profile_key).trim(),
      semantic_key: candidate.semantic_key || null,
      transformation: candidate.transformation || 'direct',
      confidence: score,
      disposition,
      needsHumanConfirmation: disposition !== 'confirmed' && disposition !== 'auto_accept',
      knowledgeRecordId: candidate.knowledgeRecordId || null,
      reasoning: candidate.reasoning || '',
      field_label: candidate.field_label || candidate.label || null,
      human_confirmed: disposition === 'confirmed',
    };

    if (disposition === 'confirmed') {
      accepted.push(item);
      continue;
    }
    if (disposition === 'auto_accept' && candidate.needsHumanConfirmation !== true) {
      accepted.push({ ...item, needsHumanConfirmation: false });
      continue;
    }

    confirmation_required.push({ ...item, disposition: 'needs_confirmation', needsHumanConfirmation: true });
  }

  return { accepted, confirmation_required, rejected };
}

export function toConfirmationItems(candidates: any) {
  return asList(candidates).map((c: any) => ({
    node_id: c.node_id,
    profile_key: c.profile_key || null,
    semantic_key: c.semantic_key || null,
    confidence: c.confidence,
    disposition: 'needs_confirmation',
    knowledgeRecordId: c.knowledgeRecordId || null,
    field_label: c.field_label || null,
    reasoning: c.reasoning || '',
  }));
}

/**
 * Fold accepted ephemeral candidates into an existing mapping result.
 * Stored mappings keep the node. Candidates never write knowledge.
 */
export function applyEphemeralCandidates(snapshot: any, profile: any, result: any, accepted: any) {
  if (!result) return result;
  const mappings = Array.isArray(result.mappings) ? result.mappings : [];
  const unmapped = Array.isArray(result.unmapped) ? result.unmapped.slice() : [];
  const mappedIds = new Set(mappings.map((m: any) => m.node_id));
  const unmappedSet = new Set(unmapped);

  for (const cand of asList(accepted)) {
    if (!cand || !cand.node_id || mappedIds.has(cand.node_id)) continue;
    if (!unmappedSet.has(cand.node_id)) continue;
    const node = nodeOf(snapshot, cand.node_id);
    if (!node) continue;
    const entry = profile ? profile[cand.profile_key] : null;
    const value = entry == null ? null : (String(entry.value ?? entry ?? '').trim() || null);
    mappings.push({
      node_id: cand.node_id,
      context_id: node.context_id,
      semantic_key: cand.semantic_key || cand.profile_key,
      profile_key: cand.profile_key,
      value,
      classification: 'PROFILE_DATA',
      transformation: cand.transformation || 'direct',
      ephemeral: true,
      mapping_record: {
        id: cand.knowledgeRecordId || `ephemeral:${cand.node_id}`,
        status: 'draft',
        source: { origin: 'ephemeral_candidate' },
        payload: {
          semantic_key: cand.semantic_key || cand.profile_key,
          profile_key: cand.profile_key,
          transformation: cand.transformation || 'direct',
          field_label: cand.field_label || null,
        },
      },
    });
    mappedIds.add(cand.node_id);
    unmappedSet.delete(cand.node_id);
  }

  result.mappings = mappings;
  result.unmapped = unmapped.filter((id: any) => unmappedSet.has(id));
  return result;
}
