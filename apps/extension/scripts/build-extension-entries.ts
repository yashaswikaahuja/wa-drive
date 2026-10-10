/**
 * Emit Chrome-loadable .js siblings from extension entry .ts sources.
 * Manifest / HTML / importScripts keep pointing at the .js paths.
 *
 * Entries: background, content, popup, knowledge-sync, sw/*, application/fill-orchestrator.
 * Run: node scripts/build-extension-entries.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const extRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Relative paths (no extension) under apps/extension. */
const ENTRIES = [
  'background',
  'content',
  'popup',
  'knowledge-sync',
  'sw/auth-refresh',
  'sw/wss-bridge',
  'application/fill-orchestrator',
];

async function emitEntry(rel) {
  const src = path.join(extRoot, `${rel}.ts`);
  const outfile = path.join(extRoot, `${rel}.js`);
  if (!fs.existsSync(src)) {
    throw new Error(`missing ${src}`);
  }

  const raw = fs.readFileSync(src, 'utf8');
  const transformed = await esbuild.transform(raw, {
    loader: 'ts',
    target: 'es2018',
    legalComments: 'inline',
  });

  const banner = `// Generated from ${rel}.ts — edit ${rel}.ts, then pnpm build.\n`;
  fs.writeFileSync(outfile, banner + transformed.code);
  const lines = transformed.code.split(/\n/).length;
  console.log('Wrote', outfile, lines, 'lines');
}

for (const rel of ENTRIES) {
  await emitEntry(rel);
}
