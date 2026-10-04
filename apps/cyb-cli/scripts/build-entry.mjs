/**
 * Bundle bin/cyb.ts (+ src imports) → bin/cyb.js (Node 18+ ESM).
 * package.bin and install scripts keep pointing at cyb.js.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(cliRoot, 'bin', 'cyb.ts');
const outfile = path.join(cliRoot, 'bin', 'cyb.js');

await esbuild.build({
  entryPoints: [entry],
  outfile,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  bundle: true,
  packages: 'external',
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node\n// Generated from cyb.ts — edit sources, then pnpm build.\n',
  },
  logLevel: 'info',
});

console.log('Emitted cyb-cli entry:', path.relative(cliRoot, outfile));
