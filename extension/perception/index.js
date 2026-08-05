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
let _canonicalHash, _validator, _snapshotBuilder;
let _initialized = false;

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
    return _snapshotBuilder.buildSnapshot({
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
  }

  if (mode === 'delta') {
    // Delta mode — future implementation
    throw new Error('Delta mode not yet implemented');
  }

  throw new Error(`Unknown perception mode: ${mode}`);
}

/**
 * Reset perception state (e.g. on full navigation).
 */
function resetPerception() {
  if (_bindingRegistry) _bindingRegistry.invalidateAll();
  if (_revisionManager) _revisionManager.onFullNavigation();
}

/**
 * Get current perception state for diagnostics.
 */
function getPerceptionState() {
  return {
    initialized: _initialized,
    documentId: _revisionManager?.currentDocumentId() || null,
    revision: _revisionManager?.currentRevision() ?? -1,
    bindingCount: _bindingRegistry?.size ?? 0,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initPerception, perceivePage, resetPerception, getPerceptionState };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcPerception = { initPerception, perceivePage, resetPerception, getPerceptionState };
}
