/**
 * Rasterize a PDF into paper-sized pages with the same pdf.js build the app ships.
 * The Mozilla viewer (public/pdfjs) shows the file; this path is for placing
 * those pages on the print sheet so an image can be added beside them.
 */
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cloneCanvas, makeId, type DocPage, type DocPaperDef } from './documentPrintLayout';

GlobalWorkerOptions.workerSrc = pdfWorker;

const MAX_PAGES = 20;

export async function pdfBytesToPages(data: ArrayBuffer, paper: DocPaperDef): Promise<DocPage[]> {
  const pdf = await getDocument({ data: data.slice(0) }).promise;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const pages: DocPage[] = [];
  for (let i = 1; i <= count; i++) {
    const pg = await pdf.getPage(i);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(paper.w / base.width, paper.h / base.height);
    const viewport = pg.getViewport({ scale });
    const rendered = document.createElement('canvas');
    rendered.width = Math.max(1, Math.floor(viewport.width));
    rendered.height = Math.max(1, Math.floor(viewport.height));
    const ctx = rendered.getContext('2d');
    if (!ctx) continue;
    const task = pg.render({ canvasContext: ctx, viewport, canvas: rendered });
    await task.promise;
    const w = rendered.width;
    const h = rendered.height;
    pages.push({
      id: makeId('p'),
      cells: [
        {
          id: makeId('c'),
          x: Math.max(0, Math.round((paper.w - w) / 2)),
          y: Math.max(0, Math.round((paper.h - h) / 2)),
          w,
          h,
          canvas: rendered,
          baseCanvas: cloneCanvas(rendered),
          fitMode: 'contain',
          brightness: 0,
          contrast: 0,
        },
      ],
      marks: [],
    });
  }
  if (!pages.length) throw new Error('PDF has no pages');
  return pages;
}
