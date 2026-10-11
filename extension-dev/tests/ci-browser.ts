/**
 * CyberControl CI Runner — Browser Tests (turborepo-aware)
 *
 * Bundle harnesses use inject-extension-host.ts (@cc bundles + legacy IR/runner).
 * Perception / APE harnesses use extension-legacy-best perception+runtime archives.
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
  { name: 'Perception Browser Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run-perception-browser.ts` },
  { name: 'Widget Classification Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run-widget-classification.ts` },
  { name: 'Relationship Lifecycle Tests', cmd: `${NODE_TS} extension-dev/tests/browser/run-relationship-lifecycle.ts` },
  { name: 'ActionPlanExecutor v3 Product E2E', cmd: `${NODE_TS} extension-dev/tests/browser/run-action-plan-executor.ts` },
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl CI — Browser Tests (turborepo)\n');

for (const suite of candidates) {
  try {
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 240000 });
    const lastLine = output.trim().split('\n').pop();
    const match = lastLine.match(/(\d+) passed/);
    const count = match ? parseInt(match[1], 10) : 0;
    totalPassed += count;
    console.log(`  ✓ ${suite.name}: ${count} passed`);
  } catch (e) {
    allPass = false;
    const output = (e.stdout || '') + (e.stderr || '');
    const failLine = output.split('\n').find((l) => l.includes('failed') || l.includes('Error') || l.includes('✗')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-25).forEach((l) => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${candidates.length} active suites`);
console.log(allPass ? '\n✅ All active suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
