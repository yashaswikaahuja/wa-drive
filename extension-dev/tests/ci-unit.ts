/**
 * CyberControl CI Runner — Unit & Knowledge Tests (turborepo-aware)
 *
 * Only suites that target packages/* or architecture docs, or thin apps/
 * entrypoints. Suites that still require deleted discrete trees
 * (apps/extension/perception|runtime|…) are NOT run here — remapped later
 * against packages/cc-* when those modules are extracted as packages.
 *
 * Usage: node extension-dev/tests/ci-unit.ts
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');

// WSS suite needs workspace deps (ws, jsonwebtoken) via pnpm.
const jwtHints = [
  resolve(ROOT, 'node_modules/jsonwebtoken'),
  resolve(ROOT, 'apps/extension-service/node_modules/jsonwebtoken'),
];
const hasJwt = jwtHints.some((p) => existsSync(p));
if (!hasJwt) {
  console.log('Installing workspace deps (pnpm) for WSS tests...');
  try {
    execSync('pnpm install --frozen-lockfile', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    execSync('corepack enable && pnpm install --frozen-lockfile', { cwd: ROOT, stdio: 'inherit' });
  }
}

const NODE_TS = 'node --experimental-strip-types';
const suites = [
  // packages/cc-shared (+ thin apps/extension entry wiring)
  { name: 'Shared Modules', cmd: `${NODE_TS} extension-dev/tests/unit/test-shared-modules.ts` },
  { name: 'Legacy Fill Gate (Phase 0)', cmd: `${NODE_TS} extension-dev/tests/unit/test-legacy-fill-gate.ts` },
  { name: 'No Legacy Brain Guard', cmd: `${NODE_TS} extension-dev/tests/unit/test-no-legacy-brain.ts` },

  // packages/svc-knowledge
  { name: 'Knowledge Store Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-knowledge-store.ts` },
  { name: 'Scope Resolver Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-scope-resolver.ts` },
  { name: 'Validation Engine Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-validation-engine.ts` },
  { name: 'Versioning Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-knowledge-versioning.ts` },

  // apps/extension thin surface
  { name: 'Knowledge Sync Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-knowledge-sync.ts` },

  // architecture/*.yml contracts (no product tree deps)
  { name: 'Phase 3 Governance', cmd: `${NODE_TS} extension-dev/tests/unit/test-phase3-governance.ts` },
  { name: 'Phase 3.5 Navigation Architecture', cmd: `${NODE_TS} extension-dev/tests/unit/test-phase35-navigation-governance.ts` },
  { name: 'Phase 3.6 Visual Context Architecture', cmd: `${NODE_TS} extension-dev/tests/unit/test-phase36-visual-context-governance.ts` },
  { name: 'D11 Architecture Invariants', cmd: `${NODE_TS} extension-dev/tests/unit/test-d11-invariants.ts` },

  // packages/svc-runtime + svc-session + apps/extension-service / cc-wss
  { name: 'WSS Protocol Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-wss-protocol.ts` },
  { name: 'Behavior Classifier Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-behavior-classifier.ts` },
  { name: 'Execution Mode Tests', cmd: `${NODE_TS} extension-dev/tests/unit/test-execution-mode.ts` },
];

let allPass = true;
let totalPassed = 0;
console.log('CyberControl CI — Unit & Knowledge Tests (turborepo)\n');

// Unit CI never talks to a real DB; stub URL for modules that validate env at import.
const suiteEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://ci:ci@127.0.0.1:5432/ci',
  JWT_SECRET: process.env.JWT_SECRET || 'ci-unit-jwt',
};

for (const suite of suites) {
  try {
    const output = execSync(suite.cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', env: suiteEnv });
    const lastLine = output.trim().split('\n').pop();
    const match = lastLine.match(/(\d+) passed/);
    const count = match ? parseInt(match[1], 10) : 0;
    totalPassed += count;
    console.log(`  ✓ ${suite.name}: ${count} passed`);
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    // Some suites print "N passed, 0 failed" then abort on Windows UV teardown;
    // treat a clean pass line as success when there is no "N failed" with N>0.
    const cleanPass = /(\d+)\s+passed,\s*0\s+failed/.test(output)
      && !/[1-9]\d*\s+failed/.test(output.replace(/,\s*0\s+failed/g, ''));
    if (cleanPass) {
      const match = output.match(/(\d+)\s+passed,\s*0\s+failed/);
      const count = match ? parseInt(match[1], 10) : 0;
      totalPassed += count;
      console.log(`  ✓ ${suite.name}: ${count} passed`);
      continue;
    }
    allPass = false;
    const failLine = output.split('\n').find((l) => l.includes('failed') || l.includes('Error')) || 'unknown failure';
    console.error(`  ✗ ${suite.name}: ${failLine.trim()}`);
    if (output.trim()) {
      console.error('    --- output ---');
      output.trim().split('\n').slice(-10).forEach((l) => console.error('    ' + l));
      console.error('    --- end ---');
    }
  }
}

console.log(`\n${totalPassed} tests passed across ${suites.length} suites`);
console.log(allPass ? '\n✅ All suites passed' : '\n❌ Some suites failed');
process.exit(allPass ? 0 : 1);
