import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { generateFillPlan, handleObservation, validateSnapshot, deriveScope } from '../fill-planner.js';
import { mapUnknownFields } from '../semantic-mapper.js';
import { persistExecutionEvidence } from '../execution-evidence.js';
import { classifyFormBehavior, isHardEvidenceType } from '../behavior-classifier.js';
import { mergeExecutionMode } from '../execution-mode.js';
import { applyStaticBounds, STATIC_MAX_STEPS } from '../static-bounds.js';

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
      // Support both array-of-objects and object-keyed-by-node_id snapshot formats
      let unmappedFields = Object.values(nodes).filter(node => unmappedNodeIds.has(node.node_id));
      if (unmappedFields.length === 0 && unmappedNodeIds.size > 0) {
        // Fallback: nodes may be keyed by node_id directly
        unmappedFields = [...unmappedNodeIds]
          .map(id => nodes[id])
          .filter(Boolean);
      }

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
      // Build operator-facing message from diagnostics
      const diag = planResult.diagnostics || {};
      let message = 'Fill plan could not be generated.';
      if (diag.phase === 'mapping') {
        const parts = [];
        if (diag.unmapped_count > 0) parts.push(`${diag.unmapped_count} field(s) could not be matched to profile keys`);
        if (diag.excluded_count > 0) parts.push(`${diag.excluded_count} field(s) excluded by privacy/scope rules`);
        if (diag.semantic_mapping?.note) parts.push(diag.semantic_mapping.note);
        if (parts.length > 0) message = parts.join('. ') + '.';
      } else if (diag.errors?.length > 0) {
        message = diag.errors[0];
      }

      return res.status(200).json({
        plan: null,
        classification: null,
        session: null,
        message,
        diagnostics: planResult.diagnostics,
      });
    }

    // ── Phase 4.6: Anti-duplicate filter ────────────────────────────
    // On dynamic re-plan turns, filter out steps targeting node_ids that
    // have already been successfully committed in the fill session.
    const sessionId46 = req.body.session_id || null;
    let committedCount = 0;
    if (sessionId46 && planResult.plan?.steps?.length > 0) {
      const { getCommittedNodeIds } = await import('../fill-session.js');
      const committed = getCommittedNodeIds(sessionId46);
      if (committed.size > 0) {
        const before = planResult.plan.steps.length;
        planResult.plan.steps = planResult.plan.steps.filter(
          step => !committed.has(step.target?.node_id)
        );
        committedCount = before - planResult.plan.steps.length;
        if (committedCount > 0) {
          if (!planResult.diagnostics) planResult.diagnostics = {};
          planResult.diagnostics.anti_duplicate_filtered = committedCount;
          planResult.diagnostics.committed_node_ids = [...committed];
        }
      }
    }

    // If all steps were already committed, return empty plan (fill complete)
    if (planResult.plan && planResult.plan.steps.length === 0) {
      return res.json({
        plan: { ...planResult.plan, steps: [] },
        classification: null,
        plan_clamped: false,
        static_bounded: false,
        fill_complete: true,
        session: { id: planResult.session_id },
        diagnostics: { ...planResult.diagnostics, fill_complete: true },
      });
    }

    // ── Phase 4.6: Plan race — supersede prior plan ─────────────────
    // If re-planning within same session, supersede old plan so stale
    // plans cannot continue execution.
    let supersededPlanId = null;
    if (sessionId46 && planResult.plan) {
      const { getActivePlanId, supersedePlan } = await import('../fill-session.js');
      const activePlan = getActivePlanId(sessionId46);
      if (activePlan && activePlan !== planResult.plan.plan_id) {
        supersededPlanId = activePlan;
        planResult.plan.supersedes_plan_id = activePlan;
        // Supersede in session: skip old pending steps, attach new plan
        const stepIds = planResult.plan.steps.map(s => s.step_id);
        const nodeIds = planResult.plan.steps.map(s => s.target?.node_id);
        supersedePlan(sessionId46, planResult.plan.plan_id, planResult.plan.steps.length, stepIds, nodeIds);
      }
    }

    // ── Phase 4.3: Behavior classification ──────────────────────────
    // Classify static/dynamic after plan generation using snapshot topology,
    // any dom_evidence passed by the extension, and prior server knowledge.
    let classification = null;
    try {
      const domEvidence = Array.isArray(req.body.dom_evidence) ? req.body.dom_evidence : [];

      // Read prior behavior knowledge from durable store (written on observation)
      // Phase 4.12: Use effectiveClassification + isStale for proper learning integration
      const behaviorKey = `${scope.portal_id || ''}:${scope.form_key || ''}`;
      let priorKnowledge = null;
      try {
        const { loadDoc, KEYS } = await import('../store.js');
        const { effectiveClassification, isStale } = await import('../behavior-learning.js');
        const allMappings = await loadDoc(KEYS.MAPPINGS);
        const formEntry = allMappings[behaviorKey] || allMappings[scope.form_key] || {};
        if (formEntry._behavior) {
          const record = formEntry._behavior;
          const stale = isStale(record);
          const effectiveClass = stale ? 'UNKNOWN' : effectiveClassification(record);
          priorKnowledge = {
            behavior: effectiveClass === 'DYNAMIC' ? 'dynamic' : (effectiveClass === 'STATIC' ? 'static' : null),
            hard_evidence_count: record.hard_evidence_count || 0,
            dynamic_incidents: record.hard_evidence_count || 0,
            last_dynamic_at: record.last_dynamic_at || null,
            confidence: record.confidence || 0,
            stale,
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

    // ── Phase 4.5: Safe bounded static execution ─────────────────────
    // STATIC plans get bounded by hard max + dependency-closed subset.
    // This runs BEFORE dynamic clamp (which only applies if mode is dynamic).
    let staticBounded = false;
    let staticBoundResult = null;
    const plan = planResult.plan;
    if (classification.effective_execution_mode === 'static' && plan?.steps?.length > 0) {
      const snapshotEdges = snapshot.edges || [];
      staticBoundResult = applyStaticBounds({
        steps: plan.steps,
        edges: snapshotEdges,
      });
      if (staticBoundResult.bounded) {
        plan.steps = staticBoundResult.steps;
        staticBounded = true;
        if (!planResult.diagnostics) planResult.diagnostics = {};
        planResult.diagnostics.static_bounded = true;
        planResult.diagnostics.static_bound_reason = staticBoundResult.bound_reason;
        planResult.diagnostics.static_max_steps = STATIC_MAX_STEPS;
        planResult.diagnostics.original_step_count = staticBoundResult.original_count;
        planResult.diagnostics.remaining_steps = staticBoundResult.remaining_count;
        if (staticBoundResult.cascade_break_at !== null) {
          planResult.diagnostics.cascade_break_at_step = staticBoundResult.cascade_break_at;
        }
      }
    }

    // ── Phase 4.3: Plan clamping for dynamic/unknown mode ───────────
    // When effective mode is dynamic, only return the first step to prevent
    // unsafe multi-step blind batch execution. Extension must re-perceive
    // and re-plan after each step in dynamic mode.
    let planClamped = false;
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

    // ── Phase 4.14: Workflow linkage ──────────────────────────────────
    // If client provides workflow_id, link fill session to active workflow task.
    if (req.body.workflow_id && planResult.session_id) {
      try {
        const { getWorkflow, linkFillSession } = await import('../workflow-session.js');
        const wf = getWorkflow(req.body.workflow_id);
        if (wf && (wf.status === 'active' || wf.status === 'fill_in_progress')) {
          linkFillSession(req.body.workflow_id, planResult.session_id);
        }
      } catch (e) {
        console.warn('[fill-plan] workflow link failed:', e.message);
      }
    }

    // ── Phase 4.13: HIM checkpoint for irreversible steps ─────────────
    // If ANY step is irreversible and not pre-confirmed, clamp plan to stop
    // just before that step (or return only that step if it's first).
    // This ensures HIM checkpoint fires before every irreversible action.
    let himCheckpoint = null;
    if (plan?.steps?.length > 0) {
      const { requiresHimCheckpoint, createCheckpointRequest } = await import('../him-adaptive-integration.js');
      for (let i = 0; i < plan.steps.length; i++) {
        if (requiresHimCheckpoint(plan.steps[i], plan.authorization || {})) {
          if (i === 0) {
            // First step is irreversible — emit checkpoint, keep plan as-is
            himCheckpoint = createCheckpointRequest({
              session_id: planResult.session_id,
              plan_id: plan.plan_id,
              step: plan.steps[0],
            });
          } else {
            // Irreversible step at position i — clamp plan to steps before it
            // Next plan call will have it as first step and emit checkpoint then
            plan.steps = plan.steps.slice(0, i);
            if (!planResult.diagnostics) planResult.diagnostics = {};
            planResult.diagnostics.him_clamp_at = i;
            planResult.diagnostics.him_clamp_reason = 'irreversible_step_ahead';
          }
          break; // Only handle first irreversible step found
        }
      }
    }

    return res.json({
      plan,
      classification,
      plan_clamped: planClamped,
      static_bounded: staticBounded,
      him_checkpoint: himCheckpoint,
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

    // ── Phase 4.6: Plan race guard ──────────────────────────────────
    // Reject observations for superseded (stale) plans. Only the active
    // plan may report results. Fail closed: stale plan execution stops.
    const sessionId = req.query.sessionId || body.sessionId || null;
    if (sessionId) {
      const { isPlanActive } = await import('../fill-session.js');
      if (!isPlanActive(sessionId, planId)) {
        return res.status(409).json({
          error: 'stale_plan',
          message: 'This plan has been superseded. Execution must stop.',
          plan_id: planId,
          session_id: sessionId,
        });
      }
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

    // Phase 4.3/4.12: If hard DOM evidence is present, persist dynamic behavior
    // with confidence, provenance, and expiry (M4.12 learning model).
    const domEv = internalObservation.dom_evidence || [];
    const hardCount = domEv.filter(e => isHardEvidenceType(e.type)).length;
    let behaviorUpdated = false;
    if (hardCount > 0) {
      try {
        const { mutateDoc, KEYS } = await import('../store.js');
        const { recordDynamicEvidence } = await import('../behavior-learning.js');
        const { getSession: getFillSession } = await import('../fill-session.js');
        let portalId = '';
        let formKey = '';
        const fillSession = sessionId ? getFillSession(sessionId) : null;
        if (fillSession?.metadata) {
          portalId = fillSession.metadata.portal_id || '';
          formKey = fillSession.metadata.form_key || '';
        }
        if (!portalId && !formKey) {
          portalId = req.query.portal_id || '';
          formKey = req.query.form_key || req.query.correlation_id || req.query.plan_id || '';
        }
        const behaviorKey = portalId ? `${portalId}:${formKey}` : formKey;
        if (behaviorKey) {
          const evidenceTypes = domEv.filter(e => isHardEvidenceType(e.type)).map(e => e.type);
          await mutateDoc(KEYS.MAPPINGS, (all) => {
            const form = all[behaviorKey] || {};
            const existing = form._behavior || null;
            form._behavior = recordDynamicEvidence(existing, { hard_count: hardCount, types: evidenceTypes });
            all[behaviorKey] = form;
            return all;
          });
          behaviorUpdated = true;
        }
      } catch (e) {
        console.warn('[fill-observation] behavior prior update failed:', e.message);
      }
    }

    // Phase 4.12: Record static success when all steps succeeded without hard evidence.
    // This provides contradicting evidence that reduces dynamic confidence over time.
    const allSucceeded = (internalObservation.steps || []).every(s => s.status === 'succeeded' || s.status === 'completed');
    if (allSucceeded && hardCount === 0 && (internalObservation.steps || []).length > 0) {
      try {
        const { mutateDoc, KEYS } = await import('../store.js');
        const { recordStaticSuccess } = await import('../behavior-learning.js');
        const { getSession: getFillSession } = await import('../fill-session.js');
        let portalId = '';
        let formKey = '';
        const fillSession = sessionId ? getFillSession(sessionId) : null;
        if (fillSession?.metadata) {
          portalId = fillSession.metadata.portal_id || '';
          formKey = fillSession.metadata.form_key || '';
        }
        if (!portalId && !formKey) {
          portalId = req.query.portal_id || '';
          formKey = req.query.form_key || '';
        }
        const behaviorKey = portalId ? `${portalId}:${formKey}` : formKey;
        if (behaviorKey) {
          await mutateDoc(KEYS.MAPPINGS, (all) => {
            const form = all[behaviorKey] || {};
            form._behavior = recordStaticSuccess(form._behavior || null);
            all[behaviorKey] = form;
            return all;
          });
        }
      } catch (e) {
        console.warn('[fill-observation] static success record failed:', e.message);
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

// ── POST /api/workflow-create ────────────────────────────────────────────
// Phase 4.14: Create a new workflow session for a customer.
router.post('/workflow-create', authMiddleware, async (req, res) => {
  try {
    const { customer_id, profile_id, tasks } = req.body;
    const { createWorkflow } = await import('../workflow-session.js');
    const wf = createWorkflow({
      workspace_id: req.user.workspaceId,
      customer_id: customer_id || null,
      profile_id: profile_id || null,
      tasks: Array.isArray(tasks) ? tasks : [],
    });
    return res.json({
      workflow_id: wf.workflow_id,
      status: wf.status,
      tasks: wf.tasks.map(t => ({ task_id: t.task_id, type: t.type, form_key: t.form_key, status: t.status })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/him-validate-resume ────────────────────────────────────────
// Phase 4.13: Validates whether execution can safely resume after HIM pause.
// Checks plan still active + document unchanged + revision for re-perception.
router.post('/him-validate-resume', authMiddleware, async (req, res) => {
  try {
    const { session_id, plan_id, original_document_id, current_document_id, original_revision, current_revision } = req.body;
    const { isPlanActive } = await import('../fill-session.js');
    const { validateResume } = await import('../him-adaptive-integration.js');

    const active_plan_id = session_id ? (isPlanActive(session_id, plan_id) ? plan_id : 'superseded') : plan_id;

    const result = validateResume({
      original_document_id: original_document_id || '',
      current_document_id: current_document_id || '',
      original_revision: original_revision ?? 0,
      current_revision: current_revision ?? 0,
      plan_id: plan_id || '',
      active_plan_id: active_plan_id,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/workflow-complete-task ─────────────────────────────────────
// Extension notifies that a fill task completed within a workflow.
// Advances to the next task in the workflow.
router.post('/workflow-complete-task', authMiddleware, async (req, res) => {
  try {
    const { workflow_id, result } = req.body;
    if (!workflow_id) {
      return res.status(400).json({ error: 'workflow_id required' });
    }
    const { getWorkflow, completeCurrentTask } = await import('../workflow-session.js');
    const wf = getWorkflow(workflow_id);
    if (!wf) {
      return res.status(404).json({ error: 'workflow not found' });
    }
    const { workflow, next_task } = completeCurrentTask(workflow_id, result || null);
    return res.json({
      workflow_id: workflow.workflow_id,
      status: workflow.status,
      completed_at: workflow.completed_at,
      next_task: next_task ? { task_id: next_task.task_id, type: next_task.type, form_key: next_task.form_key } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
