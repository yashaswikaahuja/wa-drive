import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const snap = fs.readFileSync(path.join(dir, '_source_snapshot.js'), 'utf8').split(/\r?\n/);
const body = snap.slice(507, 1159); // fillOne function lines 508-1159

function find(pred, from = 0) {
  for (let i = from; i < body.length; i++) if (pred(body[i])) return i;
  return -1;
}

const idx = {
  ng: find((l) => l.includes("elType === 'ng-dropdown'")),
  mat: find((l) => l.includes("elType === 'mat-select'")),
  radioClick: find((l) => l.includes("type === 'radio-click'")),
  select: find((l) => l.includes("if (elType === 'select')")),
  radioElse: find((l) => l.includes("} else if (elType === 'radio')")),
  checkbox: find((l) => l.includes("} else if (elType === 'checkbox')")),
  file: find((l) => l.includes("el.type === 'file'")),
  flatpickr: find((l) => l.includes('_flatpickr') || l.includes('flatpickr-input')),
  text: find((l) => l.includes('keystroke-style fill') || l.includes('Angular/React compatible')),
  poll: find((l) => l.includes('Poll for matching option')),
};
console.log('relative indices in fillOne body:');
for (const [k, v] of Object.entries(idx)) {
  console.log(k, v, '=> snap line', v >= 0 ? v + 508 : -1);
}
console.log('fillOne body length', body.length);

// write raw slices for handlers (0-based relative)
function dump(name, a, b) {
  const chunk = body.slice(a, b).join('\n');
  fs.writeFileSync(path.join(dir, name), chunk);
  console.log(name, b - a, 'lines');
}

dump('_slice_ng_a.js', idx.ng, idx.poll);
dump('_slice_ng_b.js', idx.poll, idx.mat);
dump('_slice_mat.js', idx.mat, idx.radioClick);
dump('_slice_choice_a.js', idx.radioClick, idx.select);
dump('_slice_select.js', idx.select, idx.radioElse);
dump('_slice_choice_b.js', idx.radioElse, idx.flatpickr);
dump('_slice_date.js', idx.flatpickr, idx.text);
dump('_slice_text.js', idx.text, body.length - 1); // exclude closing brace of fillOne
