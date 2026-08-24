import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../apps/extension/scripts/build-drivers-bundle.mjs',
);
const r = spawnSync(process.execPath, [target], { stdio: 'inherit' });
process.exit(r.status ?? 1);
