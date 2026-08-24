/**
 * Build Chrome inject IIFE from TypeScript sources via esbuild.
 * Output: extension/autofill/mapper-bundle.js (path-stable for MV3 inject)
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(dir, 'src/inject.ts');
const outfile = path.join(dir, '../../extension/autofill/mapper-bundle.js');

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  outfile,
  legalComments: 'none',
  banner: {
    js: '/**\n * AUTO-GENERATED from packages/cc-mapper (TypeScript + esbuild IIFE).\n * Rebuild: pnpm --filter @cc/mapper build\n */',
  },
});

console.log('Wrote', outfile);
