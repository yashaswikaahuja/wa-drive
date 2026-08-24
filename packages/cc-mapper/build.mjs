/**
 * Build Chrome inject IIFE from TypeScript sources via esbuild.
 * Prefer: pnpm --filter cybercontrol-extension build
 * (extension resolves @cc/mapper by package name and owns the outfile path).
 *
 * This script remains for `pnpm --filter @cc/mapper build` and delegates to
 * the extension package build when cybercontrol-extension is linked.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findExtensionMapperBuild() {
  // Prefer sibling layout via linked cybercontrol-extension
  try {
    const extRoot = path.dirname(require.resolve('cybercontrol-extension/package.json'));
    const script = path.join(extRoot, 'scripts/build-mapper-bundle.mjs');
    if (fs.existsSync(script)) return script;
  } catch {
    /* not linked as a dependency of @cc/mapper */
  }

  // Monorepo sibling: packages/cc-mapper → ../../extension
  const sibling = path.join(dir, '../../extension/scripts/build-mapper-bundle.mjs');
  if (fs.existsSync(sibling)) return sibling;

  return null;
}

const target = findExtensionMapperBuild();
if (!target) {
  console.error(
    'Cannot find extension/scripts/build-mapper-bundle.mjs. Run from the monorepo, or: pnpm --filter cybercontrol-extension build',
  );
  process.exit(1);
}

const r = spawnSync(process.execPath, [target], { stdio: 'inherit' });
process.exit(r.status ?? 1);
