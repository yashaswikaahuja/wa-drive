// @ts-nocheck
/**
 * Emit runnable index.js from index.ts (Node 20-safe).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [path.join(serviceRoot, 'index.ts')],
  outdir: serviceRoot,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  bundle: false,
  sourcemap: false,
  logLevel: 'info',
});

console.log('Emitted whatsapp-resolver entry shell: index.js');
