#!/usr/bin/env node
/**
 * Cross-platform runner for package unit tests.
 * Prefers packages/<name>/tests/*.test.mjs (colocated layout).
 * Falls back to package-root *.test.mjs for any stragglers.
 *
 * Usage (from a package dir): node ../../tooling/run-package-tests.mjs
 *
 * Each file runs in a child process with a timeout so open timers/handles
 * (common in executor settle/wait tests) cannot hang CI forever.
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
const PER_FILE_MS = Number(process.env.CC_TEST_TIMEOUT_MS || 60_000);

function listTestFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.mjs') || f.endsWith('.t6.test.mjs') || /\.t\d+\.test\.mjs$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

const fromTestsDir = listTestFiles(join(cwd, 'tests'));
const fromRoot = listTestFiles(cwd).filter((p) => !p.includes(`${join(cwd, 'tests')}`));
const files = fromTestsDir.length > 0 ? fromTestsDir : fromRoot;

if (files.length === 0) {
  console.log('No *.test.mjs in', join(cwd, 'tests'), 'or', cwd);
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  const rel = file.replace(cwd + '\\', '').replace(cwd + '/', '');
  console.log('\n---', rel, '---');
  const r = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    cwd,
    timeout: PER_FILE_MS,
    killSignal: 'SIGKILL',
  });
  if (r.error && r.error.code === 'ETIMEDOUT') {
    console.error(`TIMEOUT after ${PER_FILE_MS}ms: ${rel} (likely open timers — add process.exit)`);
    failed += 1;
    continue;
  }
  if (r.signal) {
    console.error(`KILLED (${r.signal}): ${rel}`);
    failed += 1;
    continue;
  }
  if ((r.status ?? 1) !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed}/${files.length} test file(s) failed`);
  process.exit(1);
}
console.log(`\n${files.length} test file(s) passed`);
process.exit(0);
