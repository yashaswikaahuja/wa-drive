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

export type DocCell = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Source bitmap for this cell. */
  canvas: HTMLCanvasElement;
  label?: string;
};

export type DocPage = {
  id: string;
  cells: DocCell[];
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

/** Place image contain-fitted inside a box (document Xerox — no face crop). */
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

/** One image → one page, fitted with margin (default café document layout). */
export function fitImageOnPage(
  src: HTMLCanvasElement,
  paper: DocPaperDef,
  marginMm = 10,
  label?: string,
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
        label,
      },
    ],
  };
}

export function renderPageCanvas(page: DocPage, paper: DocPaperDef, selectedId?: string | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const cell of page.cells) {
    drawContain(ctx, cell.canvas, cell.x, cell.y, cell.w, cell.h);
    if (cell.id === selectedId) {
      ctx.strokeStyle = 'hsl(27 95% 55%)';
      ctx.lineWidth = 6;
      ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
      const hs = 28;
      ctx.fillStyle = 'hsl(27 95% 55%)';
      ctx.fillRect(cell.x + cell.w - hs, cell.y + cell.h - hs, hs, hs);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + cell.w - hs, cell.y + cell.h - hs, hs, hs);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
    }
  }
  return c;
}

function canvasToJpegDataUrl(c: HTMLCanvasElement, quality = 0.92): string {
  return c.toDataURL('image/jpeg', quality);
}

/**
 * Build a print-ready PDF: each layout page → one PDF page at the chosen paper size.
 * OS print dialog then mostly asks printer/copies, not page/margins.
 */
export async function pagesToPdfBlob(pages: DocPage[], paper: DocPaperDef): Promise<Blob> {
  if (!pages.length) throw new Error('Nothing to print');

  const format: string | [number, number] =
    paper.id.startsWith('a4')
      ? 'a4'
      : [paper.wMm, paper.hMm];

  const pdf = new jsPDF({
    orientation: paper.orient,
    unit: 'mm',
    format,
    compress: true,
  });

  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage(format, paper.orient);
    const sheet = renderPageCanvas(page, paper, null);
    const data = canvasToJpegDataUrl(sheet);
    pdf.addImage(data, 'JPEG', 0, 0, paper.wMm, paper.hMm, undefined, 'FAST');
  });

  return pdf.output('blob');
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
