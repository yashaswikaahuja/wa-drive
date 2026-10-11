/**
 * script-manifests — Injection script lists for fill paths
 *
 * SEQUENTIAL_KERNEL_SCRIPTS — @cc/* concat bundles for classic autofill
 * PRODUCT_PATH_SCRIPTS — perception + ActionPlan executor (synced from
 *   extension-legacy-best into apps/extension on build)
 *
 * Public API (on (globalThis as any).CcScriptManifests):
 *   SEQUENTIAL_KERNEL_SCRIPTS, PRODUCT_PATH_SCRIPTS
 */
(function (root: any) {
  'use strict';

  var SEQUENTIAL_KERNEL_SCRIPTS = Object.freeze([
    'shared-bundle.js',           // @cc/shared — dom-utils, option-match, network-idle
    'autofill/plugins-bundle.js', // @cc/plugins — interface, cascade-select, ng-dropdown, keystroke
    'drivers-bundle.js',          // @cc/drivers — dispatch, dom, input, select, interaction
    'autofill/extractor-bundle.js', // @cc/extractor
    'autofill/mapper-bundle.js',    // @cc/mapper
    'autofill/executor-bundle.js',  // @cc/executor
  ]);

  // Order matters: gateway before perception; action-plan-executor last.
  var PRODUCT_PATH_SCRIPTS = Object.freeze([
    'runtime/gateway/interaction.js',
    'runtime/dom-gateway.js',
    'runtime/dom-settle.js',
    'runtime/dom-evidence.js',
    'runtime/errors.js',
    'runtime/navigation-contract.js',
    'perception/binding-registry.js',
    'perception/revision-manager.js',
    'perception/canonical-hash.js',
    'perception/privacy-filter.js',
    'perception/widget-classifier.js',
    'perception/adapters/index.js',
    'perception/node-factory.js',
    'perception/edge-factory.js',
    'perception/graph-invariants.js',
    'perception/delta-apply.js',
    'perception/context-discovery.js',
    'perception/snapshot-builder.js',
    'perception/validator.js',
    'perception/visual-context.js',
    'perception/index.js',
    'runtime/action-plan-executor.js',
  ]);

  root.CcScriptManifests = {
    SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
    PRODUCT_PATH_SCRIPTS: PRODUCT_PATH_SCRIPTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined' && typeof globalThis !== 'undefined') {
  module.exports = (globalThis as any).CcScriptManifests;
}
