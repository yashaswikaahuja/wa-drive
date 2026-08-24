import { pool } from '@cybercontrol/svc-knowledge/db-adapter';
import { persistMappingObservations } from '@cybercontrol/svc-knowledge';
import { recordSuccessfulExecution, recordFailedExecution } from '@cybercontrol/svc-learning';
import { getSession } from './fill-session.js';

export function buildRecords(session, observation) {
  const progressById = new Map((session.steps || []).map(step => [step.step_id, step]));
  const identity = {
    fillSessionId: session.session_id,
    planId: observation.plan_id,
    correlationId: observation.correlation_id,
    snapshotId: session.snapshot_id,
    documentId: session.document_id,
    observationId: observation.observation_id,
  };

  if (!observation.steps?.length) {
    return [{
      ...identity,
      label: 'Action plan',
      type: 'plan',
      value: '',
      source: 'server-plan',
      result: observation.outcome,
      failReason: observation.rejection_reason || null,
      durationMs: 0,
    }];
  }

  return observation.steps.map(result => {
    const progress = progressById.get(result.step_id) || {};
    return {
      ...identity,
      stepId: result.step_id,
      contextId: progress.context_id || null,
      nodeId: progress.node_id || null,
      label: progress.label || progress.semantic_key || progress.node_id || result.step_id,
      type: progress.action_op || 'unknown',
      value: '',
      source: 'server-plan',
      semanticKey: progress.semantic_key || null,
      profileKey: progress.profile_key || null,
      knowledgeRecordId: progress.knowledge_record_id || null,
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
      transformation: progress.transformation || null,
      result: result.status === 'succeeded' ? 'filled' : result.status,
      failReason: result.failure_code || null,
      postconditionMet: result.postcondition_met,
      observedValueState: result.observed_value_state || null,
      durationMs: result.duration_ms || 0,
    };
  });
}

async function recordLearning(session, observation, context) {
  const resultById = new Map((observation.steps || []).map(step => [step.step_id, step]));
  const updates = [];
  for (const progress of session.steps || []) {
    if (!progress.knowledge_record_id) continue;
    const result = resultById.get(progress.step_id);
    if (!result || result.status === 'skipped') continue;
    if (result.status === 'succeeded' && result.postcondition_met === true) {
      updates.push(recordSuccessfulExecution(progress.knowledge_record_id, {
        sessionId: session.session_id,
        workspaceId: context.workspaceId,
        userId: context.userId,
        stepId: progress.step_id,
        nodeId: progress.node_id,
      }));
    } else if (result.status === 'failed') {
      updates.push(recordFailedExecution(progress.knowledge_record_id, {
        reason: result.failure_code || 'gateway_error',
        errorType: result.failure_code || 'gateway_error',
        field: progress.semantic_key || progress.label || progress.node_id,
      }, {
        sessionId: session.session_id,
        workspaceId: context.workspaceId,
        userId: context.userId,
      }));
    }
  }
  const settled = await Promise.allSettled(updates);
  return {
    attempted: updates.length,
    succeeded: settled.filter(item => item.status === 'fulfilled').length,
    failed: settled.filter(item => item.status === 'rejected').length,
  };
}

async function journalMappings(session, observation, persistentSessionId) {
  try {
    return await persistMappingObservations({ session, observation, persistentSessionId });
  } catch (error) {
    console.error('[execution-evidence] mapping observation persistence failed:', error.message);
    return { persisted: false, count: 0, error: error.message };
  }
}

export async function persistExecutionEvidence({ sessionId, observation, workspaceId, userId, runtimeVersion = 'unknown' }) {
  const session = getSession(sessionId);
  const noLearning = { attempted: 0, succeeded: 0, failed: 0 };
  if (!session) {
    return {
      persisted: false,
      persistentSessionId: null,
      learning: noLearning,
      mappingObservations: { persisted: false, count: 0, reason: 'session_not_found' },
    };
  }

  const duplicate = await pool.query(
    `SELECT id FROM sessions WHERE workspace_id = $1 AND records @> $2::jsonb LIMIT 1`,
    [workspaceId, JSON.stringify([{ observationId: observation.observation_id }])]
  );
  if (duplicate.rows.length) {
    const persistentSessionId = duplicate.rows[0].id;
    const mappingObservations = await journalMappings(session, observation, persistentSessionId);
    return {
      persisted: true,
      persistentSessionId,
      duplicate: true,
      learning: noLearning,
      mappingObservations,
    };
  }

  const records = buildRecords(session, observation);
  const totalFilled = records.filter(record => record.result === 'filled').length;
  const totalFailed = records.filter(record => ['failed', 'aborted', 'rejected'].includes(record.result)).length;
  const profileId = session.metadata?.profile_id || null;

  const { rows } = await pool.query(
    `INSERT INTO sessions
      (workspace_id, user_id, profile_id, hostname, semantic_form_key, runtime_version,
       schema_version, total_filled, total_failed, records, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,'3.0.0',$7,$8,$9::jsonb,now())
     RETURNING id`,
    [
      workspaceId,
      userId,
      profileId,
      session.metadata?.portal_id || null,
      session.metadata?.form_key || null,
      runtimeVersion,
      totalFilled,
      totalFailed,
      JSON.stringify(records),
    ]
  );

  const persistentSessionId = rows[0].id;
  const [learning, mappingObservations] = await Promise.all([
    recordLearning(session, observation, { workspaceId, userId }),
    journalMappings(session, observation, persistentSessionId),
  ]);
  return {
    persisted: true,
    persistentSessionId,
    duplicate: false,
    learning,
    mappingObservations,
  };
}
