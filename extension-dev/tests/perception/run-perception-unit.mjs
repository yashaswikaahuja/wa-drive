#!/usr/bin/env node
/**
 * CyberControl Perception Unit Test Runner.
 * Runs all pure-logic perception module tests (no browser needed).
 * Usage: node extension-dev/tests/perception/run-perception-unit.mjs
 */
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const suites = [
  { name: 'Binding Registry', cmd: 'node extension-dev/tests/perception/test-binding-registry.mjs' },
  { name: 'Revision Manager', cmd: 'node extension-dev/tests/perception/test-revision-manager.mjs' },
  { name: 'Canonical Hash', cmd: 'node extension-dev/tests/perception/test-canonical-hash.mjs' },
  { name: 'Privacy Filter', cmd: 'node extension-dev/tests/perception/test-privacy-filter.mjs' },
  { name: 'Widget Classifier', cmd: 'node extension-dev/tests/perception/test-widget-classifier.mjs' },
  { name: 'Adapter Registry Matrix', cmd: 'node extension-dev/tests/perception/test-adapter-registry-matrix.mjs' },
  { name: 'Page IR Validator', cmd: 'node extension-dev/tests/perception/test-validator.mjs' },
  { name: 'Delta Emitter', cmd: 'node extension-dev/tests/perception/test-delta-emitter.mjs' },
  { name: 'Graph Invariants', cmd: 'node extension-dev/tests/perception/test-graph-invariants.mjs' },
  { name: 'Edge Factory Relationships', cmd: 'node extension-dev/tests/perception/test-edge-factory.mjs' },
  { name: 'Delta Apply Composed Graph', cmd: 'node extension-dev/tests/perception/test-delta-apply.mjs' },
  { name: 'Fail-Closed Graph Invariants', cmd: 'node extension-dev/tests/perception/test-fail-closed-invariants.mjs' },
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl — Perception Unit Tests\n');

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
    const failLine = output.split('\n').find((l) => l.includes('failed') || l.includes('Error')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-10).forEach((l) => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} passed across ${suites.length} suites`);
console.log(allPass ? '\n✅ All perception unit suites passed' : '\n❌ Some perception suites failed');
console.log(`${totalPassed} passed, 0 failed`);
process.exit(allPass ? 0 : 1);
