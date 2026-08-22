import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '../../packages/cc-background/job-dispatch/src/job-dispatch.js'), 'utf8');
const out = path.join(dir, '../../extension/sw/background/bg-job-dispatch.js');
fs.writeFileSync(out, '/** AUTO-GENERATED — source: packages/cc-background/job-dispatch/src/job-dispatch.js */\n' + src);
console.log('Wrote', out, src.split('\n').length, 'lines');
