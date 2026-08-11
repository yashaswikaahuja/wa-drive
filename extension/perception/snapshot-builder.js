/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
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

  // 3. Capture structural facts via gateway (+ parallel live Elements)
  const {
    nodes: rawFacts,
    liveElements,
    truncated,
    nodeCount,
  } = gateway.captureStructuralFacts(root, {
    includeGeometry,
    maxNodes: 2000,
  });

  // 4. Build IR Nodes
  const nodesMap = {};
  const diagnostics = [];
  const parentStack = []; // maps raw fact index → node_id
  /** Private observation aids for relationship derivation — never published on nodes. */
  const factMeta = {};

  // APE-IMPL-P1-01: continuity-aware binding. Do NOT wipe+rebind (that would
  // reset binding_generation to 1 and hide SPA replacements). Upsert: same
  // live element keeps generation; replaced live element advances generation
  // via rebind(); nodes that disappear are invalidated after the pass.
  const seenBindingKeys = new Set();

  for (let i = 0; i < rawFacts.length; i++) {
    const fact = rawFacts[i];
    const parentNodeId = fact._parentIndex >= 0 ? parentStack[fact._parentIndex] : null;

    const node = nodeFactory.createNode(fact, topContext.context_id, parentNodeId, i, {
      privacyFilter,
      widgetClassifier,
    });

    nodesMap[node.node_id] = node;
    parentStack[i] = node.node_id;

    factMeta[node.node_id] = {
      id: fact.id || null,
      domId: fact.id || null,
      tag: fact.tag || null,
      type: fact.type || null,
      labelledByIds: fact.labelledByIds || [],
      describedByIds: fact.describedByIds || [],
      controlsIds: fact.controlsIds || [],
      ownsIds: fact.ownsIds || [],
      errorMessageIds: fact.errorMessageIds || [],
      hasPopup: fact.hasPopup || null,
      htmlFor: fact.htmlFor || null,
    };

    // APE-P1-03: bind live Element only (never fact-index placeholder)
    const liveRef = liveElements && liveElements[i];
    if (liveRef && typeof liveRef.nodeType === 'number' && liveRef.nodeType === 1) {
      const ctxId = topContext.context_id;
      const adapterId = node.widget?.adapter_id || null;
      if (typeof bindingRegistry.upsert === 'function') {
        bindingRegistry.upsert(ctxId, node.node_id, liveRef, adapterId, revision);
      } else {
        const existing = bindingRegistry.resolve?.(ctxId, node.node_id);
        if (existing && existing.liveNodeReference !== liveRef && bindingRegistry.rebind) {
          bindingRegistry.rebind(ctxId, node.node_id, liveRef, { adapterId, createdRevision: revision });
        } else if (!existing) {
          bindingRegistry.bind(ctxId, node.node_id, liveRef, adapterId, revision);
        } else {
          existing.adapterId = adapterId;
          existing.createdRevision = revision;
        }
      }
      seenBindingKeys.add(`${ctxId}\0${node.node_id}`);
    }
  }

  // Drop bindings for nodes no longer present in this perception pass.
  if (bindingRegistry?.entries && bindingRegistry?.invalidateNode) {
    for (const entry of bindingRegistry.entries()) {
      const key = `${entry.contextId}\0${entry.nodeId}`;
      if (!seenBindingKeys.has(key)) {
        bindingRegistry.invalidateNode(entry.contextId, entry.nodeId);
      }
    }
  }

  // Set root_node_id on top context
  if (parentStack.length > 0) {
    topContext.root_node_id = parentStack[0];
  }

  // 5. Derive edges (relationships & structural semantics)
  const edges = edgeFactory.deriveEdges(nodesMap, contexts, { factMeta });

  // 6. Assemble page metadata — path is privacy-sanitized pathname (phase 3.5)
  let pagePath = typeof location !== 'undefined' ? location.pathname : null;
  let routeKey = null;
  let navContract = (typeof globalThis !== 'undefined' && globalThis.CcNavigationContract) || null;
  if (!navContract && typeof require !== 'undefined') {
    try { navContract = require('../runtime/navigation-contract.js'); } catch { /* browser inject */ }
  }
  if (navContract?.sanitizePagePath) {
    const raw = typeof location !== 'undefined' ? (location.pathname || location.href) : pagePath;
    const sanitized = navContract.sanitizePagePath(raw);
    pagePath = sanitized.path;
    if (sanitized.diagnostic) {
      diagnostics.push({
        code: sanitized.diagnostic,
        severity: 'info',
        node_id: null,
        message: 'page.path sanitized per navigation-understanding page_path_privacy',
      });
    }
    if (navContract.routeKeyFromPath) {
      routeKey = navContract.routeKeyFromPath(pagePath);
    }
  }
  const page = {
    origin: typeof location !== 'undefined' ? location.origin : null,
    path: pagePath,
    route_key: routeKey,
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
      detectors: { 'dom-gateway': '1.0.0', 'widget-classifier': '1.0.0', 'edge-factory': '2.0.0' },
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

  // 10. Schema validate
  const validation = validator.validateSnapshot(snapshot);
  if (!validation.valid) {
    const err = new Error(`PageSnapshot validation failed: ${(validation.errors || []).slice(0, 5).join('; ')}`);
    err.validationErrors = validation.errors;
    throw err;
  }

  // 11. Graph invariants (#131 / #130 P1)
  if (typeof validator.validateGraphInvariants === 'function') {
    const gi = validator.validateGraphInvariants(snapshot);
    if (!gi.valid) {
      const err = new Error(`PageSnapshot graph invariants failed: ${(gi.errors || []).slice(0, 5).join('; ')}`);
      err.validationErrors = gi.errors;
      throw err;
    }
  } else if (options.graphInvariants?.validateGraphInvariants) {
    const gi = options.graphInvariants.validateGraphInvariants(snapshot);
    if (!gi.valid) {
      const err = new Error(`PageSnapshot graph invariants failed: ${(gi.errors || []).slice(0, 5).join('; ')}`);
      err.validationErrors = gi.errors;
      throw err;
    }
  }

  return snapshot;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSnapshot };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcSnapshotBuilder = { buildSnapshot };
}
})();
