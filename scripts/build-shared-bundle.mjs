import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(dir, '../packages/cc-shared/src');
const ORDER = ['network-idle.js','dom-utils.js','label-utils.js','option-match.js','select-apply.js','llm-client.js','semantic-aliases.js','legacy-fill-gate.js'];
const parts = ['/**\n * AUTO-GENERATED\n * Source: packages/cc-shared/src/\n * Rebuild: node extension/build-shared-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(srcDir, name); if (!fs.existsSync(p)) throw new Error('missing '+name);
  const src = fs.readFileSync(p,'utf8');
  parts.push('\n/* ==== '+name+' ==== */\n'); parts.push(src); if (!src.endsWith('\n')) parts.push('\n');
}
const out = path.join(dir,'../extension/shared-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
