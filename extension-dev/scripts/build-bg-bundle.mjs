/**
 * Concatenate packages/cc-background/ modules into extension/sw/bg-bundle.js
 * Run: node extension-dev/scripts/build-bg-bundle.mjs
 */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const bgDir = path.join(dir, '../../packages/cc-background');

// Load order matters — auth first, teach last
const ORDER = [
  'auth/src/auth.js',
  'label-utils/src/label-utils.js',
  'wss-manager/src/wss-manager.js',
  'bridge/src/bridge.js',
  'job-dispatch/src/job-dispatch.js',
  'teach/src/teach.js',
];

const parts = ['/**\n * AUTO-GENERATED — do not edit.\n * Source: packages/cc-background/\n * Rebuild: node extension-dev/scripts/build-bg-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(bgDir, name);
  if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  parts.push('\n/* ==== ' + name + ' ==== */\n');
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

const out = path.join(dir, '../../extension/sw/bg-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
