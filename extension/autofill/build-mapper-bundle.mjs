/**
 * Concatenate autofill/mapper/capabilities/*.js (+ facade) into one inject file.
 * Run: node extension/autofill/build-mapper-bundle.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const mapDir = path.join(dir, '../../packages/cc-mapper/src');

const ORDER = [
  'field-aliases.js',
  'field-ident.js',
  'resolve-choice.js',
  'decide-conditional.js',
  'fuzzy-match.js',
  'ai-match.js',
];

const parts = [];
parts.push(`/**\n * AUTO-GENERATED — do not edit.\n * Source: autofill/mapper/capabilities/*.js + mapper.js (facade)\n * Rebuild: node extension/autofill/build-mapper-bundle.mjs\n */\n`);

for (const name of ORDER) {
  const p = path.join(mapDir, name);
  if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  parts.push(`\n/* ==== ${name} ==== */\n`);
  parts.push(src);
  if (!src.endsWith('\n')) parts.push('\n');
}

const facade = fs.readFileSync(path.join(dir, 'mapper.js'), 'utf8');
parts.push(`\n/* ==== mapper.js (facade) ==== */\n`);
parts.push(facade);
if (!facade.endsWith('\n')) parts.push('\n');

const out = path.join(dir, 'mapper-bundle.js');
fs.writeFileSync(out, parts.join(''));
const n = parts.join('').split(/\n/).length;
console.log('Wrote', out, n, 'lines');
