/**
 * script-manifests — Injection script lists for both fill paths
 *
 * PRODUCT_PATH_SCRIPTS   — perceive/APE path (DYNAMIC preference)
 * SEQUENTIAL_KERNEL_SCRIPTS — legacy sequential fill path (default)
 *
 * Public API (on globalThis.CcScriptManifests):
 *   PRODUCT_PATH_SCRIPTS
 *   SEQUENTIAL_KERNEL_SCRIPTS
 *
 * See docs/script-manifests.md for full documentation.
 */
(function (root) {
  'use strict';

  var PRODUCT_PATH_SCRIPTS = Object.freeze([
    'runtime/errors.js',
    'runtime/gateway/interaction.js',
    'runtime/dom-gateway.js',
    'runtime/navigation-contract.js',
    'shared-bundle.js',               // @cc/shared — network-idle + dom-utils + llm-client
    'perception/visual-context.js',
    'perception/binding-registry.js',
    'perception/revision-manager.js',
    'perception/canonical-hash.js',
    'perception/privacy-filter.js',
    'perception/widget-classifier.js',
    'perception/adapters/index.js',
    'perception/node-factory.js',
    'perception/edge-factory.js',
    'perception/graph-invariants.js',
    'perception/context-discovery.js',
    'perception/snapshot-builder.js',
    'perception/validator.js',
    'perception/index.js',
    'runtime/action-plan-executor.js',
    'runtime/dom-evidence.js',
  ]);

  var SEQUENTIAL_KERNEL_SCRIPTS = Object.freeze([
    'shared-bundle.js',               // @cc/shared — dom-utils, llm-client, option-match, network-idle
    'autofill/plugins-bundle.js',     // @cc/plugins — interface, cascade-select, ng-dropdown, keystroke
    'drivers-bundle.js',              // @cc/drivers — dispatch, dom, input, select, interaction
    'autofill/extractor-bundle.js',   // @cc/extractor
    'autofill/mapper-bundle.js',      // @cc/mapper
    'autofill/derive-bundle.js',      // @cc/derive
    'autofill/rule-engine-bundle.js', // @cc/rule-engine
    'autofill/ai-resolve-bundle.js',  // @cc/ai-resolve
    'autofill/executor-bundle.js',    // @cc/executor
  ]);

  root.CcScriptManifests = {
    PRODUCT_PATH_SCRIPTS: PRODUCT_PATH_SCRIPTS,
    SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScriptManifests;
