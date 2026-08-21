import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['derive/capabilities/derive-profile.js'];
const parts = ['/**\n * AUTO-GENERATED\n * Source: autofill/derive/capabilities/*.js + derive.js\n * Rebuild: node extension/autofill/build-derive-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(dir, name); if (!fs.existsSync(p)) throw new Error('missing ' + name);
  const src = fs.readFileSync(p, 'utf8');
  parts.push('\n/* ==== ' + name + ' ==== */\n'); parts.push(src); if (!src.endsWith('\n')) parts.push('\n');
}
const facade = fs.readFileSync(path.join(dir, 'derive.js'), 'utf8');
parts.push('\n/* ==== derive.js (facade) ==== */\n'); parts.push(facade); if (!facade.endsWith('\n')) parts.push('\n');
const out = path.join(dir, 'derive-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
