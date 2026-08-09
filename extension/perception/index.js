(function() {
/**
 * CyberControl Perception Entry Point — perceivePage() public API.
 *
 * Consumers call perceivePage() to get a validated PageSnapshot v2 or PageDelta.
 * This module wires together all perception subsystems.
 *
 * Usage (in extension isolated world):
 *   const snapshot = await perceivePage({ mode: 'snapshot' });
 */

// Lazy module references — resolved at init time
let _gateway, _revisionManager, _bindingRegistry, _privacyFilter;
let _widgetClassifier, _contextDiscovery, _nodeFactory, _edgeFactory;
let _canonicalHash, _validator, _snapshotBuilder, _deltaEmitterClass;
let _initialized = false;
let _deltaEmitter = null;
let _lastSnapshot = null;

/**
 * Initialize the perception system. Call once after all modules are loaded.
 * @param {object} modules — dependency injection for testability
 */
async function initPerception(modules = {}) {
  if (_initialized) return;

  // In browser context, modules are on globalThis (CcXxx). In Node tests, passed explicitly.
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

  // RevisionManager is stateful — create or accept
  if (modules.revisionManager) {
    _revisionManager = modules.revisionManager;
  } else if (typeof CcRevisionManager !== 'undefined') {
    _revisionManager = new CcRevisionManager();
  }

  // Initialize validator if needed
  if (_validator && !_validator.isInitialized()) {
    if (modules.validatorOptions) {
      await _validator.initValidator(modules.validatorOptions);
    }
  }

  _initialized = true;
}

/**
 * Produce a PageSnapshot or PageDelta.
 *
 * @param {object} [options]
 * @param {'snapshot'|'delta'} [options.mode='snapshot']
 * @param {number} [options.sinceRevision] — for delta mode
 * @param {boolean} [options.includeGeometry=true]
 * @param {Element|Document} [options.root] — override root element
 * @returns {Promise<object>} Validated PageSnapshot or PageDelta
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
    return _lastSnapshot;
  }

  if (mode === 'delta') {
    // Delta mode requires an active delta emitter with a base snapshot.
    if (!_deltaEmitter || !_deltaEmitter.getBaseSnapshot()) {
      throw new Error('Delta mode requires an active delta observer. Call startDeltaObserver() first.');
    }
    // Return the current base snapshot — actual deltas are pushed via the
    // onDelta callback registered during startDeltaObserver().
    // For on-demand delta, re-perceive and diff.
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
    // If unchanged, return null (no delta needed).
    if (newSnapshot.canonical_hash === base.canonical_hash) return null;
    // Update the emitter's base.
    _deltaEmitter.setBaseSnapshot(newSnapshot);
    return newSnapshot;
  }

  throw new Error(`Unknown perception mode: ${mode}`);
}

/**
 * Reset perception state (e.g. on full navigation).
 */
function resetPerception() {
  if (_deltaEmitter) { _deltaEmitter.stop(); _deltaEmitter = null; }
  _lastSnapshot = null;
  if (_bindingRegistry) _bindingRegistry.invalidateAll();
  if (_revisionManager) _revisionManager.onFullNavigation();
}

/**
 * Start observing DOM mutations and emitting PageDelta on changes.
 * @param {object} baseSnapshot — a valid PageSnapshot to diff against
 * @param {object} [options]
 * @param {function} [options.onDelta] — callback(PageDelta | PageSnapshot)
 * @param {function} [options.onError] — callback(Error)
 * @param {Element|Document} [options.root] — observation root
 * @param {number} [options.coalesceMs]
 * @param {number} [options.settleMs]
 */
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
    onDelta: options.onDelta || null,
    onError: options.onError || null,
    coalesceMs: options.coalesceMs,
    settleMs: options.settleMs,
  });

  _deltaEmitter.start(baseSnapshot, options.root);
}

/**
 * Stop the delta observer.
 */
function stopDeltaObserver() {
  if (_deltaEmitter) { _deltaEmitter.stop(); _deltaEmitter = null; }
}

/**
 * Resolve a target element by (contextId, nodeId) from the BindingRegistry.
 * Used by execution path to find the live DOM element for an ActionPlan step.
 * Returns the live Element or null if not found / disconnected.
 *
 * @param {string} contextId
 * @param {string} nodeId
 * @returns {Element|null}
 */
function resolveTarget(contextId, nodeId) {
  if (!_initialized || !_bindingRegistry) return null;
  const entry = _bindingRegistry.resolve(contextId, nodeId);
  if (!entry) return null;
  const ref = entry.liveNodeReference || entry;
  // Check it's a real connected DOM element (not a test sentinel)
  if (!ref || typeof ref.nodeType !== 'number' || ref.nodeType !== 1) return null;
  if (!ref.isConnected) {
    _bindingRegistry.invalidateNode(contextId, nodeId);
    return null;
  }
  return ref;
}

/**
 * Resolve an ActionPlan target only when it is still bound to the exact
 * published document/snapshot/revision. No selector or semantic fallback.
 */
function resolveExecutionTarget(targetBinding, target, requirements = {}) {
  if (!_initialized || !_bindingRegistry || !_revisionManager || !_lastSnapshot) {
    return { element: null, error: 'stale_snapshot' };
  }
  if (_revisionManager.currentDocumentId() !== targetBinding?.document_id) {
    return { element: null, error: 'document_replaced' };
  }
  if (_lastSnapshot.snapshot_id !== targetBinding?.snapshot_id ||
      _revisionManager.currentRevision() !== targetBinding?.expected_revision) {
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

  const entry = _bindingRegistry.resolve(target.context_id, target.node_id);
  if (!entry || entry.createdRevision !== targetBinding.expected_revision || entry.bindingGeneration !== 1) {
    return { element: null, error: 'stale_target' };
  }
  if (requirements.requiredAdapterId && entry.adapterId !== requirements.requiredAdapterId) {
    return { element: null, error: 'adapter_mismatch' };
  }
  const element = entry.liveNodeReference;
  if (!element || typeof element.nodeType !== 'number' || element.nodeType !== 1 || !element.isConnected) {
    _bindingRegistry.invalidateNode(target.context_id, target.node_id);
    return { element: null, error: 'stale_target' };
  }
  return { element, error: null };
}

/**
 * Get current perception state for diagnostics.
 */
function getPerceptionState() {
  return {
    initialized: _initialized,
    documentId: _revisionManager?.currentDocumentId() || null,
    snapshotId: _lastSnapshot?.snapshot_id || null,
    revision: _revisionManager?.currentRevision() ?? -1,
    bindingCount: _bindingRegistry?.size ?? 0,
    deltaObserverActive: !!_deltaEmitter,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPerception, perceivePage, resetPerception, resolveTarget, resolveExecutionTarget, startDeltaObserver, stopDeltaObserver, getPerceptionState };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcPerception = { initPerception, perceivePage, resetPerception, resolveTarget, resolveExecutionTarget, startDeltaObserver, stopDeltaObserver, getPerceptionState };
}

})();