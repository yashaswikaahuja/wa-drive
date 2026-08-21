import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(dir, '../../packages/cc-wss/src');
const ORDER = ['ws-client.js', 'wss-session.js'];
const parts = ['/**\n * AUTO-GENERATED\n * Source: packages/cc-wss/src/\n * Rebuild: node extension-dev/scripts/build-wss-bundle.mjs\n */\n'];
for (const name of ORDER) {
  const p = path.join(srcDir, name); if (!fs.existsSync(p)) throw new Error('missing '+name);
  const src = fs.readFileSync(p,'utf8');
  parts.push('\n/* ==== '+name+' ==== */\n'); parts.push(src); if (!src.endsWith('\n')) parts.push('\n');
}
const out = path.join(dir, '../extension/sw/wss-bundle.js');
fs.writeFileSync(out, parts.join(''));
console.log('Wrote', out, parts.join('').split(/\n/).length, 'lines');
