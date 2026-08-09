(function() {
/**
 * CyberControl Snapshot Builder — assembles a validated PageSnapshot v2.
 *
 * Orchestrates:
 *  1. Gateway capture → structural facts
 *  2. Context discovery
 *  3. Node creation (factory + widget classification + privacy)
 *  4. Binding registration
 *  5. Edge derivation
 *  6. Canonical hash computation
 *  7. Schema validation
 *
 * Returns a complete, validated PageSnapshot or throws a perception error.
 */

/**
 * Build a full PageSnapshot v2.
 *
 * @param {object} options
 * @param {object} options.gateway — dom-gateway module
 * @param {object} options.revisionManager — RevisionManager instance
 * @param {object} options.bindingRegistry — BindingRegistry instance
 * @param {object} options.privacyFilter — privacy-filter module
 * @param {object} options.widgetClassifier — widget-classifier module
 * @param {object} options.contextDiscovery — context-discovery module
 * @param {object} options.nodeFactory — node-factory module
 * @param {object} options.edgeFactory — edge-factory module
 * @param {object} options.canonicalHash — canonical-hash module
 * @param {object} options.validator — validator module (must be initialized)
 * @param {Element|Document} [options.root] — root element (defaults to document)
 * @param {boolean} [options.includeGeometry=true]
 * @returns {Promise<object>} Validated PageSnapshot v2
 */
async function buildSnapshot(options) {
  const {
    gateway, revisionManager, bindingRegistry,
    privacyFilter, widgetClassifier, contextDiscovery,
    nodeFactory, edgeFactory, canonicalHash, validator,
  } = options;
  const root = options.root || (typeof document !== 'undefined' ? document : null);
  if (!root) throw new Error('buildSnapshot: no document available');

  const includeGeometry = options.includeGeometry !== false;
  const startTime = Date.now();

  // 1. Ensure we have a document lifecycle
  if (!revisionManager.currentDocumentId()) {
    revisionManager.newDocument();
  }
  const revision = revisionManager.nextRevision();
  const documentId = revisionManager.currentDocumentId();
  const snapshotId = revisionManager.newSnapshotId();

  // 2. Discover contexts
  const contexts = contextDiscovery.discoverContexts(gateway, documentId, revisionManager);
  const topContext = contexts[0]; // top_level is always first

  // 3. Capture structural facts via gateway
  const { nodes: rawFacts, liveElements, truncated, nodeCount } = gateway.captureStructuralFacts(root, {
    includeGeometry,
    maxNodes: 2000,
  });

  // 4. Build IR Nodes
  const nodesMap = {};
  const diagnostics = [];
  const parentStack = []; // maps raw fact index → node_id

  for (let i = 0; i < rawFacts.length; i++) {
    const fact = rawFacts[i];
    const parentNodeId = fact._parentIndex >= 0 ? parentStack[fact._parentIndex] : null;

    const node = nodeFactory.createNode(fact, topContext.context_id, parentNodeId, i, {
      privacyFilter,
      widgetClassifier,
    });

    nodesMap[node.node_id] = node;
    parentStack[i] = node.node_id;

    // Register binding: real live Element when available (browser), fallback for headless/test
    const liveRef = liveElements && liveElements[i] && liveElements[i].nodeType === 1
      ? liveElements[i]
      : { _factIndex: i };
    bindingRegistry.bind(topContext.context_id, node.node_id, liveRef, node.widget?.adapter_id || null, revision);
  }

  // Custom dropdowns commonly render bound <li> options without ARIA roles.
  // Radio groups expose bound radio inputs. Promote only descendants of a
  // recognized selection root; no selector or private binding crosses the IR.
  const promotedOptions = promoteSelectionOptions(rawFacts, parentStack, nodesMap);
  if (promotedOptions > 0) {
    diagnostics.push({
      code: 'selection_options_promoted',
      severity: 'info',
      node_id: null,
      message: `${promotedOptions} bound selection options represented in public IR`,
    });
  }

  // Set root_node_id on top context
  if (parentStack.length > 0) {
    topContext.root_node_id = parentStack[0];
  }

  // 5. Derive edges
  const edges = edgeFactory.deriveEdges(nodesMap, contexts);

  // 6. Assemble page metadata
  const page = {
    origin: typeof location !== 'undefined' ? location.origin : null,
    path: typeof location !== 'undefined' ? location.pathname : null,
    route_key: null,
    title: typeof document !== 'undefined' ? (document.title || '').slice(0, 160) : null,
    language: typeof document !== 'undefined' ? (document.documentElement?.lang || null) : null,
    viewport: typeof window !== 'undefined' ? {
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
      device_pixel_ratio: window.devicePixelRatio || 1,
      scroll_x: window.scrollX || 0,
      scroll_y: window.scrollY || 0,
    } : { width: 0, height: 0, device_pixel_ratio: 1, scroll_x: 0, scroll_y: 0 },
  };

  // 7. Page state
  const state = { signals: [], candidates: [] };

  // Truncation diagnostic
  if (truncated) {
    diagnostics.push({
      code: 'node_budget_exceeded',
      severity: 'warning',
      node_id: null,
      message: `Snapshot truncated at ${nodeCount} nodes (max 2000)`,
    });
  }

  // Timing diagnostic
  const durationMs = Date.now() - startTime;
  diagnostics.push({
    code: 'snapshot_timing',
    severity: durationMs > 250 ? 'warning' : 'info',
    node_id: null,
    message: `Snapshot captured in ${durationMs}ms`,
  });

  // 8. Assemble snapshot (without canonical_hash — computed next)
  const snapshot = {
    kind: 'page_snapshot',
    schema_version: '2.0.0',
    producer: {
      name: 'cybercontrol-browser-perception',
      version: '1.0.0',
      detectors: { 'dom-gateway': '1.0.0', 'widget-classifier': '1.0.0', 'edge-factory': '1.0.0' },
    },
    snapshot_id: snapshotId,
    document_id: documentId,
    revision,
    observed_at: new Date().toISOString(),
    canonical_hash: '', // placeholder
    page,
    contexts,
    nodes: nodesMap,
    edges,
    state,
    diagnostics,
    privacy: { classification: 'ordinary', redacted: false, reason: null },
  };

  // 9. Compute canonical hash
  snapshot.canonical_hash = await canonicalHash.computeCanonicalHash(snapshot);

  // 10. Validate
  const validation = validator.validateSnapshot(snapshot);
  if (!validation.valid) {
    const err = new Error(`PageSnapshot validation failed: ${(validation.errors || []).slice(0, 5).join('; ')}`);
    err.validationErrors = validation.errors;
    throw err;
  }

  return snapshot;
}

function promoteSelectionOptions(rawFacts, nodeIdsByIndex, nodesMap) {
  let promoted = 0;
  for (let index = 0; index < rawFacts.length; index++) {
    const fact = rawFacts[index];
    const node = nodesMap[nodeIdsByIndex[index]];
    if (!node || node.kind === 'option') continue;

    let ancestorIndex = fact._parentIndex;
    let selectionAncestor = null;
    while (ancestorIndex >= 0) {
      const ancestor = nodesMap[nodeIdsByIndex[ancestorIndex]];
      if (ancestor?.widget?.behavior_kind === 'selection') {
        selectionAncestor = ancestor;
        break;
      }
      ancestorIndex = rawFacts[ancestorIndex]?._parentIndex ?? -1;
    }
    if (!selectionAncestor) continue;

    const tag = String(fact.tag || '').toLowerCase();
    const role = String(fact.role || '').toLowerCase();
    const classes = String(fact.className || '').toLowerCase();
    const isRadioOption = tag === 'input' && String(fact.type || '').toLowerCase() === 'radio';
    const isLeafOption = fact.childElementCount === 0 && /(^|[\s_-])(option|item)([\s_-]|$)/.test(classes)
      && !/(options-list|option-container|option-group)/.test(classes);
    const optionLike = tag === 'li' || tag === 'option' || tag === 'mat-option'
      || role === 'option' || isRadioOption || isLeafOption;
    if (!optionLike || !(node.observed?.accessible_name || node.observed?.sanitized_text)) continue;

    node.kind = 'option';
    node.affordances = ['activate'];
    promoted++;
  }
  return promoted;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSnapshot };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcSnapshotBuilder = { buildSnapshot };
}

})();