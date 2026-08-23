// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Fill Orchestrator — extension-service/orchestrator.js
// Phase 7 — Autonomous Runtime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// End-to-end fill orchestration. Receives PageSnapshots via WSS,
// coordinates all server-side intelligence, and returns ActionPlans
// to the extension for mechanical execution.
//
// Pipeline: perceive → plan → derive → build → [semantic-map] → execute → learn
//
// Responsibilities:
//   - Receive PageSnapshot via WSS from extension
//   - Call fill-planner → derivation-engine → plan-builder
//   - If unknown fields: call semantic-mapper (cold-start)
//   - Send ActionPlan to extension via WSS
//   - Receive ExecutionObservation from extension
//   - Route corrections to learning-engine
//   - Manage fill sessions end-to-end
//   - Handle multi-page workflows (page transitions)
//
// Architecture (constitution.yml):
//   All planning, AI, knowledge interpretation, and learning happen here.
//   The extension only observes and executes.
//
// Does NOT own: DOM interaction, perception, execution mechanics.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';
import { generateFillPlan, handleObservation, deriveScope, validateSnapshot, enrichProfile } from '../../svc-fill-planner/src/index.js';
import { mapUnknownFields } from '../../svc-ai-mapper/src/index.js';
import { processCorrections, recordSuccessfulExecution, recordFailedExecution } from '../../svc-learning/src/index.js';
import { send, getWorkspaceSessions as getWsSessions } from '../../../extension-service/src/ws/server.js';
import * as knowledgeStore from '../../svc-knowledge/src/index.js';

// ── Configuration ───────────────────────────────────────────────────

/** Maximum time to wait for fill-plan generation (ms). */
const PLAN_GENERATION_TIMEOUT_MS = 15_000;

/** Maximum pages in a multi-page workflow. */
const MAX_WORKFLOW_PAGES = 20;

/** Delay between re-plan attempts after semantic mapping (ms). */
const REMAP_RETRY_DELAY_MS = 500;

/** Maximum retries for plan generation after semantic mapping. */
const MAX_REMAP_RETRIES = 2;

/** Maximum concurrent orchestrations per workspace. */
const MAX_CONCURRENT_PER_WORKSPACE = 5;

// ── State ───────────────────────────────────────────────────────────

/**
 * Active orchestration contexts indexed by session ID.
 * @type {Map<string, OrchestrationContext>}
 */
const activeOrchestrations = new Map();

/**
 * Workspace → active orchestration count.
 * @type {Map<string, number>}
 */
const workspaceConcurrency = new Map();

/**
 * Multi-page workflow tracking.
 * workflowId → WorkflowState
 * @type {Map<string, WorkflowState>}
 */
const activeWorkflows = new Map();


// ── Type Definitions ────────────────────────────────────────────────

/**
 * @typedef {object} OrchestrationContext
 * @property {string} orchestrationId — Unique ID for this orchestration
 * @property {string} sessionId — WSS session ID (connection)
 * @property {string} fillSessionId — Fill-session tracking ID
 * @property {string} workspaceId — Workspace context
 * @property {string} userId — Operator who triggered the fill
 * @property {string|null} workflowId — Multi-page workflow ID (null = single page)
 * @property {string} status — 'planning' | 'awaiting_execution' | 'executing' | 'learning' | 'completed' | 'failed'
 * @property {object|null} snapshot — Last received PageSnapshot
 * @property {object|null} plan — Last issued ActionPlan
 * @property {object|null} observation — Last received ExecutionObservation
 * @property {object[]} corrections — Pending corrections to process
 * @property {number} createdAt — Timestamp
 * @property {number} updatedAt — Timestamp
 * @property {object} metrics — Timing and diagnostic data
 */

/**
 * @typedef {object} WorkflowState
 * @property {string} workflowId — Unique workflow identifier
 * @property {string} workspaceId
 * @property {string} userId
 * @property {string} sessionId — WSS session
 * @property {string[]} pageHistory — Ordered list of page document_ids visited
 * @property {string|null} currentOrchestrationId — Active orchestration for current page
 * @property {number} pageCount — Number of pages processed
 * @property {string} status — 'active' | 'completed' | 'failed' | 'abandoned'
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {object} OrchestrationResult
 * @property {boolean} success
 * @property {string|null} planId — Plan sent to extension (null if failed)
 * @property {string} fillSessionId
 * @property {string|null} workflowId
 * @property {object} diagnostics
 */


// ── Utility ─────────────────────────────────────────────────────────

/**
 * Generate a prefixed unique ID.
 * @param {string} prefix
 * @returns {string}
 */
function genId(prefix) {
  return `${prefix}:${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

/**
 * Increment workspace concurrency counter.
 * @param {string} workspaceId
 * @returns {boolean} — true if within limit
 */
function acquireConcurrency(workspaceId) {
  const current = workspaceConcurrency.get(workspaceId) || 0;
  if (current >= MAX_CONCURRENT_PER_WORKSPACE) return false;
  workspaceConcurrency.set(workspaceId, current + 1);
  return true;
}

/**
 * Decrement workspace concurrency counter.
 * @param {string} workspaceId
 */
function releaseConcurrency(workspaceId) {
  const current = workspaceConcurrency.get(workspaceId) || 0;
  if (current <= 1) {
    workspaceConcurrency.delete(workspaceId);
  } else {
    workspaceConcurrency.set(workspaceId, current - 1);
  }
}

/**
 * Extract unmapped fields from a fill-plan diagnostics result.
 * @param {object} planResult — Result from generateFillPlan
 * @param {object} snapshot — The PageSnapshot
 * @returns {object[]} — Fields eligible for semantic mapping
 */
function extractUnmappedFields(planResult, snapshot) {
  const diagnostics = planResult.diagnostics || {};
  if (!diagnostics.unmapped_count || diagnostics.unmapped_count === 0) return [];

  // Collect nodes that were not mapped
  const nodes = snapshot.nodes || {};
  const mappedNodeIds = new Set();

  if (planResult.plan && planResult.plan.steps) {
    for (const step of planResult.plan.steps) {
      mappedNodeIds.add(step.target.node_id);
    }
  }

  const unmapped = [];
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (mappedNodeIds.has(nodeId)) continue;
    // Only include fillable nodes (have affordances)
    const affordances = node.affordances || [];
    if (affordances.length === 0) continue;
    if (!affordances.some(a => ['type_text', 'select_one', 'select_many', 'toggle'].includes(a))) continue;

    unmapped.push({
      node_id: nodeId,
      label: node.semantic_label || node.label || node.name || null,
      affordances,
      attributes: node.attributes || {},
      context: node.context || {},
    });
  }

  return unmapped;
}


// ═══════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Orchestrate a fill for an incoming PageSnapshot.
 * Called when the extension sends a page_snapshot message over WSS.
 *
 * Full pipeline:
 *   1. Validate snapshot
 *   2. Resolve derivation rules and enrich profile
 *   3. Generate fill plan (fill-planner → mapping-engine → plan-builder)
 *   4. If unmapped fields exist → call semantic-mapper, then re-plan
 *   5. Send ActionPlan to extension via WSS
 *   6. Track orchestration context for observation handling
 *
 * @param {object} params
 * @param {object} params.snapshot — PageSnapshot from extension
 * @param {string} params.sessionId — WSS session ID
 * @param {string} params.workspaceId — Workspace context
 * @param {string} params.userId — Operator triggering fill
 * @param {string} params.phone — User phone for profile
 * @param {string} params.personKey — Person key for profile lookup
 * @param {object} [params.profileOverrides] — Pre-resolved profile (optional)
 * @param {string} [params.workflowId] — Existing workflow to continue
 * @returns {Promise<OrchestrationResult>}
 */
export async function orchestrateSnapshot(params) {
  const {
    snapshot,
    sessionId,
    workspaceId,
    userId,
    phone,
    personKey,
    profileOverrides,
    workflowId,
  } = params;

  const orchestrationId = genId('orch');
  const startTime = Date.now();

  // ── Concurrency guard ──────────────────────────────────────────────
  if (!acquireConcurrency(workspaceId)) {
    return {
      success: false,
      planId: null,
      fillSessionId: null,
      workflowId: workflowId || null,
      diagnostics: {
        orchestrationId,
        error: 'Too many concurrent fills for this workspace',
        phase: 'concurrency_check',
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // Create orchestration context
  const ctx = {
    orchestrationId,
    sessionId,
    fillSessionId: null,
    workspaceId,
    userId,
    workflowId: workflowId || null,
    status: 'planning',
    snapshot,
    plan: null,
    observation: null,
    corrections: [],
    createdAt: startTime,
    updatedAt: startTime,
    metrics: { phases: {} },
  };
  activeOrchestrations.set(orchestrationId, ctx);

  try {
    // ── Phase 1: Resolve derivation rules ────────────────────────────
    const derivationStart = Date.now();
    let derivationRules = [];
    try {
      const scope = deriveScope(snapshot);
      derivationRules = await loadDerivationRules(workspaceId, scope);
    } catch (err) {
      console.warn(`[orchestrator] Derivation rules load failed: ${err.message}`);
    }
    ctx.metrics.phases.derivation_load = Date.now() - derivationStart;

    // ── Phase 2: Generate fill plan ──────────────────────────────────
    const planStart = Date.now();
    let planResult = await generateFillPlan({
      snapshot,
      workspace_id: workspaceId,
      phone,
      person_key: personKey,
      profile_overrides: profileOverrides,
    });
    ctx.metrics.phases.initial_plan = Date.now() - planStart;

    // ── Phase 3: Semantic mapping for unknown fields ─────────────────
    if (planResult.success && planResult.diagnostics.unmapped_count > 0) {
      const remapResult = await attemptSemanticMapping(
        planResult, snapshot, workspaceId, userId, phone, personKey, profileOverrides
      );
      if (remapResult.replanSuccess) {
        planResult = remapResult.planResult;
        ctx.metrics.phases.semantic_mapping = remapResult.duration_ms;
      }
    } else if (!planResult.success && planResult.diagnostics.phase === 'mapping') {
      // All fields unmapped — try semantic mapping from scratch
      const remapResult = await attemptSemanticMapping(
        planResult, snapshot, workspaceId, userId, phone, personKey, profileOverrides
      );
      if (remapResult.replanSuccess) {
        planResult = remapResult.planResult;
        ctx.metrics.phases.semantic_mapping = remapResult.duration_ms;
      }
    }

    // ── Phase 4: Send plan or report failure ─────────────────────────
    if (planResult.success && planResult.plan) {
      ctx.plan = planResult.plan;
      ctx.fillSessionId = planResult.session_id;
      ctx.status = 'awaiting_execution';
      ctx.updatedAt = Date.now();

      // Send plan to extension
      send(sessionId, {
        type: 'action_plan',
        plan: planResult.plan,
        orchestrationId,
        sessionId: planResult.session_id,
        workflowId: ctx.workflowId,
      });

      // Track in workflow if multi-page
      if (ctx.workflowId) {
        trackWorkflowPage(ctx.workflowId, snapshot.document_id, orchestrationId);
      }

      ctx.metrics.phases.total = Date.now() - startTime;
      return {
        success: true,
        planId: planResult.plan.plan_id,
        fillSessionId: planResult.session_id,
        workflowId: ctx.workflowId,
        diagnostics: {
          orchestrationId,
          ...planResult.diagnostics,
          orchestration_duration_ms: Date.now() - startTime,
          phases: ctx.metrics.phases,
        },
      };
    }

    // Plan generation failed
    ctx.status = 'failed';
    ctx.updatedAt = Date.now();

    send(sessionId, {
      type: 'fill_status',
      status: 'no_plan',
      orchestrationId,
      reason: planResult.diagnostics.errors?.[0] || 'Could not generate fill plan',
      diagnostics: planResult.diagnostics,
    });

    ctx.metrics.phases.total = Date.now() - startTime;
    return {
      success: false,
      planId: null,
      fillSessionId: planResult.session_id,
      workflowId: ctx.workflowId,
      diagnostics: {
        orchestrationId,
        ...planResult.diagnostics,
        orchestration_duration_ms: Date.now() - startTime,
        phases: ctx.metrics.phases,
      },
    };
  } catch (err) {
    ctx.status = 'failed';
    ctx.updatedAt = Date.now();
    console.error(`[orchestrator] Fatal error in orchestration ${orchestrationId}:`, err.message);

    send(sessionId, {
      type: 'fill_status',
      status: 'error',
      orchestrationId,
      reason: `Orchestration failed: ${err.message}`,
    });

    return {
      success: false,
      planId: null,
      fillSessionId: null,
      workflowId: ctx.workflowId,
      diagnostics: {
        orchestrationId,
        error: err.message,
        phase: 'orchestration',
        duration_ms: Date.now() - startTime,
      },
    };
  } finally {
    releaseConcurrency(workspaceId);
  }
}


// ═══════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPING (COLD-START)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Attempt semantic mapping for unmapped fields, then re-plan.
 *
 * @param {object} originalPlanResult — The initial plan result (may be partial or failed)
 * @param {object} snapshot — PageSnapshot
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} phone
 * @param {string} personKey
 * @param {object} [profileOverrides]
 * @returns {Promise<{ replanSuccess: boolean, planResult: object|null, duration_ms: number }>}
 */
async function attemptSemanticMapping(originalPlanResult, snapshot, workspaceId, userId, phone, personKey, profileOverrides) {
  const startTime = Date.now();

  try {
    // Extract fields that need mapping
    const unmappedFields = extractUnmappedFields(originalPlanResult, snapshot);
    if (unmappedFields.length === 0) {
      return { replanSuccess: false, planResult: null, duration_ms: Date.now() - startTime };
    }

    // Build page context for the semantic mapper
    const scope = deriveScope(snapshot);
    const pageContext = {
      page_title: snapshot.page?.title || '',
      page_url: snapshot.page?.origin || '',
      form_heading: snapshot.page?.form_heading || '',
      portal_id: scope.portal_id,
      form_key: scope.form_key,
      language: snapshot.page?.language || 'en',
    };

    // Call semantic mapper
    const mapResult = await mapUnknownFields({
      fields: unmappedFields,
      pageContext,
      scope: {
        portal_id: scope.portal_id,
        form_key: scope.form_key,
        organization_id: workspaceId,
        country: scope.country,
      },
      requesterId: userId,
    });

    if (!mapResult.ok || mapResult.mappings.length === 0) {
      return { replanSuccess: false, planResult: null, duration_ms: Date.now() - startTime };
    }

    // Wait briefly for knowledge store to propagate new mappings
    await delay(REMAP_RETRY_DELAY_MS);

    // Re-plan with new mappings available
    let retries = 0;
    let replanResult = null;

    while (retries < MAX_REMAP_RETRIES) {
      replanResult = await generateFillPlan({
        snapshot,
        workspace_id: workspaceId,
        phone,
        person_key: personKey,
        profile_overrides: profileOverrides,
      });

      if (replanResult.success && replanResult.plan) {
        // Check if we got more steps than before
        const originalSteps = originalPlanResult.plan?.steps?.length || 0;
        const newSteps = replanResult.plan.steps.length;
        if (newSteps > originalSteps) {
          return { replanSuccess: true, planResult: replanResult, duration_ms: Date.now() - startTime };
        }
      }

      retries++;
      if (retries < MAX_REMAP_RETRIES) {
        await delay(REMAP_RETRY_DELAY_MS);
      }
    }

    // Return the replan result even if not better (it may have succeeded where original failed)
    if (replanResult && replanResult.success) {
      return { replanSuccess: true, planResult: replanResult, duration_ms: Date.now() - startTime };
    }

    return { replanSuccess: false, planResult: null, duration_ms: Date.now() - startTime };
  } catch (err) {
    console.warn(`[orchestrator] Semantic mapping attempt failed: ${err.message}`);
    return { replanSuccess: false, planResult: null, duration_ms: Date.now() - startTime };
  }
}

/**
 * Load derivation rules for the given scope.
 * @param {string} workspaceId
 * @param {object} scope — { portal_id, form_key, country }
 * @returns {Promise<object[]>}
 */
async function loadDerivationRules(workspaceId, scope) {
  try {
    const records = await knowledgeStore.query({
      kind: 'derivation_rule',
      scope: {
        organization_id: workspaceId,
        portal_id: scope.portal_id,
        form_key: scope.form_key,
      },
      status: 'active',
    });
    return records || [];
  } catch {
    return [];
  }
}

/**
 * Promise-based delay.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ═══════════════════════════════════════════════════════════════════════
// EXECUTION OBSERVATION HANDLING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Handle an ExecutionObservation from the extension.
 * Routes results to fill-session tracking and learning engine.
 *
 * @param {object} params
 * @param {string} params.sessionId — WSS session ID
 * @param {string} params.workspaceId — Workspace context
 * @param {string} params.userId — Operator
 * @param {object} params.observation — ExecutionObservation payload
 * @returns {Promise<{ acknowledged: boolean, actions: string[] }>}
 */
export async function handleExecutionObservation(params) {
  const { sessionId, workspaceId, userId, observation } = params;

  const actions = [];

  // Find the active orchestration for this observation
  const orchestrationId = observation.orchestration_id || observation.correlation_id;
  const ctx = findOrchestrationByPlan(observation.plan_id, sessionId);

  if (ctx) {
    ctx.observation = observation;
    ctx.status = 'executing';
    ctx.updatedAt = Date.now();
  }

  // Update fill session with step results
  const fillSessionId = observation.session_id || ctx?.fillSessionId;
  if (fillSessionId) {
    const obsResult = handleObservation(fillSessionId, observation);
    actions.push(`session_updated:${obsResult.session_status}`);
  }

  // Process step-level results for learning
  const stepResults = observation.step_results || [];
  for (const result of stepResults) {
    if (result.status === 'completed' && result.knowledge_record_id) {
      // Record successful execution for confidence tracking
      try {
        await recordSuccessfulExecution(result.knowledge_record_id, {
          sessionId: fillSessionId,
          workspaceId,
          userId,
          stepId: result.step_id,
          nodeId: result.node_id,
        });
        actions.push(`success_recorded:${result.step_id}`);
      } catch (err) {
        console.warn(`[orchestrator] Failed to record success: ${err.message}`);
      }
    } else if (result.status === 'failed' && result.knowledge_record_id) {
      // Record failure for confidence degradation
      try {
        await recordFailedExecution(result.knowledge_record_id, {
          errorCode: result.error_code || 'unknown',
          stepId: result.step_id,
          nodeId: result.node_id,
          affordanceMismatch: result.error_code === 'affordance_mismatch',
        }, {
          sessionId: fillSessionId,
          workspaceId,
          userId,
        });
        actions.push(`failure_recorded:${result.step_id}`);
      } catch (err) {
        console.warn(`[orchestrator] Failed to record failure: ${err.message}`);
      }
    }
  }

  // Check if observation indicates plan completion
  if (observation.outcome === 'completed' || observation.outcome === 'all_steps_done') {
    if (ctx) {
      ctx.status = 'completed';
      ctx.updatedAt = Date.now();
    }
    actions.push('orchestration_completed');

    // Check for multi-page workflow: if page navigated, signal ready for next
    if (observation.page_navigated && ctx?.workflowId) {
      actions.push('workflow_page_transition');
      send(sessionId, {
        type: 'fill_status',
        status: 'page_complete',
        orchestrationId: ctx?.orchestrationId,
        workflowId: ctx?.workflowId,
        message: 'Page filled. Send next page snapshot when ready.',
      });
    }
  } else if (observation.outcome === 'failed' || observation.outcome === 'aborted') {
    if (ctx) {
      ctx.status = 'failed';
      ctx.updatedAt = Date.now();
    }
    actions.push('orchestration_failed');
  }

  // Acknowledge observation back to extension
  send(sessionId, {
    type: 'observation_ack',
    observationId: observation.observation_id,
    outcome: observation.outcome,
    actions,
    ref: observation.id || null,
  });

  return { acknowledged: true, actions };
}

/**
 * Find an active orchestration by plan_id and session.
 * @param {string} planId
 * @param {string} sessionId
 * @returns {OrchestrationContext|null}
 */
function findOrchestrationByPlan(planId, sessionId) {
  if (!planId) return null;
  for (const [, ctx] of activeOrchestrations) {
    if (ctx.plan?.plan_id === planId && ctx.sessionId === sessionId) {
      return ctx;
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════
// CORRECTIONS ROUTING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Route operator corrections to the learning engine.
 * Called when the extension reports field corrections after fill execution.
 *
 * @param {object} params
 * @param {string} params.sessionId — WSS session ID
 * @param {string} params.workspaceId — Workspace
 * @param {string} params.userId — Operator
 * @param {object[]} params.corrections — Array of correction records
 * @param {string} [params.fillSessionId] — Fill session context
 * @param {string} [params.hostname] — Portal hostname
 * @param {string} [params.formKey] — Form identifier
 * @returns {Promise<{ processed: number, updated: number, remapped: number }>}
 */
export async function routeCorrections(params) {
  const { sessionId, workspaceId, userId, corrections, fillSessionId, hostname, formKey } = params;

  if (!corrections || corrections.length === 0) {
    return { processed: 0, updated: 0, remapped: 0 };
  }

  // Build learning-engine context
  const context = {
    sessionId: fillSessionId || sessionId,
    workspaceId,
    userId,
    hostname: hostname || null,
    semanticFormKey: formKey || null,
    trigger: 'operator_correction',
  };

  // Delegate to learning engine
  const result = await processCorrections(corrections, context);

  // If any re-mappings were triggered, notify the extension
  if (result.remapped > 0) {
    send(sessionId, {
      type: 'fill_status',
      status: 'knowledge_updated',
      message: `${result.remapped} mapping(s) will be re-evaluated on next fill.`,
      details: { processed: result.processed, updated: result.updated, remapped: result.remapped },
    });
  }

  // Update orchestration context if found
  const ctx = findOrchestrationBySession(fillSessionId, sessionId);
  if (ctx) {
    ctx.corrections.push(...corrections);
    ctx.status = 'learning';
    ctx.updatedAt = Date.now();
  }

  return result;
}

/**
 * Find orchestration context by fill session or WSS session.
 * @param {string} fillSessionId
 * @param {string} wssSessionId
 * @returns {OrchestrationContext|null}
 */
function findOrchestrationBySession(fillSessionId, wssSessionId) {
  for (const [, ctx] of activeOrchestrations) {
    if (ctx.fillSessionId === fillSessionId || ctx.sessionId === wssSessionId) {
      return ctx;
    }
  }
  return null;
}


// ═══════════════════════════════════════════════════════════════════════
// MULTI-PAGE WORKFLOW MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Start a new multi-page workflow.
 * Called when extension indicates a multi-page form sequence.
 *
 * @param {object} params
 * @param {string} params.sessionId — WSS session
 * @param {string} params.workspaceId
 * @param {string} params.userId
 * @returns {string} — The new workflow ID
 */
export function startWorkflow(params) {
  const { sessionId, workspaceId, userId } = params;
  const workflowId = genId('wflow');

  const workflow = {
    workflowId,
    workspaceId,
    userId,
    sessionId,
    pageHistory: [],
    currentOrchestrationId: null,
    pageCount: 0,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  activeWorkflows.set(workflowId, workflow);

  send(sessionId, {
    type: 'workflow_started',
    workflowId,
    message: 'Multi-page workflow started. Send page snapshots as you navigate.',
  });

  return workflowId;
}

/**
 * Track a page within a workflow.
 * @param {string} workflowId
 * @param {string} documentId — Page document_id
 * @param {string} orchestrationId
 */
function trackWorkflowPage(workflowId, documentId, orchestrationId) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.pageHistory.push(documentId);
  workflow.currentOrchestrationId = orchestrationId;
  workflow.pageCount++;
  workflow.updatedAt = Date.now();

  if (workflow.pageCount >= MAX_WORKFLOW_PAGES) {
    workflow.status = 'completed';
    console.warn(`[orchestrator] Workflow ${workflowId} reached max pages (${MAX_WORKFLOW_PAGES})`);
  }
}

/**
 * Complete a workflow.
 * @param {string} workflowId
 * @returns {{ success: boolean, pageCount: number }}
 */
export function completeWorkflow(workflowId) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return { success: false, pageCount: 0 };

  workflow.status = 'completed';
  workflow.updatedAt = Date.now();

  send(workflow.sessionId, {
    type: 'workflow_completed',
    workflowId,
    pageCount: workflow.pageCount,
  });

  return { success: true, pageCount: workflow.pageCount };
}

/**
 * Abandon a workflow (user cancelled or navigated away).
 * @param {string} workflowId
 */
export function abandonWorkflow(workflowId) {
  const workflow = activeWorkflows.get(workflowId);
  if (!workflow) return;

  workflow.status = 'abandoned';
  workflow.updatedAt = Date.now();
}

/**
 * Get workflow state.
 * @param {string} workflowId
 * @returns {WorkflowState|null}
 */
export function getWorkflow(workflowId) {
  return activeWorkflows.get(workflowId) || null;
}


// ═══════════════════════════════════════════════════════════════════════
// LIFECYCLE & MONITORING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get an active orchestration context.
 * @param {string} orchestrationId
 * @returns {OrchestrationContext|null}
 */
export function getOrchestration(orchestrationId) {
  return activeOrchestrations.get(orchestrationId) || null;
}

/**
 * Get all active orchestrations for a workspace.
 * @param {string} workspaceId
 * @returns {OrchestrationContext[]}
 */
export function getWorkspaceOrchestrations(workspaceId) {
  const results = [];
  for (const [, ctx] of activeOrchestrations) {
    if (ctx.workspaceId === workspaceId) results.push(ctx);
  }
  return results;
}

/**
 * Clean up completed/failed orchestrations older than maxAge.
 * @param {number} [maxAgeMs=300000] — Max age in ms (default 5 min)
 * @returns {number} — Number of orchestrations cleaned up
 */
export function cleanupOrchestrations(maxAgeMs = 5 * 60 * 1000) {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, ctx] of activeOrchestrations) {
    const isTerminal = ctx.status === 'completed' || ctx.status === 'failed';
    const isStale = now - ctx.updatedAt > maxAgeMs;

    if (isTerminal && isStale) {
      activeOrchestrations.delete(id);
      cleaned++;
    } else if (!isTerminal && now - ctx.createdAt > PLAN_GENERATION_TIMEOUT_MS * 4) {
      // Force-expire stuck orchestrations (4x timeout)
      ctx.status = 'failed';
      ctx.updatedAt = now;
      activeOrchestrations.delete(id);
      cleaned++;
    }
  }

  // Clean up old workflows
  for (const [id, wf] of activeWorkflows) {
    const isTerminal = wf.status === 'completed' || wf.status === 'failed' || wf.status === 'abandoned';
    if (isTerminal && now - wf.updatedAt > maxAgeMs) {
      activeWorkflows.delete(id);
    }
  }

  return cleaned;
}

/**
 * Get orchestrator metrics snapshot.
 * @returns {object}
 */
export function getMetrics() {
  const statuses = { planning: 0, awaiting_execution: 0, executing: 0, learning: 0, completed: 0, failed: 0 };
  for (const [, ctx] of activeOrchestrations) {
    statuses[ctx.status] = (statuses[ctx.status] || 0) + 1;
  }

  const workflowStatuses = { active: 0, completed: 0, failed: 0, abandoned: 0 };
  for (const [, wf] of activeWorkflows) {
    workflowStatuses[wf.status] = (workflowStatuses[wf.status] || 0) + 1;
  }

  return {
    activeOrchestrations: activeOrchestrations.size,
    activeWorkflows: activeWorkflows.size,
    orchestrationStatuses: statuses,
    workflowStatuses,
    workspaceConcurrency: Object.fromEntries(workspaceConcurrency),
  };
}

/**
 * Handle WSS disconnection — clean up orchestrations for the disconnected session.
 * @param {string} sessionId — WSS session that disconnected
 */
export function handleDisconnection(sessionId) {
  for (const [id, ctx] of activeOrchestrations) {
    if (ctx.sessionId === sessionId && ctx.status !== 'completed' && ctx.status !== 'failed') {
      ctx.status = 'failed';
      ctx.updatedAt = Date.now();
    }
  }

  for (const [, wf] of activeWorkflows) {
    if (wf.sessionId === sessionId && wf.status === 'active') {
      wf.status = 'abandoned';
      wf.updatedAt = Date.now();
    }
  }
}

// ── Periodic cleanup timer ──────────────────────────────────────────

let _cleanupTimer = null;

/**
 * Start periodic cleanup of stale orchestrations.
 * @param {number} [intervalMs=60000] — Cleanup interval (default 1 min)
 */
export function startCleanupTimer(intervalMs = 60_000) {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(() => {
    const cleaned = cleanupOrchestrations();
    if (cleaned > 0) {
      console.log(`[orchestrator] Cleaned up ${cleaned} stale orchestration(s)`);
    }
  }, intervalMs);
  // Unref so it doesn't keep the process alive
  if (_cleanupTimer.unref) _cleanupTimer.unref();
}

/**
 * Stop periodic cleanup.
 */
export function stopCleanupTimer() {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}
