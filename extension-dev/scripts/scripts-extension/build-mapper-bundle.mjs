/**
 * Rebuild mapper-bundle.js from @cc/mapper TypeScript via package build.
 * Run: node extension-dev/scripts/scripts-extension/build-mapper-bundle.mjs
 *  or: pnpm --filter @cc/mapper build
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const r = spawnSync(process.execPath, ['packages/cc-mapper/build.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
if (r.status !== 0) process.exit(r.status ?? 1);
