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

// Popup product fill inject list must not include legacy semantic modules
const injectBlock = popup.slice(
  popup.indexOf("files: ["),
  popup.indexOf('runtime/action-plan-executor.js') + 80
);
ok(!injectBlock.includes('autofill/executor'), 'inject list excludes autofill/executor');
ok(!injectBlock.includes('autofill/mapper'), 'inject list excludes mapper');
ok(!injectBlock.includes('runtime/resolver.js'), 'inject list excludes resolver');
ok(!injectBlock.includes('shared/option-match'), 'inject list excludes option-match');
ok(injectBlock.includes('action-plan-executor'), 'inject list includes action-plan-executor');

// Executor source must not reference legacy modules
ok(!exec.includes('autofill/executor'), 'executor source excludes autofill/executor');
ok(!exec.includes('querySelector'), 'executor source has no querySelector');
ok(!exec.includes('matchOption'), 'executor source has no matchOption');
ok(exec.includes('resolveExecutionTarget'), 'executor uses resolveExecutionTarget');
ok(exec.includes('correlation_replayed') || exec.includes('correlation_replayed'), 'executor handles replay');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
