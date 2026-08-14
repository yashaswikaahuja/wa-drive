/**
 * CyberControl CI Runner — Unit & Knowledge Tests
 * Runs all non-browser test suites. No external dependencies needed.
 * Usage: node extension-dev/tests/ci-unit.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

// WSS protocol suite needs extension-service deps (ws, jsonwebtoken).
// CI does not pre-install them; install once if missing.
const extSvc = resolve(ROOT, 'extension-service');
const extSvcJwt = resolve(extSvc, 'node_modules/jsonwebtoken');
if (!existsSync(extSvcJwt)) {
  console.log('Installing extension-service dependencies for WSS tests...');
  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: extSvc, stdio: 'inherit' });
}

const suites = [
  { name: 'Unit Tests', cmd: 'node extension-dev/tests/test-shared-modules.js' },
  { name: 'Integration Tests', cmd: 'node extension-dev/tests/test-integration.js' },
  { name: 'Model IR Tests', cmd: 'node extension-dev/tests/test-models.js' },
  { name: 'Capability Tests', cmd: 'node extension-dev/tests/test-capabilities.js' },
  { name: 'Runner Tests', cmd: 'node extension-dev/tests/test-runner.js' },
  { name: 'ActionPlanExecutor v3', cmd: 'node extension-dev/tests/test-action-plan-executor.mjs' },
  { name: 'Navigation Contract (3.5)', cmd: 'node extension-dev/tests/test-navigation-contract.mjs' },
  { name: 'ActionPlan Legacy Guard', cmd: 'node extension-dev/tests/test-action-plan-legacy-guard.mjs' },
  { name: 'Legacy Fill Gate (Phase 0)', cmd: 'node extension-dev/tests/test-legacy-fill-gate.mjs' },
  { name: 'Knowledge Store Tests', cmd: 'node extension-dev/tests/test-knowledge-store.js' },
  { name: 'Scope Resolver Tests', cmd: 'node extension-dev/tests/test-scope-resolver.js' },
  { name: 'Validation Engine Tests', cmd: 'node extension-dev/tests/test-validation-engine.mjs' },
  { name: 'Versioning Tests', cmd: 'node extension-dev/tests/test-knowledge-versioning.mjs' },
  { name: 'Knowledge Sync Tests', cmd: 'node extension-dev/tests/test-knowledge-sync.mjs' },
  { name: 'Phase 3 Governance Tests', cmd: 'node extension-dev/tests/test-phase3-governance.mjs' },
  { name: 'Phase 3.5 Navigation Architecture', cmd: 'node extension-dev/tests/test-phase35-navigation-governance.mjs' },
  { name: 'Phase 3.6 Visual Context Architecture', cmd: 'node extension-dev/tests/test-phase36-visual-context-governance.mjs' },
  { name: 'Visual Context Runtime (3.6)', cmd: 'node extension-dev/tests/test-visual-context.mjs' },
  { name: 'Phase 3.7 Hardening Architecture', cmd: 'node extension-dev/tests/test-phase37-hardening-governance.mjs' },
  { name: 'Runtime Errors Catalog (3.7)', cmd: 'node extension-dev/tests/test-runtime-errors.mjs' },
  { name: 'Perception Unit Tests', cmd: 'node extension-dev/tests/perception/run-perception-unit.mjs' },
  { name: 'WSS Protocol Tests', cmd: 'node extension-dev/tests/test-wss-protocol.mjs' },
  { name: 'HIM Runtime Tests', cmd: 'node extension-dev/tests/test-him-runtime.mjs' },
  { name: 'No Legacy Brain Guard', cmd: 'node extension-dev/tests/test-no-legacy-brain.mjs' },
  { name: 'DOM Evidence Tests', cmd: 'node extension-dev/tests/test-dom-evidence.mjs' },
  { name: 'Behavior Classifier Tests', cmd: 'node extension-dev/tests/test-behavior-classifier.mjs' },
  { name: 'Execution Mode Tests', cmd: 'node extension-dev/tests/test-execution-mode.mjs' },
  { name: 'Prior Key Alignment Tests', cmd: 'node extension-dev/tests/test-prior-key-alignment.mjs' },
  { name: 'Static Bounds Tests', cmd: 'node extension-dev/tests/test-static-bounds.mjs' },
  { name: 'Dynamic Loop Tests', cmd: 'node extension-dev/tests/test-dynamic-loop.mjs' },
  { name: 'Safety Demotion Tests', cmd: 'node extension-dev/tests/test-safety-demotion.mjs' },
  { name: 'DOM Settle Tests', cmd: 'node extension-dev/tests/test-dom-settle.mjs' },
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl CI — Unit & Knowledge Tests\n');

for (const suite of suites) {
  try {
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    const lastLine = output.trim().split('\n').pop();
    const match = lastLine.match(/(\d+) passed/);
    const count = match ? parseInt(match[1], 10) : 0;
    totalPassed += count;
    console.log(`  ✓ ${suite.name}: ${count} passed`);
  } catch (e) {
    allPass = false;
    const output = (e.stdout || '') + (e.stderr || '');
    const failLine = output.split('\n').find(l => l.includes('failed') || l.includes('Error')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
    // Print full output for debugging
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-10).forEach(l => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${suites.length} suites`);
console.log(allPass ? '\n✅ All suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
