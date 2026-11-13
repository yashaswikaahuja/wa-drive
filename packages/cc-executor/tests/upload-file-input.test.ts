/**
 * upload-file-input.test.ts — assign a JPEG/PNG/PDF onto a file input.
 *
 * Run from the package: node --experimental-strip-types ../../tooling/run-package-tests.ts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcTs = readFileSync(join(__dirname, '../src/upload-file-input.ts'), 'utf8');
const { code: src } = await esbuild.transform(srcTs, { loader: 'ts', target: 'es2018' });
const globalLike: any = {};
new Function('globalThis', src)(globalLike);
const api = globalLike.CcUploadFile;

let passed = 0, failed = 0;
function assert(desc, actual, expected) {
  if (actual === expected) { console.log('  ✓', desc); passed++; }
  else { console.error('  ✗', desc); console.error('    expected:', expected); console.error('    actual:  ', actual); failed++; }
}

if (typeof (globalThis as any).DataTransfer !== 'function') {
  (globalThis as any).DataTransfer = class {
    items: any;
    files: any[];
    constructor() {
      this.files = [];
      const self = this;
      this.items = {
        add(file: any) { self.files.push(file); },
      };
    }
  };
}

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function fileInput(id: string, extra: any = {}) {
  const events: string[] = [];
  const el: any = {
    tagName: 'INPUT',
    type: 'file',
    id,
    name: id,
    accept: extra.accept || '',
    files: null,
    events,
    getAttribute(name: string) {
      if (name === 'type') return 'file';
      if (name === 'accept') return el.accept;
      if (name === 'id') return id;
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    dispatchEvent(ev: any) { events.push(ev && ev.type ? ev.type : String(ev)); return true; },
  };
  return el;
}

function docWith(inputs: any[]) {
  return {
    querySelector(sel: string) {
      if (sel && sel.charAt(0) === '#') return inputs.find((el) => '#' + el.id === sel) || null;
      if (sel === 'input[type="file"]') return inputs[0] || null;
      return null;
    },
    querySelectorAll(sel: string) {
      if (sel === 'input[type="file"]' || String(sel).indexOf('file') !== -1) return inputs;
      if (sel && sel.charAt(0) === '#') return inputs.filter((el) => '#' + el.id === sel);
      return [];
    },
  };
}

console.log('\nmatchesAccept');
assert('empty accept allows jpeg', api.matchesAccept('', 'image/jpeg', 'a.jpg'), true);
assert('image/* allows jpeg', api.matchesAccept('image/*', 'image/jpeg', 'a.jpg'), true);
assert('image/* rejects pdf', api.matchesAccept('image/*', 'application/pdf', 'a.pdf'), false);
assert('.pdf allows pdf', api.matchesAccept('.pdf', 'application/pdf', 'doc.pdf'), true);
assert('.jpg allows jpeg mime', api.matchesAccept('.jpg', 'image/jpeg', 'photo.jpg'), true);
assert('exact mime', api.matchesAccept('application/pdf', 'application/pdf', 'x.pdf'), true);

console.log('\nfindFileInput');
const photo = fileInput('90837', { accept: 'image/*' });
const wrap = {
  tagName: 'DIV',
  id: 'wrap',
  parentElement: null,
  querySelector(sel: string) { return sel.indexOf('file') !== -1 ? photo : null; },
};
photo.parentElement = wrap;
const doc = docWith([photo]);
assert('id selector finds file input', api.findFileInput('#90837', doc) === photo, true);
assert('wrapper finds inner file input', api.findFileInput('#wrap', {
  querySelector(sel: string) { return sel === '#wrap' ? wrap : (sel === '#90837' ? photo : null); },
  querySelectorAll() { return [photo]; },
}) === photo, true);

console.log('\nassignFileInput');
const assigned = api.assignFileInput({
  selector: '#90837',
  filename: 'photo.png',
  mimeType: 'image/png',
  data: PNG_1X1,
  document: doc,
});
assert('ok', assigned.ok, true);
assert('fileName', assigned.fileName, 'photo.png');
assert('mimeType', assigned.mimeType, 'image/png');
assert('fileCount', assigned.fileCount, 1);
assert('fileSize > 0', assigned.fileSize > 0, true);
assert('files assigned', photo.files && photo.files.length, 1);
assert('change event', photo.events.indexOf('change') >= 0, true);
assert('input event', photo.events.indexOf('input') >= 0, true);

const missing = api.assignFileInput({ selector: '', data: PNG_1X1, mimeType: 'image/png', document: doc });
assert('selector required', missing.error, 'selector_required');

const badMime = api.assignFileInput({
  selector: '#90837',
  filename: 'x.bin',
  mimeType: 'application/zip',
  data: PNG_1X1,
  document: doc,
});
assert('zip rejected', badMime.error, 'mime_not_allowed');

const pdfInput = fileInput('doc', { accept: 'application/pdf,.pdf' });
const pdfDoc = docWith([pdfInput]);
const pngOnPdf = api.assignFileInput({
  selector: '#doc',
  filename: 'photo.png',
  mimeType: 'image/png',
  data: PNG_1X1,
  document: pdfDoc,
});
assert('png rejected by pdf accept', pngOnPdf.error, 'accept_mismatch');

const pathLeak = api.assignFileInput({
  selector: '#90837',
  filename: 'C:\\\\Users\\\\op\\\\secret.png',
  mimeType: 'image/png',
  data: PNG_1X1,
  document: doc,
});
assert('path stripped to basename', pathLeak.ok, true);
assert('basename only', pathLeak.fileName, 'secret.png');

if (failed) { console.error('\n' + failed + ' failed'); process.exit(1); }
console.log('\n' + passed + ' passed');
