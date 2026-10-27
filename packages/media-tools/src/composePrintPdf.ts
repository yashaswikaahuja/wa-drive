/**
 * Post-process the final print PDF for a cybercafé counter:
 *  - copies: print the whole job N times
 *  - nUp: place 1, 2 or 4 document pages on one physical sheet (toner/paper saver)
 *
 * The source PDF (with stamps, text and drawings already baked by the viewer)
 * is rasterised with the app's pdf.js build, then re-emitted with jsPDF so
 * everything the operator sees is preserved. N-up tiles the distinct document
 * pages; copies then repeats the resulting sheets.
 */
import { jsPDF } from 'jspdf';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocPaperDef } from './documentPrintLayout';

GlobalWorkerOptions.workerSrc = pdfWorker;

export type NUp = 1 | 2 | 4;

export type ComposeOptions = {
  copies: number;
  nUp: NUp;
  paper: DocPaperDef;
};

/** Target raster density. 200 DPI keeps text crisp while staying light. */
const DPI = 200;
const MAX_PAGES = 60;

type Slot = { x: number; y: number; w: number; h: number };

/** Where each tile sits on the sheet (mm), for the given N-up and paper orientation. */
function slots(nUp: NUp, pw: number, ph: number, gap: number): Slot[] {
  if (nUp === 1) return [{ x: 0, y: 0, w: pw, h: ph }];
  // Split the long side so each tile keeps a portrait-ish shape.
  if (nUp === 2) {
    if (ph >= pw) {
      const h = (ph - gap) / 2;
      return [
        { x: 0, y: 0, w: pw, h },
        { x: 0, y: h + gap, w: pw, h },
      ];
    }
    const w = (pw - gap) / 2;
    return [
      { x: 0, y: 0, w, h: ph },
      { x: w + gap, y: 0, w, h: ph },
    ];
  }
  const w = (pw - gap) / 2;
  const h = (ph - gap) / 2;
  return [
    { x: 0, y: 0, w, h },
    { x: w + gap, y: 0, w, h },
    { x: 0, y: h + gap, w, h },
    { x: w + gap, y: h + gap, w, h },
  ];
}

/** Draw a rendered page image contain-fitted (letterboxed) inside a slot. */
function fitInSlot(iw: number, ih: number, slot: Slot): Slot {
  const sa = iw / Math.max(1, ih);
  const da = slot.w / Math.max(1, slot.h);
  let w = slot.w;
  let h = slot.h;
  if (sa > da) h = slot.w / sa;
  else w = slot.h * sa;
  return { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
}

/** Render every page of the source PDF to a JPEG data URL at print density. */
async function renderPages(source: ArrayBuffer): Promise<{ url: string; w: number; h: number }[]> {
  const pdf = await getDocument({ data: source.slice(0) }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const out: { url: string; w: number; h: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const pg = await pdf.getPage(i);
    // scale from points (1/72") to the chosen print density.
    const scale = DPI / 72;
    const viewport = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push({ url: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height });
  }
  if (!out.length) throw new Error('PDF has no pages');
  return out;
}

/**
 * Compose the final print PDF. With copies=1 and nUp=1 this is a faithful
 * re-encode of the source (used so the output always goes through one path).
 */
export async function composePrintPdf(source: Blob, opts: ComposeOptions): Promise<Blob> {
  const copies = Math.max(1, Math.min(99, Math.floor(opts.copies) || 1));
  const nUp = opts.nUp;
  const { paper } = opts;
  const bytes = await source.arrayBuffer();
  const rendered = await renderPages(bytes);

  const format: [number, number] = [paper.wMm, paper.hMm];
  const pdf = new jsPDF({ orientation: paper.orient, unit: 'mm', format, compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();

  // Tile the distinct document pages into sheets for the chosen N-up.
  const gap = nUp === 1 ? 0 : 4; // mm between tiles
  const sheetSlots = slots(nUp, pw, ph, gap);
  const sheets: { img: { url: string; w: number; h: number }; slot: Slot }[][] = [];
  for (let i = 0; i < rendered.length; i += nUp) {
    const sheet: { img: { url: string; w: number; h: number }; slot: Slot }[] = [];
    for (let s = 0; s < nUp && i + s < rendered.length; s++) {
      sheet.push({ img: rendered[i + s], slot: sheetSlots[s] });
    }
    sheets.push(sheet);
  }

  let first = true;
  for (let c = 0; c < copies; c++) {
    for (const sheet of sheets) {
      if (!first) pdf.addPage(format, paper.orient);
      first = false;
      for (const { img, slot } of sheet) {
        const fit = fitInSlot(img.w, img.h, slot);
        pdf.addImage(img.url, 'JPEG', fit.x, fit.y, fit.w, fit.h, undefined, 'FAST');
      }
    }
  }

  return new Blob([pdf.output('blob')], { type: 'application/pdf' });
}
