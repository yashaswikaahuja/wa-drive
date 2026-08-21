import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(dir, '../packages/cc-drivers/src');
const ORDER = ['dispatch.js','dom.js','input.js','select.js','interaction.js'];
const parts = ['/**\n * AUTO-GENERATED\n * Source: packages/cc-drivers/src/\n * Rebuild: node extension/build-drivers-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(srcDir, name); if (!fs.existsSync(p)) throw new Error('missing '+name);
  const src = fs.readFileSync(p,'utf8');
  parts.push('\n/* ==== '+name+' ==== */\n'); parts.push(src); if (!src.endsWith('\n')) parts.push('\n');
}
const out = path.join(dir,'../extension/drivers-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
