#!/usr/bin/env node
/**
 * APE-P1-09 — ActionPlan product path must not depend on legacy fill modules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

console.log('\n=== ActionPlan legacy path guard ===');

const popup = readFileSync(resolve(ROOT, 'apps/extension/popup.js'), 'utf8');
const orchestrator = readFileSync(resolve(ROOT, 'apps/extension/application/fill-orchestrator.js'), 'utf8');
const exec = readFileSync(resolve(ROOT, 'apps/extension/runtime/action-plan-executor.js'), 'utf8');

// Product fill inject list lives in fill-orchestrator (MIG-POPUP-01)
const productStart = orchestrator.indexOf('PRODUCT_PATH_SCRIPTS');
const productBlock = productStart >= 0
  ? orchestrator.slice(productStart, productStart + 1600)
  : '';
ok(productBlock.length > 0, 'PRODUCT_PATH_SCRIPTS defined on fill-orchestrator');
ok(!productBlock.includes('autofill/executor'), 'inject list excludes autofill/executor');
ok(!productBlock.includes('autofill/mapper'), 'inject list excludes mapper');
ok(!productBlock.includes('runtime/resolver.js'), 'inject list excludes resolver');
ok(!productBlock.includes('shared/option-match'), 'inject list excludes option-match');
ok(productBlock.includes('action-plan-executor'), 'inject list includes action-plan-executor');
ok(productBlock.includes('navigation-contract'), 'inject list includes navigation-contract');
ok(productBlock.includes('visual-context'), 'inject list includes visual-context (phase 3.6)');
ok(productBlock.includes('runtime/errors.js') || productBlock.includes('errors.js'), 'inject list includes errors catalog');
ok(productBlock.includes('gateway/interaction'), 'inject list includes gateway interaction port');
ok(popup.includes('CcFillOrchestrator') || popup.includes('fill-orchestrator'), 'popup uses fill orchestrator');
ok(!popup.includes('autofill/mapper'), 'popup does not import mapper');

// Executor source must not reference legacy modules
ok(!exec.includes('autofill/executor'), 'executor source excludes autofill/executor');
// Overlay detection may use document.querySelector for blocking_overlay signal only — not plan targets
ok(!/querySelector\s*\(\s*['"]#/.test(exec) && !exec.includes('matchOption'), 'executor has no id/selector plan targeting or matchOption');
ok(exec.includes('resolveExecutionTarget'), 'executor uses resolveExecutionTarget');
ok(exec.includes('correlation_replayed') || exec.includes('correlation_replayed'), 'executor handles replay');
ok(exec.includes('CcNavigationContract') || exec.includes('navigation'), 'executor integrates navigation contract');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
