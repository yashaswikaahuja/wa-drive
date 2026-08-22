/**
 * script-manifests — Injection script lists for the sequential fill path
 *
 * SEQUENTIAL_KERNEL_SCRIPTS — scripts injected into the page for autofill
 *
 * Public API (on globalThis.CcScriptManifests):
 *   SEQUENTIAL_KERNEL_SCRIPTS
 */
(function (root) {
  'use strict';

  var SEQUENTIAL_KERNEL_SCRIPTS = Object.freeze([
    'shared-bundle.js',           // @cc/shared — dom-utils, option-match, network-idle
    'autofill/plugins-bundle.js', // @cc/plugins — interface, cascade-select, ng-dropdown, keystroke
    'drivers-bundle.js',          // @cc/drivers — dispatch, dom, input, select, interaction
    'autofill/extractor-bundle.js', // @cc/extractor
    'autofill/mapper-bundle.js',    // @cc/mapper
    'autofill/executor-bundle.js',  // @cc/executor
  ]);

  root.CcScriptManifests = {
    SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScriptManifests;
