/**
 * Build mapper IIFE from @cc/mapper TypeScript via esbuild.
 * Resolves the package by name — no ../../packages/cc-mapper path.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import { extensionRoot, packageRoot } from './lib/resolve.mjs';

const mapperRoot = packageRoot('@cc/mapper');
const entry = path.join(mapperRoot, 'src/inject.ts');
const outfile = path.join(extensionRoot, 'autofill/mapper-bundle.js');

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  outfile,
  legalComments: 'none',
  banner: {
    js: '/**\n * AUTO-GENERATED from @cc/mapper (TypeScript + esbuild IIFE).\n * Rebuild: pnpm --filter cybercontrol-extension build\n */',
  },
});

console.log('Wrote', outfile);
