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
    'shared/network-idle.js',
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
    'shared/network-idle.js',
    'shared/dom-utils.js',
    'shared/label-utils.js',
    'shared/option-match.js',
    'shared/select-apply.js',
    'shared/llm-client.js',
    'autofill/plugins/interface.js',
    'autofill/plugins/cascade-select.js',
    'autofill/plugins/ng-dropdown.js',
    'autofill/plugins/button-click.js',
    'autofill/plugins/keystroke-input.js',
    'drivers/dispatch.js',
    'drivers/dom.js',
    'drivers/input.js',
    'drivers/select.js',
    'drivers/interaction.js',
    'autofill/extractor-bundle.js',
    'autofill/mapper-bundle.js',
    'autofill/derive-bundle.js',
    'autofill/rule-engine-bundle.js',
    'autofill/ai-resolve-bundle.js',
    'autofill/executor-bundle.js',
  ]);

  root.CcScriptManifests = {
    PRODUCT_PATH_SCRIPTS: PRODUCT_PATH_SCRIPTS,
    SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScriptManifests;
