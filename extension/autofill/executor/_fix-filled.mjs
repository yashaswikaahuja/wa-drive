import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, 'utf8');
  const before = c;
  c = c.replace(/'k\.filled'/g, "'filled'");
  c = c.replace(/"k\.filled"/g, '"filled"');
  if (c !== before) {
    fs.writeFileSync(p, c);
    console.log('fixed strings in', f);
  }
  const lines = c.split(/\n/);
  lines.forEach((l, i) => {
    if (l.includes('k.filled')) console.log(f + ':' + (i + 1), l.trim().slice(0, 100));
  });
}
