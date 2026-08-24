/* Product-path fill orchestration (MIG-POPUP-01 / #166).
 * Loaded in extension popup context only — not injected into pages.
 * Parts under application/orchestrator/capabilities/ load before this facade.
 * Public API unchanged.
 */
(function () {
'use strict';

var PRODUCT_PATH_SCRIPTS     = (globalThis.CcScriptManifests || {}).PRODUCT_PATH_SCRIPTS     || [];
var SEQUENTIAL_KERNEL_SCRIPTS = (globalThis.CcScriptManifests || {}).SEQUENTIAL_KERNEL_SCRIPTS || [];

function flattenProfile(profile) {
  var _fp = globalThis.CcFlattenProfile || {};
  return _fp.flattenProfile ? _fp.flattenProfile(profile) : (profile && (profile.data || profile)) || {};
}

async function runSequentialKernelFill(ctx) {
  var _skf = globalThis.CcSequentialKernelFill || {};
  if (_skf.run) return _skf.run(ctx);
  return { ok: false, error: 'CcSequentialKernelFill not loaded', filled: 0, failed: 0, skipped: 0, records: [] };
}

async function runActionPlanFill(ctx) {
  var _apf = globalThis.CcActionPlanFill || {};
  if (_apf.run) return _apf.run(ctx);
  return { ok: false, error: 'CcActionPlanFill not loaded', filled: 0, failed: 0, skipped: 0, records: [] };
}

async function runProductFill(ctx) {
  var pref = String(ctx.executionPreference || 'AUTO').toUpperCase();
  if (pref === 'DYNAMIC') return runActionPlanFill(ctx);
  return runSequentialKernelFill(ctx);
}

var api = {
  PRODUCT_PATH_SCRIPTS: PRODUCT_PATH_SCRIPTS,
  SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
  runProductFill: runProductFill,
  runSequentialKernelFill: runSequentialKernelFill,
  runActionPlanFill: runActionPlanFill,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else globalThis.CcFillOrchestrator = api;
})();
