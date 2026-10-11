#!/usr/bin/env node
/**
 * APE-P1-09 — ActionPlan product path must not depend on legacy fill modules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadIifeSource } from '../../../tooling/load-iife-source.ts';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(resolve(ROOT, 'package.json'));
let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

console.log('\n=== ActionPlan legacy path guard ===');

const popup = readFileSync(resolve(ROOT, 'apps/extension/popup.js'), 'utf8');
const exec = readFileSync(resolve(ROOT, 'extension-legacy-best/runtime/action-plan-executor.js'), 'utf8');
const { CcScriptManifests } = await loadIifeSource(
  resolve(ROOT, 'packages/cc-orchestrator/src/script-manifests.ts'),
);
const product = CcScriptManifests.PRODUCT_PATH_SCRIPTS || [];

ok(Array.isArray(product) && product.length > 0, 'PRODUCT_PATH_SCRIPTS defined on CcScriptManifests');
ok(!product.some((p) => p.includes('autofill/executor')), 'inject list excludes autofill/executor');
ok(!product.some((p) => p.includes('autofill/mapper')), 'inject list excludes mapper');
ok(!product.some((p) => p.includes('runtime/resolver')), 'inject list excludes resolver');
ok(!product.some((p) => p.includes('shared/option-match') || p.includes('shared-bundle')), 'inject list excludes option-match / shared-bundle');
ok(product.some((p) => p.includes('action-plan-executor')), 'inject list includes action-plan-executor');
ok(product.some((p) => p.includes('navigation-contract')), 'inject list includes navigation-contract');
ok(product.some((p) => p.includes('visual-context')), 'inject list includes visual-context (phase 3.6)');
ok(product.some((p) => p.includes('errors.js')), 'inject list includes errors catalog');
ok(product.some((p) => p.includes('gateway/interaction')), 'inject list includes gateway interaction port');
ok(popup.includes('CcFillOrchestrator') || popup.includes('fill-orchestrator') || popup.includes('orchestrator-bundle'), 'popup uses fill orchestrator');
ok(!popup.includes("autofill/mapper.js") && !popup.includes("'autofill/mapper'"), 'popup does not import mapper');

// Executor source must not reference legacy modules
ok(!exec.includes('autofill/executor'), 'executor source excludes autofill/executor');
ok(!/querySelector\s*\(\s*['"]#/.test(exec) && !exec.includes('matchOption'), 'executor has no id/selector plan targeting or matchOption');
ok(exec.includes('resolveExecutionTarget'), 'executor uses resolveExecutionTarget');
ok(exec.includes('correlation_replayed'), 'executor handles replay');
ok(exec.includes('CcNavigationContract') || exec.includes('navigation'), 'executor integrates navigation contract');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
