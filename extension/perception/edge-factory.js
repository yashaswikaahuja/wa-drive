/**
 * CyberControl Edge Factory — derives relationships between nodes.
 *
 * Produces Edge objects conforming to page-ir.schema.json.
 * Relationship types: contains, belongs_to_context, labels, describes,
 * error_for, controls, depends_on, validates, confirms, repeats,
 * activates, transitions_to, overlays, visually_groups_with
 */

let _edgeSeq = 0;

function generateEdgeId() {
  _edgeSeq += 1;
  return `edge.${_edgeSeq}`;
}

/**
 * Derive edges from a flat array of nodes and their contexts.
 *
 * @param {object} nodesMap — { [node_id]: Node }
 * @param {object[]} contexts — Context[] from context discovery
 * @returns {object[]} Edge[]
 */
function deriveEdges(nodesMap, contexts) {
  const edges = [];
  const nodes = Object.values(nodesMap);

  // 1. Containment edges (parent→child)
  for (const node of nodes) {
    if (node.parent_id) {
      edges.push(makeEdge('contains', node.parent_id, node.node_id, 'structural.parent_child'));
    }
  }

  // 2. belongs_to_context (each node → its context)
  for (const node of nodes) {
    const ctx = contexts.find((c) => c.context_id === node.context_id);
    if (ctx) {
      edges.push(makeEdge('belongs_to_context', node.node_id, ctx.context_id, 'structural.context_membership'));
    }
  }

  // 3. labels (label nodes → the controls they label)
  //    Heuristic: look at node order — a content node immediately before a control node
  //    with accessible_name matching the content's text is a label relationship.
  const nodeList = nodes.sort((a, b) => a.order - b.order);
  for (let i = 0; i < nodeList.length - 1; i++) {
    const current = nodeList[i];
    const next = nodeList[i + 1];
    if (current.kind === 'content' && next.kind === 'control' &&
        current.context_id === next.context_id &&
        current.observed.sanitized_text &&
        next.observed.accessible_name &&
        current.observed.sanitized_text.includes(next.observed.accessible_name.slice(0, 20))) {
      edges.push(makeEdge('labels', current.node_id, next.node_id, 'heuristic.adjacent_label'));
    }
  }

  // 4. error_for (validation messages → their target controls)
  const validationNodes = nodes.filter((n) => n.kind === 'validation_message');
  const controlNodes = nodes.filter((n) => n.kind === 'control');
  for (const vNode of validationNodes) {
    // Heuristic: closest preceding control in same context
    const sameCtxControls = controlNodes
      .filter((c) => c.context_id === vNode.context_id && c.order < vNode.order);
    if (sameCtxControls.length > 0) {
      const closest = sameCtxControls[sameCtxControls.length - 1];
      edges.push(makeEdge('error_for', vNode.node_id, closest.node_id, 'heuristic.adjacent_error'));
    }
  }

  return edges;
}

/**
 * Create a single Edge object.
 */
function makeEdge(type, sourceId, targetId, signal) {
  return {
    edge_id: generateEdgeId(),
    type,
    source_id: sourceId,
    target_id: targetId,
    evidence: [{
      source: 'derived',
      detector: 'edge-factory',
      detector_version: '1.0.0',
      confidence: signal.startsWith('structural') ? 1.0 : 0.7,
      facts: [signal],
    }],
  };
}

/**
 * Reset the edge sequence counter (for testing).
 */
function resetEdgeCounter() {
  _edgeSeq = 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deriveEdges, makeEdge, resetEdgeCounter };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcEdgeFactory = { deriveEdges };
}
