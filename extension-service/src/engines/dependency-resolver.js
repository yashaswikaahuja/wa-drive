// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Dependency Resolver — extension-service/dependency-resolver.js
// Phase 4.1 — Server Fill Planner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Topological sort for cascade fields (e.g. country → state → district).
// Ensures fields that depend on prior selections are filled in correct order.
//
// Uses Kahn's algorithm for deterministic, stable ordering.
// Detects cycles and reports them as planning errors.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} DependencyEdge
 * @property {string} source_node_id — The field that must be filled first
 * @property {string} target_node_id — The field that depends on source
 * @property {string} [dependency_type] — e.g. 'cascade', 'visibility', 'validation'
 */

/**
 * @typedef {object} ResolvedOrder
 * @property {string[]} sorted — Node IDs in topological fill order
 * @property {string[]} independent — Nodes with no dependencies (fillable in parallel)
 * @property {string[][]} levels — Nodes grouped by dependency depth
 * @property {string[]|null} cycle — Nodes involved in a cycle (null if no cycle)
 */

/**
 * Extract dependency edges from a PageSnapshot's edge graph.
 * Only `depends_on` edges are relevant for fill ordering.
 *
 * @param {object[]} edges — edges array from PageSnapshot
 * @returns {DependencyEdge[]}
 */
export function extractDependencyEdges(edges) {
  if (!Array.isArray(edges)) return [];
  return edges
    .filter(e => e.type === 'depends_on')
    .map(e => ({
      source_node_id: e.source_id,
      target_node_id: e.target_id,
      dependency_type: 'cascade',
    }));
}

/**
 * Perform topological sort on fill targets given dependency edges.
 * Uses Kahn's algorithm for stable, deterministic output.
 *
 * @param {string[]} nodeIds — All node IDs that need to be filled
 * @param {DependencyEdge[]} edges — Dependency relationships
 * @returns {ResolvedOrder}
 */
export function resolveOrder(nodeIds, edges) {
  const nodeSet = new Set(nodeIds);

  // Filter edges to only those involving our target nodes
  const relevantEdges = edges.filter(
    e => nodeSet.has(e.source_node_id) && nodeSet.has(e.target_node_id)
  );

  // Build adjacency list and in-degree map
  /** @type {Map<string, string[]>} */
  const adjacency = new Map();
  /** @type {Map<string, number>} */
  const inDegree = new Map();

  for (const id of nodeIds) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of relevantEdges) {
    // source must be filled before target
    const dependents = adjacency.get(edge.source_node_id);
    if (dependents) {
      dependents.push(edge.target_node_id);
    }
    inDegree.set(
      edge.target_node_id,
      (inDegree.get(edge.target_node_id) || 0) + 1
    );
  }

  // Kahn's algorithm
  const sorted = [];
  const levels = [];
  let queue = [];

  // Start with nodes that have no incoming edges
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  // Sort for deterministic output
  queue.sort();

  while (queue.length > 0) {
    levels.push([...queue]);
    const nextQueue = [];

    for (const node of queue) {
      sorted.push(node);
      const dependents = adjacency.get(node) || [];
      for (const dep of dependents) {
        const newDeg = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          nextQueue.push(dep);
        }
      }
    }

    nextQueue.sort();
    queue = nextQueue;
  }

  // Detect cycle: if we didn't process all nodes, there's a cycle
  let cycle = null;
  if (sorted.length < nodeIds.length) {
    cycle = nodeIds.filter(id => !sorted.includes(id));
  }

  // Independent nodes = first level (no dependencies)
  const independent = levels.length > 0 ? levels[0] : [];

  return { sorted, independent, levels, cycle };
}

/**
 * Build a dependency-aware ordering for a set of fill steps.
 * Combines snapshot edges with knowledge-store cascade hints.
 *
 * @param {string[]} targetNodeIds — Node IDs to be filled
 * @param {object[]} snapshotEdges — edges array from the PageSnapshot
 * @param {DependencyEdge[]} [knowledgeEdges] — Additional edges from knowledge store
 * @returns {ResolvedOrder}
 */
export function resolveFillOrder(targetNodeIds, snapshotEdges, knowledgeEdges = []) {
  const depEdges = [
    ...extractDependencyEdges(snapshotEdges),
    ...knowledgeEdges,
  ];
  return resolveOrder(targetNodeIds, depEdges);
}
