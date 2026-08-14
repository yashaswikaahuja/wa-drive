/**
 * CyberControl CI Runner — Browser Tests
 * Runs Playwright-based browser tests. Requires: npm ci in extension-dev/tests/browser/
 * Usage: node extension-dev/tests/ci-browser.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const suites = [
  { name: 'Browser Tests', cmd: 'node extension-dev/tests/browser/run.mjs' },
  { name: 'Real Widget Tests', cmd: 'node extension-dev/tests/browser/run-real-widgets.mjs' },
  { name: 'Comprehensive Portal Tests', cmd: 'node extension-dev/tests/browser/run-comprehensive.mjs' },
  { name: 'Perception Browser Tests', cmd: 'node extension-dev/tests/browser/run-perception-browser.mjs' },
  { name: 'Widget Classification Tests', cmd: 'node extension-dev/tests/browser/run-widget-classification.mjs' },
  { name: 'Relationship Lifecycle Tests', cmd: 'node extension-dev/tests/browser/run-relationship-lifecycle.mjs' },
  { name: 'ActionPlanExecutor v3 Product E2E', cmd: 'node extension-dev/tests/browser/run-action-plan-executor.mjs' },
  { name: 'Adaptive Execution Matrix', cmd: 'node extension-dev/tests/browser/run-adaptive-execution.mjs' },
  { name: 'Product Integration', cmd: 'node extension-dev/tests/browser/run-product-integration.mjs' },
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl CI — Browser Tests\n');

for (const suite of suites) {
  try {
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 120000 });
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
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-15).forEach(l => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${suites.length} suites`);
console.log(allPass ? '\n✅ All suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
