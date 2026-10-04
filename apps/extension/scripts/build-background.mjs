/**
 * Emit background.js from background.ts for Chrome MV3 service_worker.
 * Manifest keeps pointing at background.js (Chrome requires a .js path).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const extRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(extRoot, 'background.ts');
const outfile = path.join(extRoot, 'background.js');

if (!fs.existsSync(src)) {
  throw new Error(`missing ${src}`);
}

const raw = fs.readFileSync(src, 'utf8');
const transformed = await esbuild.transform(raw, {
  loader: 'ts',
  target: 'es2018',
  legalComments: 'inline',
});

const banner = '// Generated from background.ts — edit background.ts, then pnpm build.\n';
fs.writeFileSync(outfile, banner + transformed.code);
console.log('Wrote', outfile, transformed.code.split(/\n/).length, 'lines');
