#!/usr/bin/env node
/**
 * APE-P1-09 — ActionPlan product path must not depend on legacy fill modules.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

console.log('\n=== ActionPlan legacy path guard ===');

const popup = readFileSync(resolve(ROOT, 'extension/popup.js'), 'utf8');
const exec = readFileSync(resolve(ROOT, 'extension/runtime/action-plan-executor.js'), 'utf8');

// Popup product fill inject list (PRODUCT_PATH_SCRIPTS) must not include legacy semantic modules
const productStart = popup.indexOf('PRODUCT_PATH_SCRIPTS');
const productBlock = productStart >= 0
  ? popup.slice(productStart, productStart + 1200)
  : popup.slice(popup.indexOf("files: ["), popup.indexOf('runtime/action-plan-executor.js') + 80);
ok(!productBlock.includes('autofill/executor'), 'inject list excludes autofill/executor');
ok(!productBlock.includes('autofill/mapper'), 'inject list excludes mapper');
ok(!productBlock.includes('runtime/resolver.js'), 'inject list excludes resolver');
ok(!productBlock.includes('shared/option-match'), 'inject list excludes option-match');
ok(productBlock.includes('action-plan-executor'), 'inject list includes action-plan-executor');
ok(productBlock.includes('navigation-contract'), 'inject list includes navigation-contract');

// Executor source must not reference legacy modules
ok(!exec.includes('autofill/executor'), 'executor source excludes autofill/executor');
// Overlay detection may use document.querySelector for blocking_overlay signal only — not plan targets
ok(!/querySelector\s*\(\s*['"]#/.test(exec) && !exec.includes('matchOption'), 'executor has no id/selector plan targeting or matchOption');
ok(exec.includes('resolveExecutionTarget'), 'executor uses resolveExecutionTarget');
ok(exec.includes('correlation_replayed') || exec.includes('correlation_replayed'), 'executor handles replay');
ok(exec.includes('CcNavigationContract') || exec.includes('navigation'), 'executor integrates navigation contract');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
