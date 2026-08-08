// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Plan Builder — extension-service/plan-builder.js
// Phase 4.1 — Server Fill Planner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Constructs ActionPlan v3 conforming to architecture/action-plan.schema.json.
// Orders steps by dependency, assigns risk levels, sets postconditions.
//
// Responsibilities:
//   - Build a valid ActionPlan envelope with target_binding
//   - Convert MappingResults into ordered ActionSteps
//   - Assign risk levels (safe / reversible / irreversible)
//   - Set postconditions for verification
//   - Enforce plan expiry and correlation
//
// Does NOT own: mapping resolution, dependency graph, session state.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { randomUUID } from 'node:crypto';
import { resolveFillOrder } from './dependency-resolver.js';

/** ActionPlan schema version. */
const SCHEMA_VERSION = '3.0.0';

/** Default plan TTL in milliseconds (5 minutes). */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Maximum steps per plan. */
const MAX_STEPS = 500;

/**
 * Generate a schema-compliant identifier.
 * Format: prefix + UUID segment (alphanumeric with dots/colons).
 *
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix) {
  const uuid = randomUUID().replace(/-/g, '');
  return `${prefix}:${uuid.slice(0, 24)}`;
}

/**
 * @typedef {import('./mapping-engine.js').MappingResult} MappingResult
 */

/**
 * @typedef {object} PlanBuildInput
 * @property {object} snapshot — The PageSnapshot this plan targets
 * @property {MappingResult[]} mappings — Resolved field mappings with values
 * @property {string} correlationId — Request correlation token
 * @property {string[]} orderedNodeIds — Dependency-sorted node IDs
 * @property {object} [authorization] — Override authorization settings
 * @property {number} [ttlMs] — Plan time-to-live in milliseconds
 */

/**
 * @typedef {object} ActionPlan
 * @property {'action_plan'} kind
 * @property {'3.0.0'} schema_version
 * @property {string} plan_id
 * @property {string} correlation_id
 * @property {string|null} supersedes_plan_id
 * @property {string} issued_at
 * @property {string} expires_at
 * @property {object} target_binding
 * @property {object[]} steps
 * @property {object} authorization
 */

/**
 * Determine the risk level for a fill step based on field characteristics.
 *
 * @param {MappingResult} mapping — The resolved mapping
 * @param {object} node — The snapshot node
 * @returns {'safe'|'reversible'|'irreversible'}
 */
export function assessRisk(mapping, node) {
  // File uploads are irreversible (can't un-upload)
  const affordances = node?.affordances || [];
  if (affordances.includes('upload')) return 'irreversible';

  // Toggles that submit (e.g. terms checkbox near submit button) are reversible
  if (affordances.includes('toggle')) return 'reversible';

  // Select fields are reversible (can re-select)
  if (affordances.includes('select_one') || affordances.includes('select_many')) {
    return 'reversible';
  }

  // Text entry is safe (can be cleared and re-typed)
  if (affordances.includes('type_text')) return 'safe';

  // Default to reversible for unknown
  return 'reversible';
}

/**
 * Build a postcondition for a fill step.
 *
 * @param {MappingResult} mapping — The resolved mapping
 * @param {object} node — The snapshot node
 * @returns {object} — Postcondition conforming to schema
 */
export function buildPostcondition(mapping, node) {
  const affordances = node?.affordances || [];

  if (affordances.includes('type_text')) {
    return {
      type: 'value_state',
      expected_value_state: 'nonempty',
      expected_boolean: null,
      expected_signal: null,
    };
  }

  if (affordances.includes('select_one') || affordances.includes('select_many')) {
    return {
      type: 'value_state',
      expected_value_state: 'selected',
      expected_boolean: null,
      expected_signal: null,
    };
  }

  if (affordances.includes('toggle')) {
    return {
      type: 'checked',
      expected_value_state: null,
      expected_boolean: true,
      expected_signal: null,
    };
  }

  // Default: just check something happened
  return {
    type: 'none',
    expected_value_state: null,
    expected_boolean: null,
    expected_signal: null,
  };
}

/**
 * Build the action object for a fill step.
 *
 * @param {MappingResult} mapping — The resolved mapping
 * @param {object} node — The snapshot node
 * @returns {object} — Action conforming to schema union
 */
export function buildAction(mapping, node) {
  const affordances = node?.affordances || [];

  if (affordances.includes('type_text')) {
    return {
      op: 'type_text',
      value: mapping.value || '',
      clear_first: true,
    };
  }

  if (affordances.includes('select_one')) {
    // For select fields, we need an option_target — this requires the option node.
    // The fill planner must resolve the option node_id separately.
    // For now, produce a placeholder that the planner populates.
    return {
      op: 'select_option',
      option_target: {
        context_id: mapping.context_id,
        node_id: `option:${mapping.node_id}:pending`,
      },
    };
  }

  if (affordances.includes('toggle')) {
    return {
      op: 'toggle',
      desired_state: true,
    };
  }

  // Fallback to type_text
  return {
    op: 'type_text',
    value: mapping.value || '',
    clear_first: true,
  };
}

/**
 * Determine the required affordance for a step.
 *
 * @param {object} node — The snapshot node
 * @returns {string|null}
 */
function requiredAffordance(node) {
  const affordances = node?.affordances || [];
  if (affordances.includes('type_text')) return 'type_text';
  if (affordances.includes('select_one')) return 'select_one';
  if (affordances.includes('select_many')) return 'select_many';
  if (affordances.includes('toggle')) return 'toggle';
  if (affordances.includes('upload')) return 'upload';
  return null;
}

/**
 * Build a complete ActionPlan v3 from resolved mappings.
 *
 * @param {PlanBuildInput} input
 * @returns {ActionPlan}
 */
export function buildPlan(input) {
  const { snapshot, mappings, correlationId, orderedNodeIds, authorization, ttlMs } = input;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (ttlMs || DEFAULT_TTL_MS));

  // Build target binding from snapshot
  const targetBinding = {
    document_id: snapshot.document_id,
    snapshot_id: snapshot.snapshot_id,
    expected_revision: snapshot.revision,
  };

  // Create a lookup for quick node access
  const nodeMap = snapshot.nodes || {};

  // Order mappings by dependency-resolved order
  const orderedMappings = orderMappings(mappings, orderedNodeIds);

  // Build steps (limit to MAX_STEPS)
  const steps = [];
  for (const mapping of orderedMappings.slice(0, MAX_STEPS)) {
    if (!mapping.value) continue; // Skip mappings without resolved values

    const node = nodeMap[mapping.node_id];
    if (!node) continue;

    const step = {
      step_id: generateId('step'),
      target: {
        context_id: mapping.context_id,
        node_id: mapping.node_id,
      },
      action: buildAction(mapping, node),
      risk: assessRisk(mapping, node),
      required_affordance: requiredAffordance(node),
      required_adapter_id: node.widget?.adapter_id || null,
      postcondition: buildPostcondition(mapping, node),
      on_failure: 'stop_and_report',
    };

    steps.push(step);
  }

  // If no steps can be built, return a minimal plan
  if (steps.length === 0) {
    return null;
  }

  // Determine max risk across all steps
  const riskOrder = { safe: 0, reversible: 1, irreversible: 2 };
  const maxRisk = steps.reduce((max, step) => {
    return riskOrder[step.risk] > riskOrder[max] ? step.risk : max;
  }, 'safe');

  const plan = {
    kind: 'action_plan',
    schema_version: SCHEMA_VERSION,
    plan_id: generateId('plan'),
    correlation_id: correlationId,
    supersedes_plan_id: null,
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    target_binding: targetBinding,
    steps,
    authorization: authorization || {
      max_risk: maxRisk,
      operator_confirmed: false,
      allow_navigation: false,
      allow_submit: false,
    },
  };

  return plan;
}

/**
 * Order mappings according to the dependency-resolved node order.
 * Mappings not in the ordered list go to the end (stable order).
 *
 * @param {MappingResult[]} mappings
 * @param {string[]} orderedNodeIds
 * @returns {MappingResult[]}
 */
function orderMappings(mappings, orderedNodeIds) {
  if (!orderedNodeIds || orderedNodeIds.length === 0) {
    return mappings;
  }

  const orderIndex = new Map();
  orderedNodeIds.forEach((id, idx) => orderIndex.set(id, idx));

  return [...mappings].sort((a, b) => {
    const aIdx = orderIndex.get(a.node_id) ?? Number.MAX_SAFE_INTEGER;
    const bIdx = orderIndex.get(b.node_id) ?? Number.MAX_SAFE_INTEGER;
    return aIdx - bIdx;
  });
}

/**
 * Build a superseding plan that replaces an existing plan.
 * Used after re-perception when the original plan became stale.
 *
 * @param {PlanBuildInput} input
 * @param {string} supersededPlanId — The plan_id being replaced
 * @returns {ActionPlan|null}
 */
export function buildSupersedingPlan(input, supersededPlanId) {
  const plan = buildPlan(input);
  if (!plan) return null;
  plan.supersedes_plan_id = supersededPlanId;
  return plan;
}
