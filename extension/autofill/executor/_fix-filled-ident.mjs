import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sequential.js');
let c = fs.readFileSync(p, 'utf8');
const before = c;
// Free identifier `filled` → `k.filled` (not k.filled already, not property key)
c = c.replace(/([^.\w'"\]])filled\b(?!\s*:)/g, '$1k.filled');
c = c.replace(/'k\.filled'/g, "'filled'");
c = c.replace(/"k\.filled"/g, '"filled"');
fs.writeFileSync(p, c);
console.log('changed', c !== before);
const lines = c.split(/\n/);
lines.forEach((l, i) => {
  if (/\bfilled\b/.test(l) && !/k\.filled/.test(l) && !/'filled'|"filled"|result:/.test(l)) {
    console.log('remain', i + 1, l.trim().slice(0, 140));
  }
});
