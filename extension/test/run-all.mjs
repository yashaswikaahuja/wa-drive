/**
 * CyberControl Test Runner — runs all test suites.
 * Usage: node extension/test/run-all.mjs
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

const suites = [
  { name: 'Unit Tests', cmd: 'node extension/test/test-shared-modules.js' },
  { name: 'Integration Tests', cmd: 'node extension/test/test-integration.js' },
  { name: 'Mapping Guard Tests', cmd: 'node extension/test/test-mapping-guards.js' },
  { name: 'Model IR Tests', cmd: 'node extension/test/test-models.js' },
  { name: 'Capability Tests', cmd: 'node extension/test/test-capabilities.js' },
  { name: 'Browser Tests', cmd: 'node extension/test/browser/run.mjs' },
  { name: 'Real Widget Tests', cmd: 'node extension/test/browser/run-real-widgets.mjs' },
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
    allPass = false;
    const output = (e.stdout || '') + (e.stderr || '');
    const failLine = output.split('\n').find(l => l.includes('failed')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
  }
}

console.log(allPass ? '\n✅ All suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
