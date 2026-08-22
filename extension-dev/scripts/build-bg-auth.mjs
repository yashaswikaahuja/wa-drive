import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '../../packages/cc-bg-auth/src/auth.js'), 'utf8');
const out = path.join(dir, '../../extension/sw/bg-auth.js');
fs.writeFileSync(out, '/** AUTO-GENERATED — source: packages/cc-bg-auth/src/auth.js */\n' + src);
console.log('Wrote', out, src.split('\n').length, 'lines');
