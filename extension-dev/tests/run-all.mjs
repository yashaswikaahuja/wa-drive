/**
 * CyberControl Test Runner — runs all test suites.
 * Usage: node extension-dev/tests/run-all.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const suites = [
  { name: 'Unit Tests', cmd: 'node extension-dev/tests/test-shared-modules.js' },
  { name: 'Integration Tests', cmd: 'node extension-dev/tests/test-integration.js' },
  { name: 'Mapping Guard Tests', cmd: 'node extension-dev/tests/test-mapping-guards.js' },
  { name: 'Model IR Tests', cmd: 'node extension-dev/tests/test-models.js' },
  { name: 'Capability Tests', cmd: 'node extension-dev/tests/test-capabilities.js' },
  { name: 'Runner Tests', cmd: 'node extension-dev/tests/test-runner.js' },
  { name: 'Knowledge Store Tests', cmd: 'node extension-dev/tests/test-knowledge-store.js' },
  { name: 'Scope Resolver Tests', cmd: 'node extension-dev/tests/test-scope-resolver.js' },
  { name: 'Validation Engine Tests', cmd: 'node extension-dev/tests/test-validation-engine.mjs' },
  { name: 'Versioning Tests', cmd: 'node extension-dev/tests/test-knowledge-versioning.mjs' },
  { name: 'Knowledge Sync Tests', cmd: 'node extension-dev/tests/test-knowledge-sync.mjs' },
  { name: 'Phase 3 Governance Tests', cmd: 'node extension-dev/tests/test-phase3-governance.mjs' },
  { name: 'Phase 3 Schema Conformance', cmd: 'node extension-dev/tests/ratification/run-conformance.mjs', optional: true },
  { name: 'Browser Tests', cmd: 'node extension-dev/tests/browser/run.mjs', optional: true },
  { name: 'Real Widget Tests', cmd: 'node extension-dev/tests/browser/run-real-widgets.mjs', optional: true },
  { name: 'Comprehensive Portal Tests', cmd: 'node extension-dev/tests/browser/run-comprehensive.mjs', optional: true },
];

let allPass = true;
console.log('CyberControl — Full Test Suite\n');

for (const suite of suites) {
  try {
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    const lastLine = output.trim().split('\n').pop();
    const match = lastLine.match(/(\d+) passed/);
    const count = match ? match[1] : '?';
    console.log(`  ✓ ${suite.name}: ${count} passed`);
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    // Optional suites (e.g. browser tests needing Playwright) — skip if dependency missing
    if (suite.optional && (output.includes('Cannot find module') || output.includes('MODULE_NOT_FOUND') || output.includes('playwright'))) {
      console.log(`  ⊘ ${suite.name}: skipped (optional dependency not installed)`);
      continue;
    }
    allPass = false;
    const failLine = output.split('\n').find(l => l.includes('failed')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
  }
}

console.log(allPass ? '\n✅ All suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
