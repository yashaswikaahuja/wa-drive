/**
 * Phase 4.5 — Safe Bounded Static Execution
 *
 * Enforces server policy on STATIC plans:
 * 1. Hard max step limit (STATIC_MAX_STEPS)
 * 2. Dependency-closed subset: break batch after a cascade parent step
 *    (a step whose target is a source in a depends_on edge affecting later steps)
 *
 * If remaining fields exceed bound → plan is truncated with diagnostics
 * indicating remaining work requires another batch or dynamic turns.
 *
 * Architecture: Extension = Eyes + Hands; Server = Brain + Memory + Knowledge.
 * Server owns plan bounding policy; extension just executes what it receives.
 */

/**
 * Maximum steps per STATIC plan batch.
 * Configurable constant — default 12 per M4.5 spec recommendation.
 */
export const STATIC_MAX_STEPS = 12;

/**
 * Apply safe bounds to a STATIC plan.
 *
 * Rules applied in order:
 * 1. If a step is a cascade parent (its target.node_id is a `source_id` in a
 *    depends_on edge pointing to a later step's target), break the batch
 *    AFTER that step — remaining steps need re-perception post-cascade.
 * 2. Hard cap at STATIC_MAX_STEPS regardless.
 *
 * @param {object} params
 * @param {object[]} params.steps - The plan steps array
 * @param {object[]} params.edges - The snapshot edge graph (or [])
 * @param {number} [params.maxSteps] - Override max (for testing)
 * @returns {{
 *   steps: object[],
 *   bounded: boolean,
 *   original_count: number,
 *   bound_reason: string|null,
 *   cascade_break_at: number|null,
 *   remaining_count: number
 * }}
 */
export function applyStaticBounds({ steps, edges, maxSteps }) {
  const max = maxSteps ?? STATIC_MAX_STEPS;
  const originalCount = steps.length;

  if (!steps || steps.length === 0) {
    return {
      steps: [],
      bounded: false,
      original_count: 0,
      bound_reason: null,
      cascade_break_at: null,
      remaining_count: 0,
    };
  }

  // Build set of cascade source → target edges from snapshot
  const cascadeEdges = (edges || [])
    .filter(e => e.type === 'depends_on')
    .map(e => ({ source: e.source_id, target: e.target_id }));

  // Map: node_id → set of dependent node_ids
  const cascadeChildren = new Map();
  for (const edge of cascadeEdges) {
    if (!cascadeChildren.has(edge.source)) {
      cascadeChildren.set(edge.source, new Set());
    }
    cascadeChildren.get(edge.source).add(edge.target);
  }

  // Determine which step indices are cascade parents relative to later steps
  // A step at index i is a cascade parent if its target.node_id has dependents
  // among steps at index > i.
  const stepNodeIds = steps.map(s => s.target?.node_id);

  let cascadeBreakIndex = null;
  for (let i = 0; i < steps.length; i++) {
    const nodeId = stepNodeIds[i];
    const children = cascadeChildren.get(nodeId);
    if (!children) continue;

    // Check if any later step depends on this one
    for (let j = i + 1; j < steps.length; j++) {
      if (children.has(stepNodeIds[j])) {
        // This step is a cascade parent — break AFTER it
        cascadeBreakIndex = i;
        break;
      }
    }
    if (cascadeBreakIndex !== null) break;
  }

  // Apply bounds: cascade break takes priority if it's stricter than max
  let boundedSteps = steps;
  let boundReason = null;
  let cascadeBreakAt = null;

  if (cascadeBreakIndex !== null) {
    // Break after the cascade parent (include the parent step itself)
    const cascadeLimit = cascadeBreakIndex + 1;

    if (cascadeLimit < steps.length) {
      // Cascade break is meaningful (not the last step)
      if (cascadeLimit <= max) {
        // Cascade break is stricter than or equal to max
        boundedSteps = steps.slice(0, cascadeLimit);
        boundReason = 'cascade_parent_break';
        cascadeBreakAt = cascadeBreakIndex;
      } else {
        // Max is stricter — apply max but note cascade exists
        boundedSteps = steps.slice(0, max);
        boundReason = 'hard_max_before_cascade';
        cascadeBreakAt = cascadeBreakIndex;
      }
    } else {
      // Cascade parent is the last step anyway — just apply max
      if (steps.length > max) {
        boundedSteps = steps.slice(0, max);
        boundReason = 'hard_max_steps';
      }
    }
  } else {
    // No cascade parent — just apply hard max
    if (steps.length > max) {
      boundedSteps = steps.slice(0, max);
      boundReason = 'hard_max_steps';
    }
  }

  const bounded = boundedSteps.length < originalCount;
  return {
    steps: boundedSteps,
    bounded,
    original_count: originalCount,
    bound_reason: boundReason,
    cascade_break_at: cascadeBreakAt,
    remaining_count: originalCount - boundedSteps.length,
  };
}
