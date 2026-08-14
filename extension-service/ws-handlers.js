/**
 * CyberControl WebSocket Message Handlers — extension-service/ws-handlers.js
 * Phase 3.4 — WSS Protocol
 *
 * Routes incoming WebSocket messages to appropriate handlers.
 * Messages from the extension:
 *   - page_snapshot: full snapshot of current page
 *   - page_delta: incremental changes
 *   - execution_observation: result of executing an action plan
 *   - sync_request: knowledge sync request
 *   - teach_observation: teach-mode behavioral data
 *   - heartbeat: keepalive acknowledgment
 *
 * Messages to the extension (sent via ws-server.send):
 *   - action_plan: instructions to execute
 *   - sync_response: knowledge data
 *   - teach_prompt: teach-mode prompts
 *   - status: server status updates
 *   - error: error responses
 *
 * ARCHITECTURE (constitution.yml):
 *   All planning, AI, knowledge interpretation, and learning happen here.
 *   The extension only observes and executes.
 */

import { send } from './ws-server.js';

/**
 * @typedef {object} HandlerContext
 * @property {function} getKnowledge — (workspaceId, kind, scope) => records
 * @property {function} resolveMapping — (workspaceId, snapshot) => actionPlan
 * @property {function} recordObservation — (workspaceId, observation) => void
 * @property {function} recordTeachData — (workspaceId, data) => void
 * @property {function} syncKnowledge — (workspaceId, request) => response
 */

/** Message type → handler function. */
const handlers = new Map();

/**
 * Initialize the handlers with service dependencies.
 *
 * @param {HandlerContext} [ctx] — service functions (injected for testability)
 * @returns {{ onMessage: function, onConnection: function, onClose: function }}
 */
export function createHandlers(ctx = {}) {
  /**
   * Handle an incoming message from a connected extension.
   * @param {object} session — from ws-server (sessionId, workspaceId, ws, etc.)
   * @param {object} message — parsed JSON with `type` field
   */
  function onMessage(session, message) {
    const handler = handlers.get(message.type);
    if (handler) {
      handler(session, message, ctx);
    } else {
      send(session.sessionId, {
        type: 'error',
        code: 'unknown_message_type',
        message: `Unknown message type: ${message.type}`,
        ref: message.id || null,
      });
    }
  }

  /**
   * Handle new connection.
   */
  function onConnection(session) {
    console.log(`[ws] Connected: ${session.sessionId} (workspace: ${session.workspaceId.slice(0, 8)}...)`);
  }

  /**
   * Handle connection close.
   */
  function onClose(session, code, reason) {
    console.log(`[ws] Disconnected: ${session.sessionId} (code=${code}, reason=${reason || 'none'})`);
  }

  return { onMessage, onConnection, onClose };
}

// ═══════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * page_snapshot — Extension sends a full PageSnapshot v2.
 * Server acknowledges and may respond with an action_plan.
 */
handlers.set('page_snapshot', (session, message, ctx) => {
  const { snapshot } = message;
  if (!snapshot || snapshot.kind !== 'page_snapshot') {
    send(session.sessionId, { type: 'error', code: 'invalid_snapshot', message: 'Expected a valid PageSnapshot', ref: message.id });
    return;
  }

  // Acknowledge receipt
  send(session.sessionId, {
    type: 'snapshot_ack',
    snapshotId: snapshot.snapshot_id,
    revision: snapshot.revision,
    serverTime: Date.now(),
    ref: message.id,
    tabId: message.tabId || session.tabId || null,
    workflowId: message.workflowId || session.workflowId || null,
  });

  // If context has a resolver, attempt to generate an action plan
  if (ctx.resolveMapping) {
    try {
      const plan = ctx.resolveMapping(session.workspaceId, snapshot, {
        tabId: message.tabId || session.tabId,
        workflowId: message.workflowId || session.workflowId,
      });
      if (plan) {
        send(session.sessionId, {
          type: 'action_plan',
          plan,
          ref: message.id,
          tabId: message.tabId || session.tabId || null,
          workflowId: message.workflowId || session.workflowId || null,
        });
      }
    } catch (err) {
      console.error(`[ws] resolveMapping error:`, err.message);
    }
  }
});

/**
 * page_delta — Extension sends incremental changes.
 * Server acknowledges.
 */
handlers.set('page_delta', (session, message, ctx) => {
  const { delta } = message;
  if (!delta || delta.kind !== 'page_delta') {
    send(session.sessionId, { type: 'error', code: 'invalid_delta', message: 'Expected a valid PageDelta', ref: message.id });
    return;
  }

  send(session.sessionId, {
    type: 'delta_ack',
    resultSnapshotId: delta.result_snapshot_id,
    revision: delta.revision,
    serverTime: Date.now(),
    ref: message.id,
  });
});

/**
 * execution_observation — Extension reports action execution results.
 */
handlers.set('execution_observation', (session, message, ctx) => {
  const { observation } = message;
  if (!observation || observation.kind !== 'execution_observation') {
    send(session.sessionId, { type: 'error', code: 'invalid_observation', message: 'Expected ExecutionObservation', ref: message.id });
    return;
  }

  send(session.sessionId, {
    type: 'observation_ack',
    observationId: observation.observation_id,
    outcome: observation.outcome,
    ref: message.id,
  });

  if (ctx.recordObservation) {
    try {
      ctx.recordObservation(session.workspaceId, observation);
    } catch (err) {
      console.error(`[ws] recordObservation error:`, err.message);
    }
  }
});

/**
 * sync_request — Extension requests knowledge sync over WSS.
 * Mirrors the HTTP sync protocol but over the live connection.
 */
handlers.set('sync_request', (session, message, ctx) => {
  const { requestType, payload } = message;
  if (!requestType || !['bootstrap', 'delta', 'check'].includes(requestType)) {
    send(session.sessionId, { type: 'error', code: 'invalid_sync_request', message: 'requestType must be bootstrap|delta|check', ref: message.id });
    return;
  }

  if (ctx.syncKnowledge) {
    try {
      const response = ctx.syncKnowledge(session.workspaceId, { requestType, payload });
      send(session.sessionId, { type: 'sync_response', requestType, data: response, ref: message.id });
    } catch (err) {
      send(session.sessionId, { type: 'error', code: 'sync_failed', message: err.message, ref: message.id });
    }
  } else {
    send(session.sessionId, { type: 'error', code: 'sync_unavailable', message: 'Sync handler not configured', ref: message.id });
  }
});

/**
 * teach_observation — Extension sends behavioral observation during teach mode.
 */
handlers.set('teach_observation', (session, message, ctx) => {
  const { data } = message;
  if (!data) {
    send(session.sessionId, { type: 'error', code: 'invalid_teach_data', message: 'Missing teach observation data', ref: message.id });
    return;
  }

  send(session.sessionId, { type: 'teach_ack', ref: message.id });

  if (ctx.recordTeachData) {
    try {
      ctx.recordTeachData(session.workspaceId, data);
    } catch (err) {
      console.error(`[ws] recordTeachData error:`, err.message);
    }
  }
});

/**
 * ping — Client-initiated ping (in addition to WebSocket-level ping/pong).
 */
handlers.set('ping', (session, message) => {
  send(session.sessionId, { type: 'pong', serverTime: Date.now(), ref: message.id });
});

/**
 * resume — Client reconnected and wants to resume from a known state.
 */
handlers.set('resume', (session, message) => {
  const { lastSnapshotId, lastRevision } = message;
  send(session.sessionId, {
    type: 'resume_ack',
    accepted: true,
    lastSnapshotId: lastSnapshotId || null,
    lastRevision: lastRevision ?? null,
    serverTime: Date.now(),
    ref: message.id,
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Phase 4.10 — Adaptive Execution WSS Transport
// Same semantics as HTTPS fill-plan/fill-observation but over WSS.
// ═══════════════════════════════════════════════════════════════════════

/**
 * fill_plan_request — Extension requests adaptive fill plan over WSS.
 * Same semantics as POST /fill-plan:
 *   - Receives snapshot + operator preference + session_id
 *   - Classifies behavior, merges mode, bounds/clamps plan
 *   - Returns action_plan with classification + diagnostics
 *   - Anti-duplicate: filters committed nodes on re-plan turns
 *   - Plan race: supersedes prior plan if session active
 */
handlers.set('fill_plan_request', async (session, message, ctx) => {
  const { snapshot, profile, profileId, operator_execution_preference, session_id } = message;

  if (!snapshot || snapshot.kind !== 'page_snapshot') {
    send(session.sessionId, { type: 'error', code: 'invalid_snapshot', message: 'Expected valid PageSnapshot', ref: message.id });
    return;
  }
  if (!profile || Object.keys(profile).length === 0) {
    send(session.sessionId, { type: 'error', code: 'invalid_profile', message: 'Profile required', ref: message.id });
    return;
  }

  try {
    // Reuse the same server logic as HTTP fill-plan
    const { generateFillPlan, deriveScope } = await import('./fill-planner.js');
    const { classifyFormBehavior } = await import('./behavior-classifier.js');
    const { mergeExecutionMode } = await import('./execution-mode.js');
    const { applyStaticBounds, STATIC_MAX_STEPS } = await import('./static-bounds.js');
    const { getCommittedNodeIds, getActivePlanId, supersedePlan } = await import('./fill-session.js');

    const scope = deriveScope(snapshot);
    let planResult = await generateFillPlan({
      snapshot,
      workspace_id: session.workspaceId,
      phone: null,
      person_key: null,
      profile_overrides: profile,
      profile_id: profileId || null,
    });

    if (!planResult.success) {
      send(session.sessionId, { type: 'fill_plan_response', plan: null, classification: null, session: null, diagnostics: planResult.diagnostics, ref: message.id });
      return;
    }

    // Anti-duplicate filter
    if (session_id && planResult.plan?.steps?.length > 0) {
      const committed = getCommittedNodeIds(session_id);
      if (committed.size > 0) {
        const before = planResult.plan.steps.length;
        planResult.plan.steps = planResult.plan.steps.filter(s => !committed.has(s.target?.node_id));
        if (before > planResult.plan.steps.length) {
          if (!planResult.diagnostics) planResult.diagnostics = {};
          planResult.diagnostics.anti_duplicate_filtered = before - planResult.plan.steps.length;
        }
      }
    }

    if (planResult.plan && planResult.plan.steps.length === 0) {
      send(session.sessionId, { type: 'fill_plan_response', plan: { ...planResult.plan, steps: [] }, fill_complete: true, classification: null, session: { id: planResult.session_id }, diagnostics: planResult.diagnostics, ref: message.id });
      return;
    }

    // Plan race — supersede prior
    let supersededPlanId = null;
    if (session_id && planResult.plan) {
      const activePlan = getActivePlanId(session_id);
      if (activePlan && activePlan !== planResult.plan.plan_id) {
        supersededPlanId = activePlan;
        planResult.plan.supersedes_plan_id = activePlan;
        const stepIds = planResult.plan.steps.map(s => s.step_id);
        const nodeIds = planResult.plan.steps.map(s => s.target?.node_id);
        supersedePlan(session_id, planResult.plan.plan_id, planResult.plan.steps.length, stepIds, nodeIds);
      }
    }

    // Classification (with M4.12 learning prior)
    let classification = null;
    try {
      const domEvidence = Array.isArray(message.dom_evidence) ? message.dom_evidence : [];
      const { loadDoc, KEYS } = await import('./store.js');
      const { effectiveClassification, isStale } = await import('./behavior-learning.js');
      const scope = deriveScope(snapshot);
      const behaviorKey = `${scope.portal_id || ''}:${scope.form_key || ''}`;
      let priorKnowledge = null;
      try {
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
          };
        }
      } catch {}
      classification = classifyFormBehavior({ snapshot, domEvidence, priorKnowledge, planSteps: planResult.plan?.steps || [] });
    } catch {
      classification = { system_classification: 'UNKNOWN', effective_execution_mode: 'dynamic', confidence: 0, reason_codes: ['classification_error'], evidence_summary: {} };
    }

    // Mode merge
    const modeResult = mergeExecutionMode({
      operatorPreference: operator_execution_preference || 'AUTO',
      systemClassification: classification.system_classification,
    });
    classification.effective_execution_mode = modeResult.effective_execution_mode;
    classification.operator_preference = modeResult.preference_applied;
    classification.preference_demotion = modeResult.demotion;

    // Static bounds or dynamic clamp
    const plan = planResult.plan;
    let planClamped = false;
    let staticBounded = false;

    if (classification.effective_execution_mode === 'static' && plan?.steps?.length > 0) {
      const result = applyStaticBounds({ steps: plan.steps, edges: snapshot.edges || [] });
      if (result.bounded) {
        plan.steps = result.steps;
        staticBounded = true;
        if (!planResult.diagnostics) planResult.diagnostics = {};
        planResult.diagnostics.static_bounded = true;
        planResult.diagnostics.static_bound_reason = result.bound_reason;
      }
    } else if (classification.effective_execution_mode === 'dynamic' && plan?.steps?.length > 1) {
      const orig = plan.steps.length;
      plan.steps = [plan.steps[0]];
      planClamped = true;
      if (!planResult.diagnostics) planResult.diagnostics = {};
      planResult.diagnostics.plan_clamped = true;
      planResult.diagnostics.original_step_count = orig;
    }

    // Phase 4.13: HIM checkpoint — scan all steps for irreversible
    let himCheckpoint = null;
    if (plan?.steps?.length > 0) {
      const { requiresHimCheckpoint, createCheckpointRequest } = await import('./him-adaptive-integration.js');
      for (let i = 0; i < plan.steps.length; i++) {
        if (requiresHimCheckpoint(plan.steps[i], plan.authorization || {})) {
          if (i === 0) {
            himCheckpoint = createCheckpointRequest({ session_id: planResult.session_id, plan_id: plan.plan_id, step: plan.steps[0] });
          } else {
            plan.steps = plan.steps.slice(0, i);
            if (!planResult.diagnostics) planResult.diagnostics = {};
            planResult.diagnostics.him_clamp_at = i;
          }
          break;
        }
      }
    }

    // Phase 4.14: Workflow linkage
    if (message.workflow_id && planResult.session_id) {
      try {
        const { getWorkflow, linkFillSession } = await import('./workflow-session.js');
        const wf = getWorkflow(message.workflow_id);
        if (wf && (wf.status === 'active' || wf.status === 'fill_in_progress')) {
          linkFillSession(message.workflow_id, planResult.session_id);
        }
      } catch {}
    }

    send(session.sessionId, {
      type: 'fill_plan_response',
      plan,
      classification,
      plan_clamped: planClamped,
      static_bounded: staticBounded,
      him_checkpoint: himCheckpoint,
      session: { id: planResult.session_id },
      diagnostics: planResult.diagnostics,
      superseded_plan_id: supersededPlanId,
      ref: message.id,
    });
  } catch (err) {
    send(session.sessionId, { type: 'error', code: 'plan_error', message: err.message, ref: message.id });
  }
});

/**
 * fill_observation_wss — Extension reports execution observation over WSS.
 * Same semantics as POST /fill-observation:
 *   - Plan race check (rejects stale plans)
 *   - Hard evidence → persist dynamic behavior
 *   - Committed step tracking
 */
handlers.set('fill_observation_wss', async (session, message, ctx) => {
  const { observation, session_id } = message;

  if (!observation || observation.kind !== 'execution_observation') {
    send(session.sessionId, { type: 'error', code: 'invalid_observation', message: 'Expected ExecutionObservation', ref: message.id });
    return;
  }

  const planId = observation.plan_id;
  if (!planId) {
    send(session.sessionId, { type: 'error', code: 'missing_plan_id', message: 'plan_id required', ref: message.id });
    return;
  }

  // Plan race guard
  if (session_id) {
    const { isPlanActive } = await import('./fill-session.js');
    if (!isPlanActive(session_id, planId)) {
      send(session.sessionId, {
        type: 'fill_observation_rejected',
        code: 'stale_plan',
        message: 'Plan superseded; execution must stop.',
        plan_id: planId,
        ref: message.id,
      });
      return;
    }
  }

  // Mark steps completed in session
  if (session_id) {
    const { markStepCompleted, markStepFailed } = await import('./fill-session.js');
    for (const step of observation.steps || []) {
      if (step.status === 'succeeded') {
        try { markStepCompleted(session_id, step.step_id); } catch {}
      } else if (step.status === 'failed') {
        try { markStepFailed(session_id, step.step_id, step.failure_code || 'unknown'); } catch {}
      }
    }
  }

  send(session.sessionId, {
    type: 'fill_observation_ack',
    observation_id: observation.observation_id,
    outcome: observation.outcome,
    plan_id: planId,
    ref: message.id,
  });

  // Phase 4.12: Behavior learning — same as HTTPS path
  try {
    const { isHardEvidenceType } = await import('./behavior-classifier.js');
    const domEv = Array.isArray(observation.dom_evidence) ? observation.dom_evidence : [];
    const hardCount = domEv.filter(e => isHardEvidenceType(e.type)).length;

    if (hardCount > 0 || (observation.steps || []).every(s => s.status === 'succeeded')) {
      const { mutateDoc, KEYS } = await import('./store.js');
      const { getSession: getFillSession } = await import('./fill-session.js');
      const fillSession = session_id ? getFillSession(session_id) : null;
      let portalId = fillSession?.metadata?.portal_id || '';
      let formKey = fillSession?.metadata?.form_key || '';
      const behaviorKey = portalId ? `${portalId}:${formKey}` : formKey;

      if (behaviorKey) {
        if (hardCount > 0) {
          const { recordDynamicEvidence } = await import('./behavior-learning.js');
          const evidenceTypes = domEv.filter(e => isHardEvidenceType(e.type)).map(e => e.type);
          await mutateDoc(KEYS.MAPPINGS, (all) => {
            const form = all[behaviorKey] || {};
            form._behavior = recordDynamicEvidence(form._behavior || null, { hard_count: hardCount, types: evidenceTypes });
            all[behaviorKey] = form;
            return all;
          });
        } else if ((observation.steps || []).length > 0 && (observation.steps || []).every(s => s.status === 'succeeded')) {
          const { recordStaticSuccess } = await import('./behavior-learning.js');
          await mutateDoc(KEYS.MAPPINGS, (all) => {
            const form = all[behaviorKey] || {};
            form._behavior = recordStaticSuccess(form._behavior || null);
            all[behaviorKey] = form;
            return all;
          });
        }
      }
    }
  } catch (e) {
    console.warn('[ws] behavior learning failed:', e.message);
  }

  // Record via context handler if available
  if (ctx.recordObservation) {
    try { ctx.recordObservation(session.workspaceId, observation); } catch {}
  }
});

export { handlers };
