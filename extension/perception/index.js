/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';
/**
 * CyberControl Perception Entry Point — perceivePage() public API.
 *
 * Consumers call perceivePage() to get a validated PageSnapshot v2 or PageDelta.
 * Execution resolves targets via BindingRegistry + last snapshot (ActionPlan v3).
 */

let _gateway, _revisionManager, _bindingRegistry, _privacyFilter;
let _widgetClassifier, _contextDiscovery, _nodeFactory, _edgeFactory;
let _canonicalHash, _validator, _snapshotBuilder, _deltaEmitterClass;
let _initialized = false;
let _deltaEmitter = null;
/** @type {object|null} Last published PageSnapshot (for execution target checks). */
let _lastSnapshot = null;
/**
 * Private authorship generations captured at perception publish.
 * Map key: `${context_id}\0${node_id}` → binding_generation at publish time.
 * Browser-private: never serialized, never sent to the service.
 * APE-IMPL-P1-01 / perception-lifecycle rebinding_continuity.
 */
let _authorshipGenerations = new Map();
/** @type {{documentId: string|null, snapshotId: string|null, revision: number}|null} */
let _authorshipMeta = null;

function _captureAuthorshipGenerations() {
  _authorshipGenerations = new Map();
  _authorshipMeta = {
    documentId: _revisionManager?.currentDocumentId?.() || _lastSnapshot?.document_id || null,
    snapshotId: _lastSnapshot?.snapshot_id || null,
    revision: _revisionManager?.currentRevision?.() ?? _lastSnapshot?.revision ?? -1,
  };
  if (!_bindingRegistry?.entries) return;
  for (const entry of _bindingRegistry.entries()) {
    _authorshipGenerations.set(
      `${entry.contextId}\0${entry.nodeId}`,
      entry.bindingGeneration
    );
  }
}

function _authorshipKey(contextId, nodeId) {
  return `${contextId}\0${nodeId}`;
}

/**
 * Initialize the perception system. Call once after all modules are loaded.
 * @param {object} modules — dependency injection for testability
 */
async function initPerception(modules = {}) {
  if (_initialized) return;

  _gateway = modules.gateway || (typeof CcDomGateway !== 'undefined' ? CcDomGateway : null);
  _bindingRegistry = modules.bindingRegistry || (typeof CcBindingRegistry !== 'undefined' ? new CcBindingRegistry() : null);
  _privacyFilter = modules.privacyFilter || (typeof CcPrivacyFilter !== 'undefined' ? CcPrivacyFilter : null);
  _widgetClassifier = modules.widgetClassifier || (typeof CcWidgetClassifier !== 'undefined' ? CcWidgetClassifier : null);
  _contextDiscovery = modules.contextDiscovery || (typeof CcContextDiscovery !== 'undefined' ? CcContextDiscovery : null);
  _nodeFactory = modules.nodeFactory || (typeof CcNodeFactory !== 'undefined' ? CcNodeFactory : null);
  _edgeFactory = modules.edgeFactory || (typeof CcEdgeFactory !== 'undefined' ? CcEdgeFactory : null);
  _canonicalHash = modules.canonicalHash || (typeof CcCanonicalHash !== 'undefined' ? CcCanonicalHash : null);
  _snapshotBuilder = modules.snapshotBuilder || (typeof CcSnapshotBuilder !== 'undefined' ? CcSnapshotBuilder : null);
  _validator = modules.validator || (typeof CcValidator !== 'undefined' ? CcValidator : null);
  _deltaEmitterClass = modules.deltaEmitterClass || (typeof CcDeltaEmitter !== 'undefined' ? CcDeltaEmitter : null);

  if (modules.revisionManager) {
    _revisionManager = modules.revisionManager;
  } else if (typeof CcRevisionManager !== 'undefined') {
    _revisionManager = new CcRevisionManager();
  }

  if (_validator && !_validator.isInitialized()) {
    if (modules.validatorOptions) {
      await _validator.initValidator(modules.validatorOptions);
    }
  }

  _initialized = true;
}

/**
 * Produce a PageSnapshot or PageDelta.
 */
async function perceivePage(options = {}) {
  if (!_initialized) throw new Error('Perception not initialized. Call initPerception() first.');

  const mode = options.mode || 'snapshot';

  if (mode === 'snapshot') {
    _lastSnapshot = await _snapshotBuilder.buildSnapshot({
      gateway: _gateway,
      revisionManager: _revisionManager,
      bindingRegistry: _bindingRegistry,
      privacyFilter: _privacyFilter,
      widgetClassifier: _widgetClassifier,
      contextDiscovery: _contextDiscovery,
      nodeFactory: _nodeFactory,
      edgeFactory: _edgeFactory,
      canonicalHash: _canonicalHash,
      validator: _validator,
      root: options.root,
      includeGeometry: options.includeGeometry,
    });
    // Capture private binding generations for this published revision.
    _captureAuthorshipGenerations();
    return _lastSnapshot;
  }

  if (mode === 'delta') {
    if (!_deltaEmitter || !_deltaEmitter.getBaseSnapshot()) {
      throw new Error('Delta mode requires an active delta observer. Call startDeltaObserver() first.');
    }
    const base = _deltaEmitter.getBaseSnapshot();
    const newSnapshot = await _snapshotBuilder.buildSnapshot({
      gateway: _gateway,
      revisionManager: _revisionManager,
      bindingRegistry: _bindingRegistry,
      privacyFilter: _privacyFilter,
      widgetClassifier: _widgetClassifier,
      contextDiscovery: _contextDiscovery,
      nodeFactory: _nodeFactory,
      edgeFactory: _edgeFactory,
      canonicalHash: _canonicalHash,
      validator: _validator,
      root: options.root,
      includeGeometry: options.includeGeometry,
    });
    if (newSnapshot.canonical_hash === base.canonical_hash) return null;
    _deltaEmitter.setBaseSnapshot(newSnapshot);
    _lastSnapshot = newSnapshot;
    _captureAuthorshipGenerations();
    return newSnapshot;
  }

  throw new Error(`Unknown perception mode: ${mode}`);
}

function resetPerception() {
  if (_deltaEmitter) { _deltaEmitter.stop(); _deltaEmitter = null; }
  _lastSnapshot = null;
  _authorshipGenerations = new Map();
  _authorshipMeta = null;
  if (_bindingRegistry) _bindingRegistry.invalidateAll();
  if (_revisionManager) _revisionManager.onFullNavigation();
}

function startDeltaObserver(baseSnapshot, options = {}) {
  if (!_initialized) throw new Error('Perception not initialized.');
  if (!_deltaEmitterClass) throw new Error('DeltaEmitter class not available.');
  if (_deltaEmitter) _deltaEmitter.stop();

  _deltaEmitter = new _deltaEmitterClass({
    gateway: _gateway,
    revisionManager: _revisionManager,
    bindingRegistry: _bindingRegistry,
    snapshotBuilder: _snapshotBuilder,
    canonicalHash: _canonicalHash,
    validator: _validator,
    nodeFactory: _nodeFactory,
    edgeFactory: _edgeFactory,
    privacyFilter: _privacyFilter,
    widgetClassifier: _widgetClassifier,
    contextDiscovery: _contextDiscovery,
  }, {
    onDelta: (result) => {
      // After delta/snapshot emission, registry has continuity-aware generations.
      // Publish authorship gens from the complete resulting snapshot so old plans
      // against the prior revision fail (revision + generation), and new plans
      // capture the post-rebind generations.
      const published = _deltaEmitter?.getBaseSnapshot?.() || (result?.kind === 'page_snapshot' ? result : null);
      if (published?.kind === 'page_snapshot') {
        _lastSnapshot = published;
        _captureAuthorshipGenerations();
      }
      if (typeof options.onDelta === 'function') options.onDelta(result);
    },
    onError: options.onError || null,
    coalesceMs: options.coalesceMs,
    settleMs: options.settleMs,
  });

  _deltaEmitter.start(baseSnapshot, options.root);
}

function stopDeltaObserver() {
  if (_deltaEmitter) { _deltaEmitter.stop(); _deltaEmitter = null; }
}

/**
 * Resolve ActionPlan target only when bound to the exact published
 * document/snapshot/revision and authorship binding_generation.
 * No selector or semantic fallback. Never silently rebinds.
 * APE-P1-04 / APE-P1-05 / APE-IMPL-P1-01
 */
function resolveExecutionTarget(targetBinding, target, requirements = {}) {
  if (!_initialized || !_bindingRegistry || !_revisionManager || !_lastSnapshot) {
    return { element: null, error: 'stale_snapshot' };
  }
  if (_revisionManager.currentDocumentId() !== targetBinding?.document_id) {
    return { element: null, error: 'document_replaced' };
  }
  if (
    _lastSnapshot.snapshot_id !== targetBinding?.snapshot_id ||
    _revisionManager.currentRevision() !== targetBinding?.expected_revision
  ) {
    return { element: null, error: 'stale_snapshot' };
  }

  // Authorship generation table must match the published revision the plan targets.
  if (
    !_authorshipMeta ||
    _authorshipMeta.documentId !== targetBinding.document_id ||
    _authorshipMeta.snapshotId !== targetBinding.snapshot_id ||
    _authorshipMeta.revision !== targetBinding.expected_revision
  ) {
    return { element: null, error: 'stale_snapshot' };
  }

  const node = _lastSnapshot.nodes?.[target?.node_id];
  if (!node || node.context_id !== target?.context_id) {
    return { element: null, error: 'stale_target' };
  }
  if (requirements.requiredAffordance && !(node.affordances || []).includes(requirements.requiredAffordance)) {
    return { element: null, error: 'affordance_mismatch' };
  }
  const perceivedAdapter = node.widget?.adapter_id || null;
  if (requirements.requiredAdapterId && perceivedAdapter !== requirements.requiredAdapterId) {
    return { element: null, error: 'adapter_mismatch' };
  }
  // Unsupported widgets must not receive mutations
  if (node.widget?.status === 'unsupported' || node.widget?.status === 'inaccessible') {
    if (requirements.requiredAffordance && requirements.requiredAffordance !== 'focus') {
      return { element: null, error: 'action_unsupported' };
    }
  }

  const expectedGeneration = _authorshipGenerations.get(
    _authorshipKey(target.context_id, target.node_id)
  );
  if (expectedGeneration == null) {
    return { element: null, error: 'stale_target' };
  }

  // Generation-aware binding resolution (gateway-security TOCTOU).
  if (_gateway?.resolveBinding) {
    const resolved = _gateway.resolveBinding(
      target.context_id,
      target.node_id,
      _bindingRegistry,
      expectedGeneration
    );
    if (resolved.error || !resolved.element) {
      return { element: null, error: resolved.error || 'stale_target' };
    }
    const entry = _bindingRegistry.resolve(target.context_id, target.node_id);
    if (!entry || entry.createdRevision !== targetBinding.expected_revision) {
      return { element: null, error: 'stale_target' };
    }
    if (requirements.requiredAdapterId && entry.adapterId !== requirements.requiredAdapterId) {
      return { element: null, error: 'adapter_mismatch' };
    }
    // Reject fact-index placeholders
    const element = resolved.element;
    if (
      typeof element.nodeType !== 'number' ||
      element.nodeType !== 1 ||
      (element._factIndex != null && !element.tagName)
    ) {
      if (_bindingRegistry.invalidateNode) {
        _bindingRegistry.invalidateNode(target.context_id, target.node_id);
      }
      return { element: null, error: 'stale_target' };
    }
    return {
      element,
      error: null,
      adapterId: entry.adapterId,
      bindingGeneration: entry.bindingGeneration,
      expectedGeneration,
    };
  }

  // Fallback when gateway resolveBinding is unavailable (should not happen in product path).
  const entry = _bindingRegistry.resolve(target.context_id, target.node_id);
  if (!entry || entry.createdRevision !== targetBinding.expected_revision) {
    return { element: null, error: 'stale_target' };
  }
  if (entry.bindingGeneration !== expectedGeneration) {
    return { element: null, error: 'stale_target' };
  }
  if (requirements.requiredAdapterId && entry.adapterId !== requirements.requiredAdapterId) {
    return { element: null, error: 'adapter_mismatch' };
  }

  const element = entry.liveNodeReference;
  if (
    !element ||
    typeof element.nodeType !== 'number' ||
    element.nodeType !== 1 ||
    !element.isConnected ||
    element._factIndex != null && !element.tagName
  ) {
    if (_bindingRegistry.invalidateNode) {
      _bindingRegistry.invalidateNode(target.context_id, target.node_id);
    }
    return { element: null, error: 'stale_target' };
  }
  return {
    element,
    error: null,
    adapterId: entry.adapterId,
    bindingGeneration: entry.bindingGeneration,
    expectedGeneration,
  };
}

/**
 * Get current perception state for ActionPlan envelope checks.
 */
function getPerceptionState() {
  return {
    initialized: _initialized,
    documentId: _revisionManager?.currentDocumentId() || null,
    snapshotId: _lastSnapshot?.snapshot_id || null,
    revision: _revisionManager?.currentRevision() ?? -1,
    bindingCount: _bindingRegistry?.size ?? 0,
    deltaObserverActive: !!_deltaEmitter,
    authorshipGenerationCount: _authorshipGenerations.size,
  };
}

/**
 * Private registry accessor for generation-aware TOCTOU revalidation.
 * Browser-private; never serialize.
 */
function getBindingRegistry() {
  return _bindingRegistry;
}

/**
 * Authorship generation for a node at last publish, or 0 if unknown.
 */
function getAuthorshipGeneration(contextId, nodeId) {
  return _authorshipGenerations.get(_authorshipKey(contextId, nodeId)) ?? 0;
}

/** @internal test helper */
function _setLastSnapshotForTests(snapshot) {
  _lastSnapshot = snapshot;
}

/** @internal test helper — re-capture authorship gens after manual bind setup */
function _captureAuthorshipGenerationsForTests() {
  _captureAuthorshipGenerations();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initPerception,
    perceivePage,
    resetPerception,
    resolveExecutionTarget,
    startDeltaObserver,
    stopDeltaObserver,
    getPerceptionState,
    getBindingRegistry,
    getAuthorshipGeneration,
    _setLastSnapshotForTests,
    _captureAuthorshipGenerationsForTests,
  };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcPerception = {
    initPerception,
    perceivePage,
    resetPerception,
    resolveExecutionTarget,
    startDeltaObserver,
    stopDeltaObserver,
    getPerceptionState,
    getBindingRegistry,
    getAuthorshipGeneration,
  };
}
})();
