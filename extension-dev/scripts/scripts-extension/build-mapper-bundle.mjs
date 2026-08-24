/**
 * Thin wrapper — real build lives in extension/scripts (resolves @cc/mapper).
 * Or: pnpm --filter @cc/mapper build
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/extension/scripts/build-mapper-bundle.mjs',
);
const r = spawnSync(process.execPath, [target], { stdio: 'inherit' });
process.exit(r.status ?? 1);
