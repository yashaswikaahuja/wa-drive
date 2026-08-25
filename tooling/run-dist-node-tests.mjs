#!/usr/bin/env node
/**
 * Run node:test on compiled *.test.js under dist/ if any exist.
 * Avoids `node --test` with zero files, which waits on stdin forever (CI hang).
 *
 * Usage (from a package dir): node ../../tooling/run-dist-node-tests.mjs
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name.endsWith('.test.js')) acc.push(p);
  }
  return acc;
}

const files = walk(join(process.cwd(), 'dist')).sort();
if (files.length === 0) {
  console.log('[test] no dist/**/*.test.js — skip');
  process.exit(0);
}

const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: process.cwd() });
process.exit(r.status ?? 1);
