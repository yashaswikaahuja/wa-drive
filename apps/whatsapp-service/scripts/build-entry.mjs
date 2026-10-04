/**
 * Emit runnable .js entry shells from .ts sources (Node 20-safe).
 * Writes index.js + migrate-sessions-to-db.js next to the .ts sources.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const entries = ['index.ts', 'migrate-sessions-to-db.ts'];

await esbuild.build({
  entryPoints: entries.map((f) => path.join(serviceRoot, f)),
  outdir: serviceRoot,
  outExtension: { '.js': '.js' },
  platform: 'node',
  format: 'esm',
  target: 'node20',
  bundle: false,
  sourcemap: false,
  logLevel: 'info',
});

console.log('Emitted whatsapp-service entry shells:', entries.map((f) => f.replace(/\.ts$/, '.js')).join(', '));
