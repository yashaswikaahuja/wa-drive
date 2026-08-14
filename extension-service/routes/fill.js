import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { generateFillPlan, handleObservation, validateSnapshot, deriveScope } from '../fill-planner.js';
import { mapUnknownFields } from '../semantic-mapper.js';
import { persistExecutionEvidence } from '../execution-evidence.js';
import { classifyFormBehavior, isHardEvidenceType } from '../behavior-classifier.js';
import { mergeExecutionMode } from '../execution-mode.js';

const router = Router();

// ── POST /api/fill-plan ─────────────────────────────────────────────────
// Extension sends PageSnapshot + profile → server returns ActionPlan.
// Architecture: Extension = Eyes + Hands, Server = Brain + Memory + Knowledge.
router.post('/fill-plan', authMiddleware, async (req, res) => {
  const startTime = Date.now();
  try {
    const { snapshot, profileId, profile } = req.body;

    if (!snapshot) {
      return res.status(400).json({ error: 'snapshot is required' });
    }
    if (!profile || Object.keys(profile).length === 0) {
      return res.status(400).json({ error: 'profile is required and must not be empty' });
    }

    // Validate snapshot structure before planning
    const validation = validateSnapshot(snapshot);
    if (!validation.valid) {
      return res.status(422).json({
        error: 'Invalid snapshot',
        details: validation.errors,
      });
    }

    const scope = deriveScope(snapshot);

    // Generate the fill plan using server-side intelligence
    let planResult = await generateFillPlan({
      snapshot,
      workspace_id: req.user.workspaceId,
      phone: null,
      person_key: null,
      profile_overrides: profile,
      profile_id: profileId || null,
    });

    // ── Cold-start semantic mapping ─────────────────────────────────
    // If the planner found no mappings (all fields unmapped), invoke AI
    // semantic mapper to learn new field→profileKey associations.
    const unmappedCount = planResult.diagnostics?.unmapped_count || 0;

    if (unmappedCount > 0) {
      // Extract only planner-confirmed unresolved nodes for AI mapping.
      const nodes = snapshot.nodes || {};
      const unmappedNodeIds = new Set(planResult.diagnostics?.unmapped_node_ids || []);
      const unmappedFields = Object.values(nodes).filter(node => unmappedNodeIds.has(node.node_id));

      if (unmappedFields.length > 0) {
        const pageContext = {
          page_title: snapshot.page?.title || '',
          page_url: snapshot.page?.origin || '',
          form_heading: snapshot.page?.route_key || '',
          portal_id: scope.portal_id,
          form_key: scope.form_key,
          language: snapshot.page?.language || 'en',
        };

        const mapResult = await mapUnknownFields({
          fields: unmappedFields,
          pageContext,
          scope: { ...scope, organization_id: req.user.workspaceId },
          requesterId: req.user.userId,
        });

        // If AI produced mappings, retry the fill plan (new knowledge records exist)
        if (mapResult.ok && mapResult.mappings.length > 0) {
          planResult = await generateFillPlan({
            snapshot,
            workspace_id: req.user.workspaceId,
            phone: null,
            person_key: null,
            profile_overrides: profile,
            profile_id: profileId || null,
            candidate_mappings: mapResult.mappings.filter(mapping => mapping.disposition === 'auto_accept'),
          });
          // Attach semantic mapping diagnostics
          planResult.diagnostics = {
            ...planResult.diagnostics,
            semantic_mapping: {
              strategy: mapResult.strategy,
              mapped: mapResult.mappings.length,
              excluded: mapResult.excluded.length,
            },
          };
        } else {
          // Attach why semantic mapping didn't produce results
          planResult.diagnostics = {
            ...planResult.diagnostics,
            semantic_mapping: {
              strategy: mapResult.strategy,
              mapped: 0,
              excluded: mapResult.excluded?.length || 0,
              note: mapResult.strategy === 'no_ai_key' 
                ? 'No AI key configured — cannot map unknown fields'
                : mapResult.strategy === 'rate_limited'
                ? 'AI rate limited — retry later'
                : 'AI mapping produced no results',
            },
          };
        }
      }
    }

    if (!planResult.success) {
      return res.status(200).json({
        plan: null,
        classification: null,
        session: null,
        diagnostics: planResult.diagnostics,
      });
    }

    // ── Phase 4.3: Behavior classification ──────────────────────────
    // Classify static/dynamic after plan generation using snapshot topology,
    // any dom_evidence passed by the extension, and prior server knowledge.
    let classification = null;
    try {
      const domEvidence = Array.isArray(req.body.dom_evidence) ? req.body.dom_evidence : [];

      // Read prior behavior knowledge from durable store (written on observation)
      const behaviorKey = `${scope.portal_id || ''}:${scope.form_key || ''}`;
      let priorKnowledge = null;
      try {
        const { loadDoc, KEYS } = await import('../store.js');
        const allMappings = await loadDoc(KEYS.MAPPINGS);
        const formEntry = allMappings[behaviorKey] || allMappings[scope.form_key] || {};
        if (formEntry._behavior) {
          priorKnowledge = {
            behavior: formEntry._behavior.behavior || (formEntry._behavior.classification === 'DYNAMIC' ? 'dynamic' : null),
            hard_evidence_count: formEntry._behavior.hard_evidence_count || 0,
            dynamic_incidents: formEntry._behavior.hard_evidence_count || 0,
            last_dynamic_at: formEntry._behavior.last_dynamic_at || null,
          };
        }
      } catch (e) {
        console.warn('[fill-plan] prior behavior load failed:', e.message);
      }

      classification = classifyFormBehavior({
        snapshot,
        domEvidence,
        priorKnowledge,
        planSteps: planResult.plan?.steps || [],
      });

      console.log(
        `[fill-plan] classification: ${classification.system_classification} ` +
        `(effective=${classification.effective_execution_mode}, ` +
        `confidence=${classification.confidence.toFixed(2)}, ` +
        `reasons=[${classification.reason_codes.join(',')}])`
      );
    } catch (classErr) {
      console.error('[fill-plan] classification error (fail-closed → UNKNOWN/dynamic):', classErr.message);
      classification = {
        system_classification: 'UNKNOWN',
        effective_execution_mode: 'dynamic',
        confidence: 0,
        reason_codes: ['classification_error'],
        evidence_summary: { hard_signals: 0, soft_signals: 0, cascade_edges: 0 },
      };
    }

    // ── Phase 4.4: Operator execution mode merge ──────────────────────
    // Operator preference (AUTO/STATIC/DYNAMIC) merged with system classification.
    // Authority: hard evidence > server policy > operator > classification.
    const operatorPreference = req.body.operator_execution_preference || 'AUTO';
    const modeResult = mergeExecutionMode({
      operatorPreference,
      systemClassification: classification.system_classification,
    });
    // Override the effective_execution_mode from classifier with merged result
    classification.effective_execution_mode = modeResult.effective_execution_mode;
    classification.operator_preference = modeResult.preference_applied;
    classification.preference_demotion = modeResult.demotion;
    classification.mode_reason = modeResult.reason;

    // ── Phase 4.3: Plan clamping for dynamic/unknown mode ───────────
    // When effective mode is dynamic, only return the first step to prevent
    // unsafe multi-step blind batch execution. Extension must re-perceive
    // and re-plan after each step in dynamic mode.
    let planClamped = false;
    const plan = planResult.plan;
    if (classification && classification.effective_execution_mode === 'dynamic' && plan?.steps?.length > 1) {
      const originalCount = plan.steps.length;
      plan.steps = [plan.steps[0]];
      planClamped = true;
      if (!planResult.diagnostics) planResult.diagnostics = {};
      planResult.diagnostics.plan_clamped = true;
      planResult.diagnostics.plan_clamp_reason = classification.system_classification === 'UNKNOWN'
        ? 'plan_clamped_unknown' : 'plan_clamped_dynamic';
      planResult.diagnostics.original_step_count = originalCount;
    }

    return res.json({
      plan,
      classification,
      plan_clamped: planClamped,
      session: { id: planResult.session_id },
      diagnostics: planResult.diagnostics,
    });
  } catch (err) {
    console.error('[fill-plan] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/fill-observation ──────────────────────────────────────────
// Extension reports an ExecutionObservation v3. The fill-session identifier
// is transport metadata (query param), not part of the public observation IR.
router.post('/fill-observation', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const isV3 = body.kind === 'execution_observation';
    const planId = isV3 ? body.plan_id : body.planId;
    if (!planId) {
      return res.status(400).json({ error: 'planId or plan_id is required' });
    }

    const now = new Date().toISOString();
    const observation = isV3 ? body : {
      kind: 'execution_observation',
      schema_version: '3.0.0',
      observation_id: `obs:legacy${Date.now().toString(36)}`,
      plan_id: planId,
      correlation_id: body.correlation_id || `corr:legacy${Date.now().toString(36)}`,
      document_id: body.document_id || 'doc:legacy',
      observed_at: now,
      outcome: body.outcome === 'completed' ? 'completed' : (body.outcome || 'partial'),
      rejection_reason: null,
      resulting_revision: body.resulting_revision ?? 0,
      resulting_snapshot_id: body.snapshot_id || null,
      steps: (body.steps || []).map(step => ({
        step_id: step.step_id,
        status: step.status,
        failure_code: step.failure_code || null,
        postcondition_met: step.postcondition_met ?? null,
        observed_value_state: step.observed_value_state || null,
        duration_ms: step.duration_ms ?? null,
      })),
      diagnostics: body.diagnostics || [],
    };

    const required = ['observation_id', 'correlation_id', 'document_id', 'observed_at', 'outcome', 'steps', 'resulting_revision', 'diagnostics'];
    const missing = required.filter(key => observation[key] == null);
    if (observation.schema_version !== '3.0.0' || missing.length > 0 || !Array.isArray(observation.steps)) {
      return res.status(422).json({ error: 'Invalid ExecutionObservation v3', details: missing });
    }

    const sessionId = req.query.sessionId || body.sessionId || null;
    const internalObservation = {
      ...observation,
      // Phase 4.2: pass through DOM evidence for server classification (M4.3)
      dom_evidence: Array.isArray(body.dom_evidence) ? body.dom_evidence : [],
      step_results: observation.steps.map(step => ({
        step_id: step.step_id,
        status: step.status === 'succeeded' ? 'completed' : step.status,
        error_code: step.failure_code || null,
      })),
    };
    const result = handleObservation(sessionId, internalObservation);

    let evidence = {
      persisted: false,
      persistentSessionId: null,
      learning: { attempted: 0, succeeded: 0, failed: 0 },
      mappingObservations: { persisted: false, count: 0, reason: 'not_acknowledged' },
    };
    if (sessionId && result.acknowledged) {
      evidence = await persistExecutionEvidence({
        sessionId,
        observation,
        workspaceId: req.user.workspaceId,
        userId: req.user.userId,
        runtimeVersion: String(req.query.runtimeVersion || 'unknown').slice(0, 20),
      });
    }

    // Phase 4.3: If hard DOM evidence is present, persist dynamic behavior
    // as prior knowledge so next fill-plan classifies DYNAMIC immediately.
    const domEv = internalObservation.dom_evidence || [];
    const hardCount = domEv.filter(e => isHardEvidenceType(e.type)).length;
    let behaviorUpdated = false;
    if (hardCount > 0) {
      try {
        const { mutateDoc, KEYS } = await import('../store.js');
        // FIX: Resolve stable scope from fill session metadata (not query params).
        // Session stores portal_id + form_key derived from snapshot at plan time,
        // guaranteeing the observation write key matches the fill-plan read key.
        const { getSession: getFillSession } = await import('../fill-session.js');
        let portalId = '';
        let formKey = '';
        const fillSession = sessionId ? getFillSession(sessionId) : null;
        if (fillSession?.metadata) {
          portalId = fillSession.metadata.portal_id || '';
          formKey = fillSession.metadata.form_key || '';
        }
        // Fallback to query params only if session metadata unavailable
        if (!portalId && !formKey) {
          portalId = req.query.portal_id || '';
          formKey = req.query.form_key || req.query.correlation_id || req.query.plan_id || '';
        }
        const behaviorKey = portalId ? `${portalId}:${formKey}` : formKey;
        if (behaviorKey) {
          await mutateDoc(KEYS.MAPPINGS, (all) => {
            const form = all[behaviorKey] || {};
            if (!form._behavior) form._behavior = {};
            form._behavior.behavior = 'dynamic'; // classifier-native field
            form._behavior.classification = 'DYNAMIC';
            form._behavior.hard_evidence_count = (form._behavior.hard_evidence_count || 0) + hardCount;
            form._behavior.last_dynamic_at = new Date().toISOString();
            all[behaviorKey] = form;
            return all;
          });
          behaviorUpdated = true;
        }
      } catch (e) {
        console.warn('[fill-observation] behavior prior update failed:', e.message);
      }
    }

    return res.json({
      acknowledged: result.acknowledged,
      session_status: result.session_status,
      persisted: evidence.persisted,
      persistent_session_id: evidence.persistentSessionId,
      learning: evidence.learning,
      mapping_observations: evidence.mappingObservations,
      behavior_updated: behaviorUpdated,
    });
  } catch (err) {
    console.error('[fill-observation] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
