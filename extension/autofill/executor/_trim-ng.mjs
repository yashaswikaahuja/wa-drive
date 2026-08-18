import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
let c = fs.readFileSync(path.join(dir, 'fill-one-ng.js'), 'utf8');

const cancelBlock =
  /if \(window\._ccReplaySessions\.has\(_label\)\) \{[\s\S]*?window\._ccReplaySessions\.delete\(_label\);\s*\}/;
if (cancelBlock.test(c)) {
  c = c.replace(cancelBlock, 'k._ngCancelSession && k._ngCancelSession(_label);');
}

c = c.replace(
  /const session = \{[\s\S]*?startedAt: Date\.now\(\),\s*\};/,
  'const session = { id: Math.random().toString(36).slice(2,8), fieldKey: _label, resolved: false, cancelled: false, pollTimer: null, timeoutIds: [], observer: null, startedAt: Date.now() };'
);

// drop blank lines
c = c
  .split('\n')
  .filter((l, i, a) => l.trim() || (a[i - 1] && a[i - 1].trim()))
  .join('\n');
if (!c.endsWith('\n')) c += '\n';
fs.writeFileSync(path.join(dir, 'fill-one-ng.js'), c);
console.log('ng', c.split('\n').length);

let h = fs.readFileSync(path.join(dir, 'fill-one-ng-helpers.js'), 'utf8');
if (!h.includes('_ngCancelSession')) {
  h = h.replace(
    'k._ngPickOption = function',
    `k._ngCancelSession = function (_label) {
      if (!window._ccReplaySessions || !window._ccReplaySessions.has(_label)) return;
      const old = window._ccReplaySessions.get(_label);
      old.cancelled = true;
      clearInterval(old.pollTimer);
      old.timeoutIds.forEach((id) => clearTimeout(id));
      if (old.observer) old.observer.disconnect();
      window._ccReplaySessions.delete(_label);
    };

    k._ngPickOption = function`
  );
  fs.writeFileSync(path.join(dir, 'fill-one-ng-helpers.js'), h);
}
console.log('helpers', fs.readFileSync(path.join(dir, 'fill-one-ng-helpers.js'), 'utf8').split('\n').length);
