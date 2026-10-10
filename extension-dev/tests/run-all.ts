/**
 * CyberControl Test Runner — runs all test suites.
 * Usage: node extension-dev/tests/run-all.ts
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const suites = [
  { name: 'Unit Tests', cmd: 'node extension-dev/tests/unit/test-shared-modules.ts' },
  { name: 'Integration Tests', cmd: 'node extension-dev/tests/unit/test-integration.ts' },
  { name: 'Mapping Guard Tests', cmd: 'node extension-dev/tests/unit/test-mapping-guards.ts' },
  { name: 'Model IR Tests', cmd: 'node extension-dev/tests/unit/test-models.ts' },
  { name: 'Capability Tests', cmd: 'node extension-dev/tests/unit/test-capabilities.ts' },
  { name: 'Runner Tests', cmd: 'node extension-dev/tests/unit/test-runner.ts' },
  { name: 'Knowledge Store Tests', cmd: 'node extension-dev/tests/unit/test-knowledge-store.ts' },
  { name: 'Scope Resolver Tests', cmd: 'node extension-dev/tests/unit/test-scope-resolver.ts' },
  { name: 'Validation Engine Tests', cmd: 'node extension-dev/tests/unit/test-validation-engine.ts' },
  { name: 'Versioning Tests', cmd: 'node extension-dev/tests/unit/test-knowledge-versioning.ts' },
  { name: 'Knowledge Sync Tests', cmd: 'node extension-dev/tests/unit/test-knowledge-sync.ts' },
  { name: 'Phase 3 Governance Tests', cmd: 'node extension-dev/tests/unit/test-phase3-governance.ts' },
  { name: 'Extension & Browser Boundary Security', cmd: 'node extension-dev/tests/security/run.ts' },
  { name: 'Perception Unit Tests', cmd: 'node extension-dev/tests/perception/run-perception-unit.ts' },
  { name: 'Phase 3 Schema Conformance', cmd: 'node extension-dev/tests/ratification/run-conformance.ts', optional: true },
  { name: 'Browser Tests', cmd: 'node extension-dev/tests/browser/run.ts', optional: true },
  { name: 'Real Widget Tests', cmd: 'node extension-dev/tests/browser/run-real-widgets.ts', optional: true },
  { name: 'Comprehensive Portal Tests', cmd: 'node extension-dev/tests/browser/run-comprehensive.ts', optional: true },
  { name: 'Perception Browser Tests', cmd: 'node extension-dev/tests/browser/run-perception-browser.ts', optional: true },
  { name: 'Widget Classification Tests', cmd: 'node extension-dev/tests/browser/run-widget-classification.ts', optional: true },
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
