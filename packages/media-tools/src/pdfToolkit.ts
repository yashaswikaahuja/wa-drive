/**
 * pdfToolkit — client-side PDF operations for the PDF Tools suite.
 *
 * Structural edits (merge, split, reorder, delete, rotate, resize, images→PDF)
 * run through pdf-lib so vector text and embedded images are preserved losslessly.
 * Compression rasterises each page with the app's pdf.js build and re-emits with
 * jsPDF — the same proven path composePrintPdf uses — because that is the only way
 * to actually shrink an image-heavy scan.
 *
 * Pure helpers (parsePageRanges, reorderIndices, paper math) take no DOM and are
 * unit-tested directly in node.
 */
import { PDFDocument, degrees } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

/** Hard caps so a malicious / huge file can't lock the tab. */
export const MAX_PAGES = 200;
const COMPRESS_MAX_PAGES = 100;

// ── Paper sizes (points; 1pt = 1/72") ──────────────────────────────────────
export type PaperId = 'a4' | 'a4-landscape' | 'letter' | '4x6' | '4x6-portrait';

export type PaperSize = { id: PaperId; label: string; wPt: number; hPt: number };

const MM_PER_IN = 25.4;
const PT_PER_IN = 72;
export const mmToPt = (mm: number) => (mm / MM_PER_IN) * PT_PER_IN;
export const inToPt = (inch: number) => inch * PT_PER_IN;

export const PAPERS: Record<PaperId, PaperSize> = {
  a4: { id: 'a4', label: 'A4 Portrait', wPt: mmToPt(210), hPt: mmToPt(297) },
  'a4-landscape': { id: 'a4-landscape', label: 'A4 Landscape', wPt: mmToPt(297), hPt: mmToPt(210) },
  letter: { id: 'letter', label: 'Letter', wPt: inToPt(8.5), hPt: inToPt(11) },
  '4x6': { id: '4x6', label: '4×6 Landscape', wPt: inToPt(6), hPt: inToPt(4) },
  '4x6-portrait': { id: '4x6-portrait', label: '4×6 Portrait', wPt: inToPt(4), hPt: inToPt(6) },
};

// ── Pure helpers (no DOM; unit-tested) ──────────────────────────────────────

/**
 * Parse a 1-based page-range string ("1-3, 5, 8-10") into sorted, de-duplicated
 * 0-based page indices, clamped to [0, pageCount). Throws on malformed input so
 * the UI can show a precise error. An empty / whitespace string means "all".
 */
export function parsePageRanges(input: string, pageCount: number): number[] {
  const text = (input || '').trim();
  if (!text) return Array.from({ length: pageCount }, (_, i) => i);
  const out = new Set<number>();
  for (const rawPart of text.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) throw new Error(`Invalid range: "${part}"`);
    const a = parseInt(m[1], 10);
    const b = m[2] != null ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1) throw new Error(`Pages start at 1: "${part}"`);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let p = lo; p <= hi; p++) {
      if (p <= pageCount) out.add(p - 1);
    }
  }
  if (!out.size) throw new Error('No pages selected');
  return [...out].sort((x, y) => x - y);
}

/** Move the item at `from` to `to`, returning a new array (used for reorder UIs). */
export function reorderIndices<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** contain-fit (letterbox) a w×h box inside pw×ph, centred. Returns points. */
export function fitContain(
  w: number, h: number, pw: number, ph: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(pw / Math.max(1, w), ph / Math.max(1, h));
  const dw = w * scale;
  const dh = h * scale;
  return { x: (pw - dw) / 2, y: (ph - dh) / 2, w: dw, h: dh };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Loading ─────────────────────────────────────────────────────────────────

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Load a PDFDocument from bytes. ignoreEncryption lets us open view-protected files. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

export async function pageCountOf(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdf(bytes);
  return doc.getPageCount();
}

// ── Structural ops (lossless, pdf-lib) ───────────────────────────────────────

/** Merge several PDFs (as byte arrays), in order, into one. */
export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  let total = 0;
  for (const bytes of sources) {
    const src = await loadPdf(bytes);
    const idx = src.getPageIndices();
    const copied = await out.copyPages(src, idx);
    for (const p of copied) {
      if (total >= MAX_PAGES) break;
      out.addPage(p);
      total++;
    }
  }
  if (out.getPageCount() === 0) throw new Error('Nothing to merge');
  return out.save();
}

/** Keep only `indices` (0-based, already validated), in the given order. */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  if (out.getPageCount() === 0) throw new Error('No pages selected');
  return out.save();
}

/** Remove `indices` (0-based); keep the rest in original order. */
export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const drop = new Set(indices);
  const keep = src.getPageIndices().filter((i) => !drop.has(i));
  if (!keep.length) throw new Error('Cannot delete every page');
  return extractPages(bytes, keep);
}

/** Re-emit pages in the given order (a permutation of 0..n-1). */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  return extractPages(bytes, order);
}

/**
 * Split by page ranges into one PDF per group.
 * `groups` is a list of 0-based index arrays (e.g. [[0,1,2],[3,4]]).
 */
export async function splitIntoPdfs(bytes: Uint8Array, groups: number[][]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const g of groups) {
    if (g.length) out.push(await extractPages(bytes, g));
  }
  if (!out.length) throw new Error('No pages selected');
  return out;
}

/** Rotate the given pages by a multiple of 90° (relative to current rotation). */
export async function rotatePages(
  bytes: Uint8Array, indices: number[], deltaDeg: number,
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const set = new Set(indices);
  const norm = (((deltaDeg % 360) + 360) % 360);
  pages.forEach((pg, i) => {
    if (!set.has(i)) return;
    const cur = pg.getRotation().angle || 0;
    pg.setRotation(degrees((cur + norm) % 360));
  });
  return doc.save();
}

/** Resize every page to a target paper, scaling content to contain-fit. */
export async function resizeToPaper(
  bytes: Uint8Array, paper: PaperSize, scalePct = 100,
): Promise<Uint8Array> {
  const src = await loadPdf(bytes);
  const out = await PDFDocument.create();
  const count = src.getPageCount();
  const pw = paper.wPt;
  const ph = paper.hPt;
  for (let i = 0; i < count; i++) {
    const embedded = await out.embedPage(src.getPage(i));
    const { width, height } = embedded;
    const page = out.addPage([pw, ph]);
    const fit = fitContain(width, height, pw, ph);
    const s = Math.max(0.1, Math.min(4, scalePct / 100));
    const w = fit.w * s;
    const h = fit.h * s;
    page.drawPage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return out.save();
}

/** Build a PDF from image files/blobs — one image per page, contain-fitted. */
export async function imagesToPdf(
  images: { bytes: Uint8Array; type: string }[], paper: PaperSize,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const img of images) {
    if (out.getPageCount() >= MAX_PAGES) break;
    const embedded = /png/i.test(img.type)
      ? await out.embedPng(img.bytes)
      : await out.embedJpg(img.bytes);
    const page = out.addPage([paper.wPt, paper.hPt]);
    const fit = fitContain(embedded.width, embedded.height, paper.wPt, paper.hPt);
    page.drawImage(embedded, fit);
  }
  if (out.getPageCount() === 0) throw new Error('No images added');
  return out.save();
}

// ── Compression (rasterise with pdf.js, re-emit with jsPDF) ──────────────────

export type CompressOptions = {
  /** Render density. 120 is screen-ish, 150 balanced, 200 print-sharp. */
  dpi: number;
  /** JPEG quality 0..1. */
  quality: number;
};

/**
 * Shrink an image-heavy PDF by re-rendering each page to a JPEG at the chosen
 * density/quality and packing them back at their original point size, so the
 * physical page dimensions are preserved.
 */
export async function compressPdf(bytes: Uint8Array, opts: CompressOptions): Promise<Uint8Array> {
  const dpi = Math.max(72, Math.min(300, Math.round(opts.dpi) || 150));
  const quality = Math.max(0.3, Math.min(0.95, opts.quality || 0.7));
  const pdf = await getDocument({ data: bytes.slice(0) }).promise;
  const count = Math.min(pdf.numPages, COMPRESS_MAX_PAGES);
  if (!count) throw new Error('PDF has no pages');

  let doc: jsPDF | null = null;
  for (let i = 1; i <= count; i++) {
    const pg = await pdf.getPage(i);
    const ptView = pg.getViewport({ scale: 1 }); // points = page size at 72 DPI
    const scale = dpi / 72;
    const view = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(view.width));
    canvas.height = Math.max(1, Math.floor(view.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: view, canvas }).promise;
    const jpeg = canvas.toDataURL('image/jpeg', quality);

    const wPt = ptView.width;
    const hPt = ptView.height;
    const orient = wPt > hPt ? 'landscape' : 'portrait';
    if (!doc) {
      doc = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt], compress: true });
    } else {
      doc.addPage([wPt, hPt], orient);
    }
    doc.addImage(jpeg, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
  }
  if (!doc) throw new Error('PDF has no renderable pages');
  const ab = doc.output('arraybuffer');
  return new Uint8Array(ab);
}

// ── Thumbnails (pdf.js) ──────────────────────────────────────────────────────

export type Thumb = { index: number; dataUrl: string; wPt: number; hPt: number };

/** Render page thumbnails as JPEG data URLs (for organise / preview grids). */
export async function renderThumbnails(bytes: Uint8Array, maxWidth = 160): Promise<Thumb[]> {
  const pdf = await getDocument({ data: bytes.slice(0) }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const out: Thumb[] = [];
  for (let i = 1; i <= count; i++) {
    const pg = await pdf.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / Math.max(1, base.width));
    const view = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(view.width));
    canvas.height = Math.max(1, Math.floor(view.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: view, canvas }).promise;
    out.push({ index: i - 1, dataUrl: canvas.toDataURL('image/jpeg', 0.7), wPt: base.width, hPt: base.height });
  }
  return out;
}

export function bytesToPdfBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.slice().buffer], { type: 'application/pdf' });
}
