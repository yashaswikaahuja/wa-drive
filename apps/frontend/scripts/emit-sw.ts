/**
 * Emit public/sw.js from public/sw.ts (self-destructing service worker).
 * Vite serves public/ as-is; browsers request /sw.js.
 *
 * Run: node --experimental-strip-types scripts/emit-sw.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '../..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const esbuild = require('esbuild') as typeof import('esbuild');

const src = path.join(frontendRoot, 'public', 'sw.ts');
const outfile = path.join(frontendRoot, 'public', 'sw.js');

if (!fs.existsSync(src)) {
  throw new Error(`missing ${src}`);
}

const raw = fs.readFileSync(src, 'utf8');
const transformed = await esbuild.transform(raw, {
  loader: 'ts',
  target: 'es2018',
  legalComments: 'inline',
});

const banner = '// Generated from sw.ts — edit sw.ts, then re-emit.\n';
fs.writeFileSync(outfile, banner + transformed.code);
console.log('Wrote', path.relative(frontendRoot, outfile));
