#!/usr/bin/env node
/**
 * Cross-platform runner for packages that use *.test.mjs next to package.json.
 * Usage (from a package dir): node ../../tooling/run-package-tests.mjs
 * Or: node ../tooling/run-package-tests.mjs  (depth varies)
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
const files = readdirSync(cwd)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

if (files.length === 0) {
  console.log('No *.test.mjs in', cwd);
  process.exit(0);
}

let failed = 0;
for (const f of files) {
  console.log('\n──', f, '──');
  const r = spawnSync(process.execPath, [join(cwd, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}
if (failed > 0) {
  console.error(`\n${failed}/${files.length} test file(s) failed`);
  process.exit(1);
}
console.log(`\n${files.length} test file(s) passed`);
