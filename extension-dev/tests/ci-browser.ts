/**
 * CyberControl CI Runner — Browser Tests (turborepo-aware)
 *
 * Bundle-based harnesses (autofill + capabilities) are active again via
 * inject-extension-host.ts. Perception / ActionPlan suites still need a
 * packages remap of the deleted apps/extension/perception|runtime trees.
 *
 * Usage: node extension-dev/tests/ci-browser.ts
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const NODE_TS = 'node --experimental-strip-types';
const candidates = [
  { name: 'Comprehensive Portal Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run-comprehensive.ts` },
  { name: 'Browser Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run.ts` },
  { name: 'Real Widget Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run-real-widgets.ts` },
];

// Still deferred until perception/runtime land as @cc packages (or harnesses
// remap onto a new host). extension-legacy-best has capabilities/models but
// not the perception graph tree these suites inject.
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
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
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
      output.trim().split('\n').slice(-20).forEach((l) => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${candidates.length} active suites (${deferred.length} deferred)`);
console.log(allPass ? '\n✅ All active suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
