/**
 * CyberControl CI Runner — Browser Tests (turborepo-aware)
 *
 * Perception / ActionPlan discrete sources live under packages (or are bundled).
 * Until those browser harnesses are remapped off the deleted apps/extension/perception
 * and apps/extension/runtime trees, this runner only executes suites that do not
 * require those paths. Full browser coverage returns when harnesses import @cc/*.
 *
 * Usage: node extension-dev/tests/ci-browser.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Suites that do not require deleted apps/extension/perception|runtime trees.
const candidates = [
  { name: 'Browser Tests', cmd: 'node extension-dev/tests/browser/run.mjs' },
  { name: 'Real Widget Tests', cmd: 'node extension-dev/tests/browser/run-real-widgets.mjs' },
  { name: 'Comprehensive Portal Tests', cmd: 'node extension-dev/tests/browser/run-comprehensive.mjs' },
];

// Skip suites that still hard-require deleted discrete trees.
const deferred = [
  'Perception Browser Tests (needs packages remap of perception/*)',
  'Widget Classification Tests (needs packages remap of perception/*)',
  'Relationship Lifecycle Tests (needs packages remap of perception/*)',
  'ActionPlanExecutor v3 Product E2E (needs packages remap of runtime/*)',
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl CI — Browser Tests (turborepo)\n');

for (const note of deferred) {
  console.log(`  ⊘ deferred: ${note}`);
}

for (const suite of candidates) {
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
    const failLine = output.split('\n').find((l) => l.includes('failed') || l.includes('Error')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-15).forEach((l) => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${candidates.length} active suites (${deferred.length} deferred)`);
console.log(allPass ? '\n✅ All active suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
