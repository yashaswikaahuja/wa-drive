/**
 * Document print layout — JPEG/WhatsApp docs composed on paper, then silent PDF for print.
 * Avoids OS print dialog asking again for page size / margins (PDF already is the page).
 */
import { jsPDF } from 'jspdf';
import { mm, PAPER_4X6_L, PAPER_A4_L, PAPER_A4_P, PAPER_MM } from './sheetGeometry';

export type DocPaperId = 'a4' | 'a4-landscape' | '4x6';

export type DocPaperDef = {
  id: string;
  label: string;
  w: number;
  h: number;
  wMm: number;
  hMm: number;
  orient: 'portrait' | 'landscape';
};

export const DOC_PAPERS: Record<DocPaperId, DocPaperDef> = {
  a4: {
    id: PAPER_A4_P.id,
    label: 'A4 Portrait',
    w: PAPER_A4_P.w,
    h: PAPER_A4_P.h,
    ...PAPER_MM['a4-portrait'],
  },
  'a4-landscape': {
    id: PAPER_A4_L.id,
    label: 'A4 Landscape',
    w: PAPER_A4_L.w,
    h: PAPER_A4_L.h,
    ...PAPER_MM['a4-landscape'],
  },
  '4x6': {
    id: PAPER_4X6_L.id,
    label: '4×6',
    w: PAPER_4X6_L.w,
    h: PAPER_4X6_L.h,
    ...PAPER_MM['4x6-landscape'],
  },
};

export type DocFitMode = 'contain' | 'cover';

export type DocCell = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Working bitmap for this cell (after crop/rotate/flip/tone). */
  canvas: HTMLCanvasElement;
  /** Pre-tone bitmap so brightness/contrast can be re-applied. */
  baseCanvas?: HTMLCanvasElement;
  /** Whiteout and similar: filters leave it alone. */
  plain?: boolean;
  /** Original photo before auto edge-crop, so Crop can re-adjust from it. */
  rawCanvas?: HTMLCanvasElement;
  fitMode?: DocFitMode;
  brightness?: number;
  contrast?: number;
  label?: string;
};

export type DocTextMark = {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
  color: string;
};

export type DocBoxMark = {
  id: string;
  kind: 'box';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
};

export type DocMark = DocTextMark | DocBoxMark;

export type DocPage = {
  id: string;
  cells: DocCell[];
  marks: DocMark[];
};

export function makeId(prefix = 'd') {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function imageToCanvas(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  if (img instanceof HTMLCanvasElement) return img;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** Place image contain-fitted inside a box (document Xerox — letterbox). */
export function drawContain(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sa = src.width / Math.max(1, src.height);
  const da = w / Math.max(1, h);
  let dw = w;
  let dh = h;
  let dx = x;
  let dy = y;
  if (sa > da) {
    dh = w / sa;
    dy = y + (h - dh) / 2;
  } else {
    dw = h * sa;
    dx = x + (w - dw) / 2;
  }
  ctx.drawImage(src, dx, dy, dw, dh);
}

/** Cover-fit: fill the box, crop overflow (photo paper fill). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const sa = src.width / Math.max(1, src.height);
  const da = w / Math.max(1, h);
  let sw = src.width;
  let sh = src.height;
  let sx = 0;
  let sy = 0;
  if (sa > da) {
    sw = src.height * da;
    sx = (src.width - sw) / 2;
  } else {
    sh = src.width / da;
    sy = (src.height - sh) / 2;
  }
  ctx.drawImage(src, sx, sy, sw, sh, x, y, w, h);
}

export function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** One image → one page, fitted with margin (default café document layout). */
export function fitImageOnPage(
  src: HTMLCanvasElement,
  paper: DocPaperDef,
  marginMm = 10,
  label?: string,
  fitMode: DocFitMode = 'contain',
): DocPage {
  const margin = mm(marginMm);
  return {
    id: makeId('p'),
    cells: [
      {
        id: makeId('c'),
        x: margin,
        y: margin,
        w: Math.max(mm(20), paper.w - margin * 2),
        h: Math.max(mm(20), paper.h - margin * 2),
        canvas: src,
        baseCanvas: cloneCanvas(src),
        fitMode,
        brightness: 0,
        contrast: 0,
        label,
      },
    ],
    marks: [],
  };
}

/** Empty sheet. Images, text, and whiteout are added onto it. */
export function blankPage(paper: DocPaperDef): DocPage {
  void paper;
  return { id: makeId('p'), cells: [], marks: [] };
}

/** Resize a single cell to sit in the page with the given margin (mm). */
export function cellInMargin(
  cell: DocCell,
  paper: DocPaperDef,
  marginMm: number,
): Pick<DocCell, 'x' | 'y' | 'w' | 'h'> {
  void cell;
  const margin = mm(marginMm);
  return {
    x: margin,
    y: margin,
    w: Math.max(mm(20), paper.w - margin * 2),
    h: Math.max(mm(20), paper.h - margin * 2),
  };
}

function drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = 'hsl(27 95% 55%)';
  ctx.lineWidth = 6;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  const hs = 28;
  ctx.fillStyle = 'hsl(27 95% 55%)';
  ctx.fillRect(x + w - hs, y + h - hs, hs, hs);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + w - hs, y + h - hs, hs, hs);
}

function drawMark(ctx: CanvasRenderingContext2D, mark: DocMark, guides: boolean) {
  if (mark.kind === 'box') {
    ctx.fillStyle = mark.fill;
    ctx.fillRect(mark.x, mark.y, mark.w, mark.h);
    if (guides) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20,20,20,0.55)';
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 4;
      ctx.strokeRect(mark.x + 2, mark.y + 2, Math.max(1, mark.w - 4), Math.max(1, mark.h - 4));
      ctx.restore();
    }
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(mark.x, mark.y, mark.w, mark.h);
  ctx.clip();
  ctx.fillStyle = mark.color;
  ctx.font = `600 ${mark.size}px Inter, sans-serif`;
  ctx.textBaseline = 'top';
  const words = (mark.text || ' ').split(/\s+/);
  let line = '';
  let y = mark.y + 4;
  const lh = Math.round(mark.size * 1.25);
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > mark.w - 8 && line) {
      ctx.fillText(line, mark.x + 6, y);
      line = word;
      y += lh;
      if (y > mark.y + mark.h) break;
    } else {
      line = test;
    }
  }
  if (line && y <= mark.y + mark.h) ctx.fillText(line, mark.x + 6, y);
  ctx.restore();
}

export function renderPageCanvas(
  page: DocPage,
  paper: DocPaperDef,
  selectedId?: string | null,
  guides = false,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const cell of page.cells) {
    const mode = cell.fitMode || 'contain';
    if (mode === 'cover') drawCover(ctx, cell.canvas, cell.x, cell.y, cell.w, cell.h);
    else drawContain(ctx, cell.canvas, cell.x, cell.y, cell.w, cell.h);
  }
  for (const mark of page.marks || []) drawMark(ctx, mark, guides);

  for (const cell of page.cells) {
    if (cell.id === selectedId) drawSelection(ctx, cell.x, cell.y, cell.w, cell.h);
  }
  for (const mark of page.marks || []) {
    if (mark.id === selectedId) drawSelection(ctx, mark.x, mark.y, mark.w, mark.h);
  }
  return c;
}

function canvasToJpegDataUrl(c: HTMLCanvasElement, quality = 0.92): string {
  return c.toDataURL('image/jpeg', quality);
}

/**
 * Build a print-ready PDF: each layout page → one PDF page at the chosen paper size.
 *
 * jsPDF custom formats: orientation decides which side is width.
 * - landscape + [152.4, 101.6] → 152.4×101.6 (4×6 photo paper)
 * - portrait  + [152.4, 101.6] → 101.6×152.4 (swapped — wrong for 4×6)
 * Always pass paper.orient so MediaBox matches the paper picker.
 */
export async function pagesToPdfBlob(pages: DocPage[], paper: DocPaperDef): Promise<Blob> {
  if (!pages.length) throw new Error('Nothing to print');

  const format: [number, number] = [paper.wMm, paper.hMm];
  const pdf = new jsPDF({
    orientation: paper.orient,
    unit: 'mm',
    format,
    compress: true,
  });

  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  if (Math.abs(pw - paper.wMm) > 0.6 || Math.abs(ph - paper.hMm) > 0.6) {
    throw new Error(
      `PDF page size mismatch: got ${pw.toFixed(1)}×${ph.toFixed(1)} mm, expected ${paper.wMm}×${paper.hMm} mm`,
    );
  }

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage(format, paper.orient);
    const sheet = renderPageCanvas(page, paper, null);
    const data = canvasToJpegDataUrl(sheet, 0.93);
    pdf.addImage(data, 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  });

  const blob = pdf.output('blob');
  // Ensure MIME is PDF so Chrome print viewer reads MediaBox.
  return new Blob([blob], { type: 'application/pdf' });
}

/** Empty sheets at the paper size. Photos are stamped on top so they can move. */
export async function blankSheetsPdfBlob(count: number, paper: DocPaperDef): Promise<Blob> {
  const n = Math.max(1, count);
  const format: [number, number] = [paper.wMm, paper.hMm];
  const pdf = new jsPDF({
    orientation: paper.orient,
    unit: 'mm',
    format,
    compress: true,
  });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  if (Math.abs(pw - paper.wMm) > 0.6 || Math.abs(ph - paper.hMm) > 0.6) {
    throw new Error(
      `PDF page size mismatch: got ${pw.toFixed(1)}×${ph.toFixed(1)} mm, expected ${paper.wMm}×${paper.hMm} mm`,
    );
  }
  for (let i = 1; i < n; i++) pdf.addPage(format, paper.orient);
  return new Blob([pdf.output('blob')], { type: 'application/pdf' });
}

/** Parse first MediaBox from a PDF blob (points). 1 pt = 1/72 in. */
export async function readPdfMediaBoxPts(blob: Blob): Promise<{ w: number; h: number } | null> {
  const text = await blob.text();
  const m = text.match(/\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/);
  if (!m) return null;
  const x0 = Number(m[1]);
  const y0 = Number(m[2]);
  const x1 = Number(m[3]);
  const y1 = Number(m[4]);
  return { w: x1 - x0, h: y1 - y0 };
}

export function ptsToMm(pts: number) {
  return (pts * 25.4) / 72;
}

/** Deep-link from media-viewer Print (JPEG). */
export function documentPrintPath(opts: {
  fileId: string;
  from?: string;
  phone?: string;
  name?: string;
  /** Extra drive file ids to load as additional pages. */
  fileIds?: string[];
  paper?: DocPaperId;
}): string {
  const q = new URLSearchParams();
  q.set('fileId', opts.fileId);
  if (opts.fileIds?.length) {
    const rest = opts.fileIds.filter((id) => id && id !== opts.fileId);
    if (rest.length) q.set('fileIds', rest.join(','));
  }
  if (opts.phone) q.set('phone', opts.phone);
  if (opts.name) q.set('name', opts.name);
  if (opts.from) q.set('from', opts.from);
  if (opts.paper && opts.paper !== 'a4') q.set('paper', opts.paper);
  return `/app/photos/doc-print?${q.toString()}`;
}
