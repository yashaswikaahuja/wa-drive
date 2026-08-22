/**
 * Build bg-bundle.js — the Chrome MV3 service worker.
 * Inlines all dependencies directly (no importScripts) for reliability.
 * Run: node extension-dev/scripts/build-bg-bundle.mjs
 */
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '../..');
const bgDir = path.join(root, 'packages/cc-background');

// Files to INLINE (no importScripts — more reliable in MV3)
const INLINE = [
  // External deps — inlined directly
  path.join(root, 'extension/sw/wss-bundle.js'),
  path.join(root, 'extension/sw/wss-bridge.js'),
  path.join(root, 'extension/sw/auth-refresh.js'),
  // cc-background modules
  path.join(bgDir, 'auth/src/auth.js'),
  path.join(bgDir, 'label-utils/src/label-utils.js'),
  path.join(bgDir, 'wss-manager/src/wss-manager.js'),
  path.join(bgDir, 'bridge/src/bridge.js'),
  path.join(bgDir, 'job-dispatch/src/job-dispatch.js'),
  path.join(bgDir, 'teach/src/teach.js'),
  path.join(bgDir, 'composer/src/composer.js'),
];

// Files to load via importScripts at top (knowledge-sync, shared-bundle
// must be importScripts because they're large and used across contexts)
const IMPORT_SCRIPTS = [
  'knowledge-sync.js',
  'shared-bundle.js',
];

const parts = [
  '/**\n * AUTO-GENERATED — do not edit.\n * Source: packages/cc-background/ + extension/sw/\n * Rebuild: node extension-dev/scripts/build-bg-bundle.mjs\n */\n\n',
];

// importScripts at very top
for (const s of IMPORT_SCRIPTS) {
  parts.push(`try { importScripts('${s}'); } catch (e) { console.warn('[CC] ${s} load failed:', e.message); }\n`);
}
parts.push('\n');

// Inline everything else
for (const p of INLINE) {
  if (!fs.existsSync(p)) throw new Error('missing: ' + p);
  const name = path.relative(root, p);
  const src = fs.readFileSync(p, 'utf8');
  parts.push(`\n/* ==== ${name} ==== */\n`);
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

const out = path.join(root, 'extension/bg-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
