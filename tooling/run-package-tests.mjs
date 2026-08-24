#!/usr/bin/env node
/**
 * Cross-platform runner for package unit tests.
 * Prefers packages/<name>/tests/*.test.mjs (colocated layout).
 * Falls back to package-root *.test.mjs for any stragglers.
 *
 * Usage (from a package dir): node ../../tooling/run-package-tests.mjs
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();

function listTestFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.mjs') || f.endsWith('.t6.test.mjs') || /\.t\d+\.test\.mjs$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

const fromTestsDir = listTestFiles(join(cwd, 'tests'));
const fromRoot = listTestFiles(cwd).filter((p) => !p.includes(`${join(cwd, 'tests')}`));
// Prefer tests/; only use root if tests/ empty
const files = fromTestsDir.length > 0 ? fromTestsDir : fromRoot;

if (files.length === 0) {
  console.log('No *.test.mjs in', join(cwd, 'tests'), 'or', cwd);
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  console.log('\n──', file.replace(cwd + '\\', '').replace(cwd + '/', ''), '──');
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit', cwd });
  if (r.status !== 0) failed += 1;
}
if (failed > 0) {
  console.error(`\n${failed}/${files.length} test file(s) failed`);
  process.exit(1);
}
console.log(`\n${files.length} test file(s) passed`);
