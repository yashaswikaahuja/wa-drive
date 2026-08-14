/**
 * Phase 0 (CYB-85) — legacy client-fill gate unit tests.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const gate = require(join(__dirname, '../../extension/shared/legacy-fill-gate.js'));

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}

console.log('Legacy fill gate (Phase 0)\n');

assert(gate.STORAGE_KEY === 'allowLegacyClientFill', 'STORAGE_KEY constant');
assert(gate.isLegacyClientFillAllowed(null) === false, 'null storage → denied');
assert(gate.isLegacyClientFillAllowed(undefined) === false, 'undefined storage → denied');
assert(gate.isLegacyClientFillAllowed({}) === false, 'empty storage → denied');
assert(gate.isLegacyClientFillAllowed({ allowLegacyClientFill: false }) === false, 'false → denied');
assert(gate.isLegacyClientFillAllowed({ allowLegacyClientFill: 'true' }) === false, 'string true → denied');
assert(gate.isLegacyClientFillAllowed({ allowLegacyClientFill: 1 }) === false, 'number 1 → denied');
assert(gate.isLegacyClientFillAllowed({ allowLegacyClientFill: true }) === false, 'true → permanently denied (Phase 4.1)');

const denied = gate.legacyClientFillDenied('DISPATCH_JOB');
assert(denied.ok === false, 'denied.ok is false');
assert(denied.code === 'legacy_client_fill_disabled', 'denied code');
assert(typeof denied.error === 'string' && denied.error.includes('DISPATCH_JOB'), 'denied mentions path');
assert(denied.error.includes('side-panel'), 'denied mentions product path');

// Source wiring (Phase 0 must keep gates on production entry points)
import { readFileSync, existsSync } from 'fs';
const root = join(__dirname, '../..');
const bg = readFileSync(join(root, 'extension/background.js'), 'utf8');
const popup = readFileSync(join(root, 'extension/popup.js'), 'utf8');
const svc = readFileSync(join(root, 'extension-service/index.js'), 'utf8');
assert(bg.includes('legacy-fill-gate.js'), 'background imports legacy-fill-gate');
assert(bg.includes('isLegacyClientFillAllowed'), 'background defines gate helper');
assert(bg.includes('legacy_client_fill_disabled') || bg.includes('legacyClientFillDenied'), 'background uses deny path');
assert(popup.includes('allowLegacyClientFill'), 'popup reads allowLegacyClientFill');
assert(popup.includes('applyAgentVisibility'), 'popup hides agent when gated');
assert(popup.includes('/extension/health'), 'popup checks service health for deploy lock');
assert(svc.includes('/api/extension/health'), 'extension-service exposes /api/extension/health');
assert(existsSync(join(root, 'deploy/docs/EXTENSION-DEPLOY-LOCK.md')), 'deploy lock doc exists');
assert(existsSync(join(root, 'extension-dev/docs/PHASE0_SMOKE.md')), 'Phase 0 smoke doc exists');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
