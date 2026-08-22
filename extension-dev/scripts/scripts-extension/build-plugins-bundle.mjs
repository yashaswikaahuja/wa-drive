import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(dir, '../../../packages/cc-plugins/src');
const ORDER = ['interface.js','cascade-select.js','ng-dropdown.js','button-click.js','keystroke-input.js','network-monitor.js'];
const parts = ['/**\n * AUTO-GENERATED\n * Source: packages/cc-plugins/src/\n * Rebuild: node extension/autofill/build-plugins-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(srcDir, name); if (!fs.existsSync(p)) throw new Error('missing '+name);
  const src = fs.readFileSync(p,'utf8');
  parts.push('\n/* ==== '+name+' ==== */\n'); parts.push(src); if (!src.endsWith('\n')) parts.push('\n');
}
const out = path.join(dir,'../../../extension/autofill/plugins-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
