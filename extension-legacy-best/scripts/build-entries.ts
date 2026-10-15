/**
 * Emit Chrome-loadable .js siblings from extension-legacy-best .ts sources.
 * Manifest / importScripts / executeScript keep pointing at the .js paths.
 *
 * Run: node --experimental-strip-types scripts/build-entries.ts
 * (from extension-legacy-best/, or via repo root emit helper)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const legacyRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(legacyRoot, '..');
const require = createRequire(path.join(repoRoot, 'package.json'));
const esbuild = require('esbuild') as typeof import('esbuild');

/** Relative paths (no extension) that have .ts sources and are loaded as .js. */
const ENTRIES = [
  'background',
  'content',
  'popup',
  'knowledge-sync',
  'autofill/ai-resolve',
  'autofill/derive',
  'autofill/executor',
  'autofill/extractor',
  'autofill/mapper',
  'autofill/rule-engine',
  'autofill/plugins/button-click',
  'autofill/plugins/cascade-select',
  'autofill/plugins/interface',
  'autofill/plugins/keystroke-input',
  'autofill/plugins/network-monitor',
  'autofill/plugins/ng-dropdown',
  'capabilities/registry',
  'drivers/dispatch',
  'drivers/dom',
  'drivers/input',
  'drivers/interaction',
  'drivers/select',
  'models/ir',
  'runtime/plugin-bridge',
  'runtime/resolver',
  'runtime/runner',
  'shared/dom-utils',
  'shared/label-utils',
  'shared/llm-client',
  'shared/network-idle',
  'shared/option-match',
  'shared/select-apply',
  'shared/semantic-aliases',
];

async function emitEntry(rel: string) {
  const src = path.join(legacyRoot, `${rel}.ts`);
  const outfile = path.join(legacyRoot, `${rel}.js`);
  if (!fs.existsSync(src)) {
    throw new Error(`missing ${src}`);
  }

  const raw = fs.readFileSync(src, 'utf8');
  const transformed = await esbuild.transform(raw, {
    loader: 'ts',
    target: 'es2018',
    legalComments: 'inline',
  });

  const banner = `// Generated from ${rel}.ts — edit the .ts source, then re-emit.\n`;
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, banner + transformed.code);
  console.log('Wrote', path.relative(legacyRoot, outfile));
}

for (const rel of ENTRIES) {
  await emitEntry(rel);
}
console.log(`Emitted ${ENTRIES.length} extension-legacy-best entry .js files.`);
