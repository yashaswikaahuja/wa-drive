// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Fill Planner — extension-service/fill-planner.js
// Phase 4.1 — Server Fill Planner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Main orchestrator: receives a PageSnapshot + workspaceId, resolves
// knowledge, computes fill values, and builds an ordered ActionPlan.
//
// Architecture (constitution.yml):
//   All planning, AI, knowledge interpretation, and learning happen here.
//   The extension only observes and executes.
//
// Flow:
//   1. Receive PageSnapshot + workspace context
//   2. Derive scope (portal_id, form_key) from snapshot metadata
//   3. Resolve field mappings via mapping-engine
//   4. Compute dependency order via dependency-resolver
//   5. Build ActionPlan via plan-builder
//   6. Create/update fill session
//   7. Return plan to extension for mechanical execution
//
// Does NOT own: DOM interaction, execution, perception, AI reasoning.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';
import { resolveAllMappings, FieldClassification } from './mapping-engine.js';
import { resolveFillOrder } from './dependency-resolver.js';
import { buildPlan, buildSupersedingPlan } from './plan-builder.js';
import {
  createSession,
  attachPlan,
  getSession,
  markStepStarted,
  markStepCompleted,
  markStepFailed,
  markStepSkipped,
  abortRemaining,
} from './fill-session.js';
import { deriveProfile } from './deriveProfile.js';

/**
 * @typedef {object} FillPlanRequest
 * @property {object} snapshot — Complete PageSnapshot (page-ir v2)
 * @property {string} workspace_id — Owning workspace
 * @property {string} phone — User phone (for profile derivation)
 * @property {string} person_key — Person key for profile lookup
 * @property {object} [profile_overrides] — Pre-resolved profile data (skips derivation)
 * @property {string} [supersedes_plan_id] — Plan being replaced (re-perception)
 * @property {string} [session_id] — Existing session to continue
 */

/**
 * @typedef {object} FillPlanResponse
 * @property {boolean} success
 * @property {object|null} plan — The ActionPlan (null if no fillable fields)
 * @property {string} session_id — Fill session tracking ID
 * @property {object} diagnostics — Planning diagnostics
 */

/**
 * Derive scope context from a PageSnapshot's metadata.
 * Extracts portal_id from origin, form_key from route_key or canonical_hash.
 *
 * @param {object} snapshot — PageSnapshot
 * @returns {{ portal_id: string|null, form_key: string|null, country: string|null }}
 */
export function deriveScope(snapshot) {
  const page = snapshot.page || {};

  // portal_id from origin hostname
  let portal_id = null;
  if (page.origin) {
    try {
      const url = new URL(page.origin);
      portal_id = url.hostname;
    } catch {
      portal_id = page.origin;
    }
  }

  // form_key from route_key (preferred) or canonical_hash
  const form_key = page.route_key || snapshot.canonical_hash || null;

  // country heuristic: from TLD or known Indian portals
  let country = null;
  if (portal_id) {
    if (portal_id.endsWith('.gov.in') || portal_id.endsWith('.nic.in')) {
      country = 'IN';
    } else if (portal_id.endsWith('.gov.uk')) {
      country = 'GB';
    } else if (portal_id.endsWith('.gov')) {
      country = 'US';
    }
  }

  return { portal_id, form_key, country };
}

/**
 * Validate that a snapshot has the required structure for planning.
 *
 * @param {object} snapshot
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot) {
    errors.push('snapshot is required');
    return { valid: false, errors };
  }

  if (snapshot.kind !== 'page_snapshot') {
    errors.push(`Expected kind=page_snapshot, got ${snapshot.kind}`);
  }

  if (!snapshot.document_id) errors.push('snapshot.document_id is required');
  if (!snapshot.snapshot_id) errors.push('snapshot.snapshot_id is required');
  if (snapshot.revision == null) errors.push('snapshot.revision is required');
  if (!snapshot.nodes || typeof snapshot.nodes !== 'object') {
    errors.push('snapshot.nodes is required and must be an object');
  }

  // Check page state — don't plan if page is loading
  if (snapshot.state?.signals?.includes('dom_loading')) {
    errors.push('Page is still loading (dom_loading signal present)');
  }
  if (snapshot.state?.signals?.includes('blocking_overlay')) {
    errors.push('Page has a blocking overlay');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a fill plan for a page snapshot.
 * This is the main entry point for the fill planner.
 *
 * @param {FillPlanRequest} request
 * @returns {Promise<FillPlanResponse>}
 */
export async function generateFillPlan(request) {
  const {
    snapshot, workspace_id, phone, person_key, profile_overrides, profile_id,
    candidate_mappings = [], supersedes_plan_id, session_id,
  } = request;

  const correlationId = `corr:${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const startTime = Date.now();

  // 1. Validate snapshot
  const validation = validateSnapshot(snapshot);
  if (!validation.valid) {
    return {
      success: false,
      plan: null,
      session_id: session_id || null,
      diagnostics: {
        correlation_id: correlationId,
        errors: validation.errors,
        phase: 'validation',
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // 2. Resolve profile data
  let profile;
  if (profile_overrides && Object.keys(profile_overrides).length > 0) {
    profile = profile_overrides;
  } else {
    try {
      profile = await deriveProfile(workspace_id, phone, person_key);
    } catch (err) {
      return {
        success: false,
        plan: null,
        session_id: session_id || null,
        diagnostics: {
          correlation_id: correlationId,
          errors: [`Profile derivation failed: ${err.message}`],
          phase: 'profile_resolution',
          duration_ms: Date.now() - startTime,
        },
      };
    }
  }

  if (!profile || Object.keys(profile).length === 0) {
    return {
      success: false,
      plan: null,
      session_id: session_id || null,
      diagnostics: {
        correlation_id: correlationId,
        errors: ['No profile data available for this person'],
        phase: 'profile_resolution',
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // 3. Derive scope from snapshot
  const scope = deriveScope(snapshot);

  // 4. Resolve field mappings
  let mappingResult;
  try {
    mappingResult = await resolveAllMappings(snapshot, profile, {
      portal_id: scope.portal_id,
      form_key: scope.form_key,
      organization_id: workspace_id,
      country: scope.country,
    }, { candidateMappings: candidate_mappings });
  } catch (err) {
    return {
      success: false,
      plan: null,
      session_id: session_id || null,
      diagnostics: {
        correlation_id: correlationId,
        errors: [`Mapping resolution failed: ${err.message}`],
        phase: 'mapping',
        duration_ms: Date.now() - startTime,
      },
    };
  }

  const { mappings, unmapped, excluded } = mappingResult;

  if (mappings.length === 0) {
    return {
      success: false,
      plan: null,
      session_id: session_id || null,
      diagnostics: {
        correlation_id: correlationId,
        errors: ['No fields could be mapped to profile data'],
        phase: 'mapping',
        unmapped_count: unmapped.length,
        unmapped_node_ids: unmapped,
        excluded_count: excluded.length,
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // 5. Resolve dependency ordering
  const targetNodeIds = mappings.map(m => m.node_id);
  const fillOrder = resolveFillOrder(
    targetNodeIds,
    snapshot.edges || [],
    [] // Additional knowledge-based edges can be added here
  );

  if (fillOrder.cycle) {
    // Cycle detected — log warning but continue with best-effort order
    console.warn(
      `[fill-planner] Dependency cycle detected for nodes: ${fillOrder.cycle.join(', ')}`
    );
  }

  // 6. Build the ActionPlan
  const planInput = {
    snapshot,
    mappings,
    correlationId,
    orderedNodeIds: fillOrder.sorted,
  };

  let plan;
  if (supersedes_plan_id) {
    plan = buildSupersedingPlan(planInput, supersedes_plan_id);
  } else {
    plan = buildPlan(planInput);
  }

  if (!plan) {
    return {
      success: false,
      plan: null,
      session_id: session_id || null,
      diagnostics: {
        correlation_id: correlationId,
        errors: ['No executable steps: mapped values were empty or concrete option targets were unavailable'],
        phase: 'plan_building',
        mapped_count: mappings.length,
        duration_ms: Date.now() - startTime,
      },
    };
  }

  // 7. Create or update fill session
  let fillSession;
  if (session_id) {
    fillSession = getSession(session_id);
    if (!fillSession) {
      // Create new if old session not found
      fillSession = createSession({
        workspace_id,
        document_id: snapshot.document_id,
        snapshot_id: snapshot.snapshot_id,
        correlation_id: correlationId,
        metadata: { portal_id: scope.portal_id, form_key: scope.form_key, profile_id: profile_id || null },
      });
    }
  } else {
    fillSession = createSession({
      workspace_id,
      document_id: snapshot.document_id,
      snapshot_id: snapshot.snapshot_id,
      correlation_id: correlationId,
      metadata: { portal_id: scope.portal_id, form_key: scope.form_key, profile_id: profile_id || null },
    });
  }

  // Attach plan to session, including server-private evidence links.
  const stepIds = plan.steps.map(s => s.step_id);
  const nodeIds = plan.steps.map(s => s.target.node_id);
  const mappingByNodeId = new Map(mappings.map(mapping => [mapping.node_id, mapping]));
  const stepMetadata = plan.steps.map(step => {
    const mapping = mappingByNodeId.get(step.target.node_id);
    const node = snapshot.nodes?.[step.target.node_id];
    const record = mapping?.mapping_record || null;
    return {
      context_id: step.target.context_id,
      label: node?.observed?.accessible_name || mapping?.semantic_key || step.target.node_id,
      semantic_key: mapping?.semantic_key || null,
      profile_key: mapping?.profile_key || null,
      knowledge_record_id: record?.id || null,
      mapping_lineage_id: record?.lineage_id || null,
      mapping_version: record?.version || null,
      mapping_source: record?.source?.origin || null,
      mapping_status: record?.status || null,
      mapping_confidence: record?.confidence ?? null,
      mapping_scope: record?.scope || null,
      mapping_disposition: mapping?.mapping_disposition || null,
      mapping_matched_pattern: mapping?.matched_pattern || null,
      mapping_match_score: mapping?.match_score ?? null,
      mapping_match_patterns: Array.isArray(record?.payload?.match_patterns)
        ? record.payload.match_patterns.slice(0, 50)
        : [],
      transformation: mapping?.transformation || 'direct',
      action_op: step.action.op,
      risk: step.risk,
    };
  });
  attachPlan(fillSession.session_id, plan.plan_id, plan.steps.length, stepIds, nodeIds, stepMetadata);

  return {
    success: true,
    plan,
    session_id: fillSession.session_id,
    diagnostics: {
      correlation_id: correlationId,
      phase: 'complete',
      mapped_count: mappings.length,
      unmapped_count: unmapped.length,
      unmapped_node_ids: unmapped,
      excluded_count: excluded.length,
      step_count: plan.steps.length,
      dependency_levels: fillOrder.levels.length,
      has_cycle: fillOrder.cycle !== null,
      scope,
      duration_ms: Date.now() - startTime,
    },
  };
}

/**
 * Handle an execution observation from the extension.
 * Updates the fill session with step results.
 *
 * @param {string} session_id — The fill session ID
 * @param {object} observation — ExecutionObservation from the extension
 * @returns {{ acknowledged: boolean, session_status: string }}
 */
export function handleObservation(session_id, observation) {
  const session = getSession(session_id);
  if (!session) {
    return { acknowledged: false, session_status: 'not_found' };
  }

  const stepResults = observation.step_results || [];
  for (const result of stepResults) {
    if (result.status === 'started') {
      markStepStarted(session_id, result.step_id);
    } else if (result.status === 'completed') {
      markStepCompleted(session_id, result.step_id);
    } else if (result.status === 'failed') {
      markStepFailed(session_id, result.step_id, result.error_code || 'unknown');
      // Check on_failure policy
      if (result.on_failure === 'abort_plan') {
        abortRemaining(session_id);
        break;
      }
    } else if (result.status === 'skipped') {
      markStepSkipped(session_id, result.step_id);
    }
  }

  const updated = getSession(session_id);
  return {
    acknowledged: true,
    session_status: updated?.status || 'unknown',
  };
}
