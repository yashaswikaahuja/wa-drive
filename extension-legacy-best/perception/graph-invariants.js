/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Graph Invariants — Phase 3.3 / issue #131
 *
 * Machine-checkable relationship rules (page-ir.yml validation.graph_invariants
 * + #130 P1 conditions). Pure functions; no DOM.
 *
 * Authority:
 *   - parent_id is authoritative for single-parent containment
 *   - contains edges MUST mirror parent_id exactly (one contains edge per child)
 *   - No business-semantic depends_on in browser perception
 *   - transitions_to targets MUST exist as nodes in the same snapshot
 */

const EDGE_TYPES_REQUIRING_NODE_TARGET = new Set([
  'contains', 'labels', 'describes', 'error_for', 'controls', 'depends_on',
  'validates', 'confirms', 'repeats', 'activates', 'transitions_to',
  'overlays', 'visually_groups_with',
]);

/**
 * Validate graph invariants on a PageSnapshot-like object.
 *
 * @param {object} snapshot — { nodes, edges, contexts }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGraphInvariants(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, errors: ['snapshot is not an object'] };
  }

  const nodesMap = normalizeNodesMap(snapshot.nodes);
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  const contexts = Array.isArray(snapshot.contexts) ? snapshot.contexts : [];
  const contextIds = new Set(contexts.map((c) => c && c.context_id).filter(Boolean));
  const nodeIds = new Set(Object.keys(nodesMap));

  // Unique edge_ids
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!edge || !edge.edge_id) {
      errors.push('edge missing edge_id');
      continue;
    }
    if (edgeIds.has(edge.edge_id)) {
      errors.push(`duplicate edge_id: ${edge.edge_id}`);
    }
    edgeIds.add(edge.edge_id);
  }

  // Context ownership: every node.context_id must exist
  for (const [id, node] of Object.entries(nodesMap)) {
    if (!node.context_id || !contextIds.has(node.context_id)) {
      errors.push(`node ${id} has unknown context_id ${node.context_id}`);
    }
    if (node.parent_id != null && !nodeIds.has(node.parent_id)) {
      errors.push(`node ${id} parent_id ${node.parent_id} does not resolve`);
    }
  }

  // Edge endpoint resolution + type rules
  for (const edge of edges) {
    if (!edge) continue;
    const type = edge.type;
    const src = edge.source_id;
    const tgt = edge.target_id;

    if (type === 'belongs_to_context') {
      if (!nodeIds.has(src)) errors.push(`belongs_to_context source ${src} is not a node`);
      if (!contextIds.has(tgt)) errors.push(`belongs_to_context target ${tgt} is not a context`);
      continue;
    }

    if (EDGE_TYPES_REQUIRING_NODE_TARGET.has(type) || type) {
      if (!nodeIds.has(src)) errors.push(`edge ${edge.edge_id} source ${src} does not resolve`);
      if (!nodeIds.has(tgt)) errors.push(`edge ${edge.edge_id} target ${tgt} does not resolve`);
    }

    // P1-03: never allow business depends_on in browser perception output
    if (type === 'depends_on') {
      errors.push(`depends_on is forbidden in browser perception (edge ${edge.edge_id})`);
    }

    // P1-04: no dangling transitions_to (target must be a node — already checked)
    if (type === 'transitions_to' && tgt && !nodeIds.has(tgt)) {
      errors.push(`dangling transitions_to target ${tgt}`);
    }

    // Cross-context edges only when both nodes share context or structural contains within tree
    if (EDGE_TYPES_REQUIRING_NODE_TARGET.has(type) && nodeIds.has(src) && nodeIds.has(tgt)) {
      const a = nodesMap[src];
      const b = nodesMap[tgt];
      if (a && b && a.context_id && b.context_id && a.context_id !== b.context_id && type !== 'contains') {
        // Allow only if both contexts are accessible — still flag non-structural cross-context
        const ca = contexts.find((c) => c.context_id === a.context_id);
        const cb = contexts.find((c) => c.context_id === b.context_id);
        if (ca?.access === 'cross_origin' || cb?.access === 'cross_origin' ||
            ca?.access === 'closed_shadow' || cb?.access === 'closed_shadow') {
          errors.push(`edge ${edge.edge_id} crosses inaccessible context boundary`);
        }
      }
    }
  }

  // parent_id ↔ contains consistency (P1-01 / P1-02)
  const containsByChild = new Map(); // child -> [parents]
  for (const edge of edges) {
    if (edge?.type !== 'contains') continue;
    if (!containsByChild.has(edge.target_id)) containsByChild.set(edge.target_id, []);
    containsByChild.get(edge.target_id).push(edge.source_id);
  }

  for (const [id, node] of Object.entries(nodesMap)) {
    const parents = containsByChild.get(id) || [];
    if (node.parent_id == null) {
      if (parents.length > 0) {
        errors.push(`root node ${id} has contains edge(s) but parent_id is null`);
      }
    } else {
      if (parents.length === 0) {
        errors.push(`node ${id} has parent_id ${node.parent_id} but no contains edge`);
      } else if (parents.length > 1) {
        errors.push(`node ${id} has multiple contains parents: ${parents.join(',')}`);
      } else if (parents[0] !== node.parent_id) {
        errors.push(`node ${id} contains parent ${parents[0]} !== parent_id ${node.parent_id}`);
      }
    }
  }

  // Extra contains edges for unknown children
  for (const [child, parents] of containsByChild) {
    if (!nodeIds.has(child)) {
      errors.push(`contains targets unknown node ${child}`);
    }
    for (const p of parents) {
      if (!nodeIds.has(p)) errors.push(`contains source unknown node ${p}`);
    }
  }

  // Containment acyclicity
  const cycleErrors = findContainmentCycles(nodesMap);
  errors.push(...cycleErrors);

  // Evidence required on every edge
  for (const edge of edges) {
    if (!edge) continue;
    if (!Array.isArray(edge.evidence) || edge.evidence.length === 0) {
      errors.push(`edge ${edge.edge_id} missing evidence`);
    } else {
      for (const ev of edge.evidence) {
        if (!ev.source || !ev.detector || !ev.detector_version || typeof ev.confidence !== 'number') {
          errors.push(`edge ${edge.edge_id} evidence incomplete`);
        }
        if (ev.confidence < 0 || ev.confidence > 1) {
          errors.push(`edge ${edge.edge_id} evidence confidence out of range`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function normalizeNodesMap(nodes) {
  if (!nodes) return {};
  if (Array.isArray(nodes)) {
    const map = {};
    for (const n of nodes) {
      if (n?.node_id) map[n.node_id] = n;
    }
    return map;
  }
  return nodes;
}

function findContainmentCycles(nodesMap) {
  const errors = [];
  const visiting = new Set();
  const visited = new Set();

  function dfs(id, path) {
    if (visiting.has(id)) {
      errors.push(`containment cycle involving ${path.concat(id).join(' → ')}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const node = nodesMap[id];
    if (node?.parent_id && nodesMap[node.parent_id]) {
      dfs(node.parent_id, path.concat(id));
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of Object.keys(nodesMap)) {
    dfs(id, []);
  }
  return errors;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateGraphInvariants };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcGraphInvariants = { validateGraphInvariants };
}
})();
