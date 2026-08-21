/**
 * Concatenate application/orchestrator/capabilities/*.js (+ facade) into one file.
 * Run: node extension/application/build-orchestrator-bundle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const orchDir = path.join(dir, 'orchestrator');

const ORDER = [
  'capabilities/script-manifests.js',
  'capabilities/flatten-profile.js',
  'capabilities/sequential-kernel-fill.js',
  'capabilities/action-plan-fill.js',
];

const parts = [];
parts.push(`/**\n * AUTO-GENERATED — do not edit.\n * Source: application/orchestrator/capabilities/*.js + fill-orchestrator.js (facade)\n * Rebuild: node extension/application/build-orchestrator-bundle.mjs\n */\n`);

for (const name of ORDER) {
  const p = path.join(orchDir, name);
  if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  parts.push(`\n/* ==== ${name} ==== */\n`);
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

const facade = fs.readFileSync(path.join(dir, 'fill-orchestrator.js'), 'utf8');
parts.push(`\n/* ==== fill-orchestrator.js (facade) ==== */\n`);
parts.push(facade);
if (!facade.endsWith('\n')) parts.push('\n');

const out = path.join(dir, 'orchestrator-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
