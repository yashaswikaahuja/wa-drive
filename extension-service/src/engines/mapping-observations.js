import { mutateDoc, KEYS } from '../db/store.js';

const MAX_OBSERVATIONS_PER_FORM = 1000;

function normalizeResult(status) {
  return status === 'succeeded' ? 'filled' : status;
}

/**
 * Build diagnostic mapping observations from server-private plan metadata and
 * the public ExecutionObservation. Values, selectors, elements, and private
 * binding IDs are deliberately not accepted or copied.
 */
export function buildMappingObservationEntries(session, observation, persistentSessionId = null) {
  const progressById = new Map((session.steps || []).map(step => [step.step_id, step]));
  return (observation.steps || []).map(result => {
    const progress = progressById.get(result.step_id) || {};
    return {
      fillSessionId: session.session_id,
      persistentSessionId,
      planId: observation.plan_id,
      observationId: observation.observation_id,
      documentId: session.document_id,
      snapshotId: session.snapshot_id,
      stepId: result.step_id,
      observedAt: observation.observed_at,
      label: progress.label || null,
      semanticKey: progress.semantic_key || null,
      profileKey: progress.profile_key || null,
      contextId: progress.context_id || null,
      nodeId: progress.node_id || null,
      actionOp: progress.action_op || null,
      transformation: progress.transformation || null,
      mappingRecordId: progress.knowledge_record_id || null,
      mappingLineageId: progress.mapping_lineage_id || null,
      mappingVersion: progress.mapping_version || null,
      mappingSource: progress.mapping_source || null,
      mappingStatus: progress.mapping_status || null,
      mappingConfidence: progress.mapping_confidence ?? null,
      mappingScope: progress.mapping_scope || null,
      mappingDisposition: progress.mapping_disposition || null,
      mappingMatchedPattern: progress.mapping_matched_pattern || null,
      mappingMatchScore: progress.mapping_match_score ?? null,
      mappingMatchPatterns: Array.isArray(progress.mapping_match_patterns)
        ? progress.mapping_match_patterns.slice(0, 50)
        : [],
      result: normalizeResult(result.status),
      failureReason: result.failure_code || null,
      postconditionMet: result.postcondition_met ?? null,
      durationMs: result.duration_ms ?? 0,
      source: 'observed-server-plan',
    };
  });
}

/** Merge observations into reserved per-form metadata without touching fields. */
export function applyMappingObservations(all, { formKey, hostname, observedAt, entries }) {
  const form = all[formKey] || {};
  const observations = Array.isArray(form._observations) ? form._observations : [];
  const seen = new Set(observations.map(item => `${item.observationId}:${item.stepId}`));
  let inserted = 0;

  for (const entry of entries) {
    const identity = `${entry.observationId}:${entry.stepId}`;
    if (seen.has(identity)) continue;
    observations.push(entry);
    seen.add(identity);
    inserted++;
  }

  form._meta = {
    ...(form._meta || {}),
    hostname: form._meta?.hostname || hostname || null,
    firstObserved: form._meta?.firstObserved || observedAt,
    lastObserved: observedAt,
  };
  form._observations = observations.slice(-MAX_OBSERVATIONS_PER_FORM);
  all[formKey] = form;
  return inserted;
}

export async function persistMappingObservations({ session, observation, persistentSessionId }) {
  const formKey = session.metadata?.form_key;
  if (!formKey) return { persisted: false, count: 0, reason: 'missing_form_key' };

  const entries = buildMappingObservationEntries(session, observation, persistentSessionId);
  if (!entries.length) return { persisted: false, count: 0, reason: 'no_step_observations' };

  let inserted = 0;
  await mutateDoc(KEYS.MAPPINGS, (all) => {
    inserted = applyMappingObservations(all, {
      formKey,
      hostname: session.metadata?.portal_id || null,
      observedAt: observation.observed_at,
      entries,
    });
    return all;
  });

  return { persisted: true, count: inserted, duplicate: inserted === 0 };
}
