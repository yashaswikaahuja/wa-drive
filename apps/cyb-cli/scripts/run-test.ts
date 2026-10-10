// @ts-nocheck
/**
 * esbuild report.test.ts → temp .mjs and run with node.
 */
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(cliRoot, 'src', 'report.test.ts');
const dir = mkdtempSync(path.join(tmpdir(), 'cyb-cli-test-'));
const outfile = path.join(dir, 'report.test.ts');

try {
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    bundle: true,
    packages: 'external',
    sourcemap: false,
    logLevel: 'warning',
  });

  const result = spawnSync(process.execPath, [outfile], {
    stdio: 'inherit',
    cwd: cliRoot,
  });
  process.exit(result.status ?? 1);
} finally {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
