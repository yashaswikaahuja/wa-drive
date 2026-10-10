/**
 * Emit Node-runnable ESM for WSS consumers (extension-service on Node 20).
 * Browser mapper continues to consume TypeScript via esbuild IIFE.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(pkgRoot, 'dist');

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });

await esbuild.build({
  absWorkingDir: pkgRoot,
  entryPoints: {
    'split-dob': 'src/split-dob.ts',
    'mapping-relation': 'src/mapping-relation.ts',
  },
  outdir: distRoot,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  legalComments: 'none',
});

console.log('Wrote Node ESM modules under', distRoot);
