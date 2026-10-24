/**
 * Print editor — one surface, the PDF itself (iLovePDF-style).
 * Photos are placed on the chosen paper, then text, drawing, highlight,
 * whiteout, and images are edited on that PDF. Print keeps the paper size.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SpinnerGap } from '@phosphor-icons/react';
import PrintToolbar from './PrintToolbar';
import api from '../../shared/api';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';
import { downloadBlob, loadImageFromFile } from './imageOps';
import MozillaPdfEmbed, { type MozillaPdfHandle, type PdfEditorMode } from '../files/MozillaPdfEmbed';
import type { StampRect } from '@cybercontrol/media-viewer';
import { loadExtras, loadMarks, saveExtras, saveMarks, type SavedExtra } from './docPrintExtrasStore';
import DrivePicker from '../photo-tool/DrivePicker';
import DotCropModal from './DotCropModal';
import CleanupModal from './CleanupModal';
import {
  DOC_PAPERS,
  blankPage,
  blankSheetsPdfBlob,
  cellInMargin,
  cloneCanvas,
  type DocCell,
  type DocMark,
  type DocPage,
  type DocPaperId,
  fitImageOnPage,
  imageToCanvas,
  makeId,
  pagesToPdfBlob,
  ptsToMm,
  readPdfMediaBoxPts,
} from './documentPrintLayout';
import { pdfBytesToPages } from './pdfPaper';
import { applyDocFilter, type DocScanFilter } from './docScanFilters';
import { detectDocumentQuad, warpQuad } from './docEdgeDetect';

const MARGIN_MM = 10;

async function loadDriveBlob(fileId: string): Promise<Blob> {
  return getCachedBlob(fileId, async () => {
    const res = await api.get(`/drive/download/${fileId}`, { responseType: 'blob' });
    return new Blob([res.data], {
      type: String(res.headers['content-type'] ?? 'application/octet-stream'),
    });
  });
}

function isPdfBlob(blob: Blob, head: Uint8Array): boolean {
  const sig = String.fromCharCode(head[0] || 0, head[1] || 0, head[2] || 0, head[3] || 0, head[4] || 0);
  return blob.type.includes('pdf') || sig === '%PDF-';
}

function canvasFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not read the photo'));
        return;
      }
      resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

/** Visible photo rectangle inside the cell. Cover fills the cell; contain letterboxes. */
function photoRect(cell: DocCell): { x: number; y: number; w: number; h: number } {
  if ((cell.fitMode || 'contain') === 'cover') {
    return { x: cell.x, y: cell.y, w: cell.w, h: cell.h };
  }
  const sa = cell.canvas.width / Math.max(1, cell.canvas.height);
  const da = cell.w / Math.max(1, cell.h);
  if (sa > da) {
    const h = cell.w / sa;
    return { x: cell.x, y: cell.y + (cell.h - h) / 2, w: cell.w, h };
  }
  const w = cell.h * sa;
  return { x: cell.x + (cell.w - w) / 2, y: cell.y, w, h: cell.h };
}

function whiteCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 140;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** Lossless, for whiteout (JPEG would leave grey edges). */
function pngFile(canvas: HTMLCanvasElement): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not make whiteout'));
        return;
      }
      resolve(new File([blob], 'whiteout.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

export default function DocumentPrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileId = params.get('fileId') || '';
  const extraIds = (params.get('fileIds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const phone = params.get('phone') || '';
  const name = params.get('name') || '';
  const fromRaw = params.get('from') || '';
  const from =
    fromRaw.startsWith('/app/') && !fromRaw.startsWith('//') && !fromRaw.includes('://')
      ? fromRaw
      : '';
  const initialPaper = (params.get('paper') as DocPaperId) || 'a4';

  const [paperId, setPaperId] = useState<DocPaperId>(
    initialPaper in DOC_PAPERS ? initialPaper : 'a4',
  );
  const paper = DOC_PAPERS[paperId];
  const [pages, setPages] = useState<DocPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheetRev, setSheetRev] = useState(0);
  const [originalPdfUrl, setOriginalPdfUrl] = useState('');
  const [layoutPdfUrl, setLayoutPdfUrl] = useState('');
  const [driveOpen, setDriveOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSource, setCropSource] = useState<HTMLCanvasElement | null>(null);
  const [cleanup, setCleanup] = useState<{ pageIndex: number; cellId: string; source: HTMLCanvasElement } | null>(null);
  const [docFilter, setDocFilter] = useState<DocScanFilter>('auto');
  const [activeTool, setActiveTool] = useState<PdfEditorMode | 'whiteout'>('none');
  /** Paper of the PDF currently open in the viewer. Empty while a new sheet is building. */
  const [openSheet, setOpenSheet] = useState('');
  /** Bumps when a new sheet PDF is actually open, so a rebuild can be waited on. */
  const [sheetReady, setSheetReady] = useState(0);
  const originalUrlRef = useRef('');
  const layoutKeyRef = useRef('');
  const pdfRef = useRef<MozillaPdfHandle>(null);
  const pagesRef = useRef(pages);
  const paperRef = useRef(paper);
  const stampOnOpenRef = useRef(false);
  const placedForUrl = useRef('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cropIntent = useRef<
    { kind: 'stamp' } | { kind: 'parent'; pageIndex: number; cellId: string }
  >({ kind: 'stamp' });
  /** After a crop rebuild, reopen the page the operator was on. */
  const resumePage = useRef(0);
  const filterRef = useRef<DocScanFilter>('auto');
  filterRef.current = docFilter;
  pagesRef.current = pages;
  paperRef.current = paper;
  const touchSheet = () => setSheetRev((n) => n + 1);
  /** Viewer URL whose photos are all tagged stamps, so their positions can be read back. */
  const stampsLive = useRef('');
  /** Photos the operator added (cell id → unfiltered JPEG), saved for refresh. */
  const extraBlobs = useRef(new Map<string, Blob>());

  const persistExtras = (list: DocPage[]) => {
    const sheet = paperRef.current;
    const saved: SavedExtra[] = [];
    list.forEach((pg, page) =>
      pg.cells.forEach((c) => {
        const blob = extraBlobs.current.get(c.id);
        if (!blob) return;
        const r = photoRect(c);
        saved.push({ id: c.id, page, x: r.x / sheet.w, y: r.y / sheet.h, w: r.w / sheet.w, h: r.h / sheet.h, blob, plain: c.plain });
      }),
    );
    void saveExtras(fileId, saved);
  };

  /** Text, drawings and highlights, put back after every rebuild and refresh. */
  const marksRef = useRef<unknown[]>([]);
  /** Photos the operator deleted, so Redo/Undo can bring them back. */
  const trashRef = useRef(new Map<string, DocCell>());
  const [history, setHistory] = useState({ undo: false, redo: false });

  const readMarks = async () => {
    const url = viewerUrlRef.current;
    if (!pdfRef.current || !url || stampsLive.current !== url) return;
    try {
      marksRef.current = await pdfRef.current.readMarks();
      void saveMarks(fileId, marksRef.current);
    } catch {
      /* keep the last good copy */
    }
  };

  /** Read where the operator moved, resized or deleted each photo, into the page state. */
  const syncStamps = async (): Promise<DocPage[]> => {
    const list = pagesRef.current;
    const url = viewerUrlRef.current;
    if (!pdfRef.current || !url || stampsLive.current !== url) return list;
    await readMarks();
    let rects: StampRect[];
    try {
      rects = await pdfRef.current.stampRects();
    } catch {
      return list;
    }
    if (!rects.length && list.some((p) => p.cells.length > 0)) return list;
    const sheet = paperRef.current;
    const byTag = new Map(rects.map((r) => [r.tag, r]));
    const next: DocPage[] = list.map((pg) => ({ ...pg, cells: [] }));
    const fromRect = (c: DocCell, r: StampRect): DocCell => ({
      ...c,
      x: Math.round(r.x * sheet.w),
      y: Math.round(r.y * sheet.h),
      w: Math.max(1, Math.round(r.w * sheet.w)),
      h: Math.max(1, Math.round(r.h * sheet.h)),
      fitMode: 'contain',
    });
    const pageOf = (r: StampRect) => Math.min(next.length - 1, Math.max(0, r.page - 1));
    let changed = false;
    list.forEach((pg, i) =>
      pg.cells.forEach((c) => {
        const r = byTag.get(c.id);
        byTag.delete(c.id);
        if (!r) {
          trashRef.current.set(c.id, c);
          changed = true;
          return;
        }
        const pi = pageOf(r);
        const cell = fromRect(c, r);
        const pr = photoRect(c);
        const moved =
          pi !== i ||
          Math.abs(pr.x - cell.x) > 2 ||
          Math.abs(pr.y - cell.y) > 2 ||
          Math.abs(pr.w - cell.w) > 2 ||
          Math.abs(pr.h - cell.h) > 2;
        if (moved) changed = true;
        next[pi].cells.push(moved ? cell : c);
      }),
    );
    // Undo of a delete brings the same photo back.
    byTag.forEach((r, tag) => {
      const c = trashRef.current.get(tag);
      if (!c) return;
      trashRef.current.delete(tag);
      next[pageOf(r)].cells.push(fromRect(c, r));
      changed = true;
    });
    if (!changed) return list;
    pagesRef.current = next;
    setPages(next);
    persistExtras(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = DOC_PAPERS[paperId];
      if (!fileId) {
        setPages([blankPage(p)]);
        setSheetRev(0);
        layoutKeyRef.current = '';
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = [fileId, ...extraIds.filter((id) => id !== fileId)];
        const built: DocPage[] = [];
        let firstPdfUrl = '';
        let autoCropped = 0;
        for (let i = 0; i < ids.length; i++) {
          try {
            const blob = await loadDriveBlob(ids[i]);
            const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
            if (isPdfBlob(blob, head)) {
              const data = await blob.arrayBuffer();
              const copy = data.slice(0);
              const box = await readPdfMediaBoxPts(new Blob([copy], { type: 'application/pdf' }));
              const fits =
                !!box &&
                Math.abs(ptsToMm(box.w) - p.wMm) <= 2 &&
                Math.abs(ptsToMm(box.h) - p.hMm) <= 2;
              built.push(...(await pdfBytesToPages(data, p)));
              if (!firstPdfUrl && fits) {
                firstPdfUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }));
              }
            } else {
              const img = await loadImageFromFile(blob);
              const photo = imageToCanvas(img);
              // #346: find the page and straighten it, so the operator does not crop by hand.
              const quad = detectDocumentQuad(photo);
              const page = fitImageOnPage(
                quad ? warpQuad(photo, quad) : photo,
                p,
                MARGIN_MM,
                i === 0 ? name || undefined : undefined,
              );
              if (quad && page.cells[0]) page.cells[0].rawCanvas = photo;
              if (quad) autoCropped++;
              built.push(page);
            }
          } catch {
            /* skip missing */
          }
        }
        if (cancelled) {
          if (firstPdfUrl) URL.revokeObjectURL(firstPdfUrl);
          return;
        }
        if (!built.length) throw new Error('Could not load document');
        // Photos added before a refresh go back where they were.
        extraBlobs.current.clear();
        const savedExtras = await loadExtras(fileId);
        marksRef.current = await loadMarks(fileId);
        trashRef.current.clear();
        // Pages added with + Page come back if anything is on them.
        const lastPage = Math.max(
          ...savedExtras.map((ex) => ex.page),
          ...marksRef.current.map((m) => Number((m as { pageIndex?: number })?.pageIndex) || 0),
          0,
        );
        while (built.length <= Math.min(lastPage, 30)) built.push(blankPage(p));
        for (const ex of savedExtras) {
          try {
            const img = await createImageBitmap(ex.blob);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d')?.drawImage(img, 0, 0);
            img.close();
            const pg = built[Math.min(built.length - 1, Math.max(0, ex.page))];
            pg.cells.push({
              id: ex.id,
              x: Math.round(ex.x * p.w),
              y: Math.round(ex.y * p.h),
              w: Math.max(1, Math.round(ex.w * p.w)),
              h: Math.max(1, Math.round(ex.h * p.h)),
              canvas,
              baseCanvas: cloneCanvas(canvas),
              plain: ex.plain,
            });
            extraBlobs.current.set(ex.id, ex.blob);
          } catch {
            /* unreadable saved photo */
          }
        }
        if (cancelled) {
          if (firstPdfUrl) URL.revokeObjectURL(firstPdfUrl);
          return;
        }
        setPages(built.map((pg) => ({
          ...pg,
          cells: pg.cells.map((c) => {
            if (c.plain) return c;
            const base = c.baseCanvas || c.canvas;
            return {
              ...c,
              baseCanvas: c.baseCanvas || cloneCanvas(c.canvas),
              canvas: applyDocFilter(base, 'auto'),
            };
          }),
        })));
        setSheetRev(0);
        layoutKeyRef.current = '';
        if (autoCropped) toast.success('Page edges found and straightened · Crop to adjust');
        if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = firstPdfUrl;
        setOriginalPdfUrl(firstPdfUrl);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || 'Failed to load document');
          setPages([blankPage(p)]);
          setSheetRev(0);
          layoutKeyRef.current = '';
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, []);

  // Ctrl+Z / Ctrl+Y while focus is on the toolbar (the viewer handles its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        pdfRef.current?.undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        pdfRef.current?.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Paper change, filter, crop: keep the saved added photos in step.
  useEffect(() => {
    if (!loading && extraBlobs.current.size) persistExtras(pages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, paper, loading]);

  const changePaper = async (next: DocPaperId) => {
    if (next === paperId) return;
    await syncStamps();
    const prevPaper = DOC_PAPERS[paperId];
    setOpenSheet('');
    touchSheet();
    setPaperId(next);
    const p = DOC_PAPERS[next];
    const sx = p.w / Math.max(1, prevPaper.w);
    const sy = p.h / Math.max(1, prevPaper.h);
    const scaleMark = (m: DocMark): DocMark => {
      const scaled: DocMark = {
        ...m,
        x: Math.max(0, Math.round(m.x * sx)),
        y: Math.max(0, Math.round(m.y * sy)),
        w: Math.max(28, Math.round(m.w * sx)),
        h: Math.max(28, Math.round(m.h * sy)),
      };
      if (m.kind === 'text' && scaled.kind === 'text') {
        scaled.size = Math.max(12, Math.round(m.size * Math.min(sx, sy)));
      }
      return scaled;
    };
    layoutKeyRef.current = '';
    setPages((prev) =>
      prev.map((pg) => {
        const marks = (pg.marks || []).map(scaleMark);
        if (pg.cells.length === 1) {
          const c = pg.cells[0];
          return { ...pg, cells: [{ ...c, ...cellInMargin(c, p, MARGIN_MM) }], marks };
        }
        const minCell = Math.round((10 * 300) / 25.4);
        return {
          ...pg,
          marks,
          cells: pg.cells.map((c) => ({
            ...c,
            x: Math.round(c.x * sx),
            y: Math.round(c.y * sy),
            w: Math.max(minCell, Math.round(c.w * sx)),
            h: Math.max(minCell, Math.round(c.h * sy)),
          })),
        };
      }),
    );
  };

  // The viewer shows the sharp original only when it is already this paper.
  // Any sheet change rebuilds the print PDF. Same sheet keeps the open PDF.
  useEffect(() => {
    if (!pages.length) return;
    if (originalPdfUrl && sheetRev === 0 && filterRef.current === 'original') {
      stampOnOpenRef.current = false;
      return;
    }
    const key = `${paper.wMm}x${paper.hMm}@${sheetRev}`;
    if (layoutKeyRef.current === key) return;
    // The sheet is blank. The photo is a stamp so Select can move and resize it.
    stampOnOpenRef.current = pages.some((p) => p.cells.length > 0);
    let cancelled = false;
    (async () => {
      try {
        const blob = await blankSheetsPdfBlob(pages.length, paper);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        layoutKeyRef.current = key;
        setOpenSheet(`${paper.wMm}x${paper.hMm}`);
        setSheetReady((n) => n + 1);
        setLayoutPdfUrl((prev) => {
          if (prev && prev !== url) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Could not open the PDF');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetRev, pages, paper, originalPdfUrl]);

  const viewerUrl = originalPdfUrl && sheetRev === 0 && docFilter === 'original' ? originalPdfUrl : layoutPdfUrl;
  const viewerUrlRef = useRef(viewerUrl);
  viewerUrlRef.current = viewerUrl;

  const placeParentImages = async () => {
    const url = viewerUrlRef.current;
    if (!url || placedForUrl.current === url) return;
    if (!stampOnOpenRef.current) {
      // Blank sheet: anything stamped from now on is tagged.
      if (url !== originalUrlRef.current) {
        placedForUrl.current = url;
        await pdfRef.current?.restoreMarks(marksRef.current).catch(() => {});
        pdfRef.current?.setEditorMode('none');
        if (viewerUrlRef.current === url) stampsLive.current = url;
      }
      return;
    }
    placedForUrl.current = url;
    const list = pagesRef.current;
    const sheet = paperRef.current;
    try {
      for (let i = 0; i < list.length; i++) {
        for (const cell of list[i].cells) {
          const rect = photoRect(cell);
          const file = cell.plain ? await pngFile(cell.canvas) : await canvasFile(cell.canvas);
          await pdfRef.current?.stampFile(file, {
            page: i + 1,
            x: rect.x / sheet.w,
            y: rect.y / sheet.h,
            w: rect.w / sheet.w,
            h: rect.h / sheet.h,
            tag: cell.id,
            quiet: true,
          });
        }
      }
      // Text, drawings and highlights go back on top of the photos.
      await pdfRef.current?.restoreMarks(marksRef.current).catch(() => {});
      pdfRef.current?.setEditorMode('none');
      if (viewerUrlRef.current === url) stampsLive.current = url;
      const resume = resumePage.current;
      resumePage.current = 0;
      if (resume > 1) pdfRef.current?.goToPage(resume);
    } catch (e: any) {
      placedForUrl.current = '';
      toast.error(e?.message || 'Could not place the photo');
    }
  };

  useEffect(() => {
    if (originalPdfUrl && sheetRev === 0) setOpenSheet(`${paper.wMm}x${paper.hMm}`);
  }, [originalPdfUrl, sheetRev, paper.wMm, paper.hMm]);

  // A new PDF starts with no tool armed. The highlight must match the page.
  useEffect(() => {
    setActiveTool('none');
  }, [viewerUrl]);

  const assertPaper = async (pdfBlob: Blob) => {
    const box = await readPdfMediaBoxPts(pdfBlob);
    if (box) {
      const wMm = ptsToMm(box.w);
      const hMm = ptsToMm(box.h);
      if (Math.abs(wMm - paper.wMm) > 2 || Math.abs(hMm - paper.hMm) > 2) {
        throw new Error(
          `PDF is ${wMm.toFixed(0)}×${hMm.toFixed(0)} mm but you chose ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`,
        );
      }
    }
    return pdfBlob;
  };

  const buildPdf = async () => assertPaper(await pagesToPdfBlob(pages, paper));

  const outputPdf = async () => {
    if (pdfRef.current && viewerUrl) {
      try {
        return await assertPaper(await pdfRef.current.exportPdf());
      } catch {
        // Viewer is still opening, or it is a previous paper size. Use the sheet.
      }
    }
    return buildPdf();
  };

  const handlePrint = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await outputPdf();
      printBlob(pdfBlob, {
        widthMm: paper.wMm,
        heightMm: paper.hMm,
        fileName: `print_${paperId}.pdf`,
      });
      toast.success(`Print ${paper.label} PDF… check paper size in the dialog`);
    } catch (e: any) {
      toast.error(e?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await outputPdf();
      downloadBlob(pdfBlob, `document_${paperId}_${pages.length}p.pdf`);
      toast.success(`Saved ${paper.label} PDF`);
    } catch (e: any) {
      toast.error(e?.message || 'PDF failed');
    } finally {
      setBusy(false);
    }
  };

  const setViewerTool = (mode: PdfEditorMode) => {
    setActiveTool(mode);
    pdfRef.current?.setEditorMode(mode);
  };

  /** Put a new item on the open page as a tagged stamp and keep it in page state. */
  const addExtraCell = async (base: HTMLCanvasElement, canvas: HTMLCanvasElement, size: number, plain: boolean) => {
    const list = pagesRef.current;
    const pageNumber = (await pdfRef.current?.currentPage().catch(() => 1)) || 1;
    const index = Math.min(Math.max(0, pageNumber - 1), Math.max(0, list.length - 1));
    const sheet = paperRef.current;
    const aspect = canvas.width / Math.max(1, canvas.height);
    let w = sheet.w * size;
    let h = w / aspect;
    if (h > sheet.h * size) {
      h = sheet.h * size;
      w = h * aspect;
    }
    const cell: DocCell = {
      id: makeId('x'),
      x: Math.round((sheet.w - w) / 2),
      y: Math.round((sheet.h - h) / 2),
      w: Math.round(w),
      h: Math.round(h),
      canvas,
      baseCanvas: base,
      plain: plain || undefined,
    };
    setActiveTool('none');
    await pdfRef.current?.stampFile(plain ? await pngFile(canvas) : await canvasFile(canvas), {
      page: index + 1,
      x: cell.x / sheet.w,
      y: cell.y / sheet.h,
      w: cell.w / sheet.w,
      h: cell.h / sheet.h,
      tag: cell.id,
    });
    extraBlobs.current.set(cell.id, plain ? await pngFile(base) : await canvasFile(base));
    const next = pagesRef.current.map((pg, i) => (i === index ? { ...pg, cells: [...pg.cells, cell] } : pg));
    pagesRef.current = next;
    setPages(next);
    persistExtras(next);
  };

  const placeWhiteout = async () => {
    try {
      const white = whiteCanvas();
      await addExtraCell(white, white, 0.3, true);
      toast.success('Whiteout added · drag it over what to hide');
    } catch {
      toast.error('Could not add whiteout');
    }
  };

  const beginCrop = async (file: File) => {
    const looksImage = !file.type || file.type.startsWith('image/');
    if (!looksImage) {
      toast.error('Choose a photo (JPG or PNG)');
      return;
    }
    try {
      const img = await loadImageFromFile(file);
      cropIntent.current = { kind: 'stamp' };
      setCropSource(imageToCanvas(img));
      setCropOpen(true);
    } catch (e: any) {
      toast.error(e?.message || 'Could not open that photo');
    }
  };

  /** Photo on the page the operator is looking at, or null (with a toast). */
  const openPagePhoto = async () => {
    const list = pagesRef.current;
    let pageNumber = 1;
    try {
      pageNumber = (await pdfRef.current?.currentPage()) || 1;
    } catch {
      if (list.filter((p) => p.cells.length > 0).length > 1) {
        toast.error('Could not read the open page');
        return null;
      }
    }
    const index = Math.min(Math.max(0, pageNumber - 1), Math.max(0, list.length - 1));
    const cell = list[index]?.cells[0];
    if (!cell) {
      toast.error('This page has no photo to clean up');
      return null;
    }
    return { index, cell };
  };

  const openCleanup = async () => {
    const hit = await openPagePhoto();
    if (!hit) return;
    setCleanup({ pageIndex: hit.index, cellId: hit.cell.id, source: hit.cell.baseCanvas || hit.cell.canvas });
  };

  const applyCleanup = async (cleaned: HTMLCanvasElement) => {
    const target = cleanup;
    setCleanup(null);
    if (!target) return;
    await syncStamps();
    setPages((prev) =>
      prev.map((pg, i) =>
        i !== target.pageIndex
          ? pg
          : {
              ...pg,
              cells: pg.cells.map((c) =>
                c.id !== target.cellId ? c : { ...c, baseCanvas: cleaned, canvas: applyDocFilter(cleaned, filterRef.current) },
              ),
            },
      ),
    );
    layoutKeyRef.current = '';
    resumePage.current = target.pageIndex + 1;
    touchSheet();
    toast.success('Photo cleaned');
  };
  const openParentCrop = async () => {
    const list = pagesRef.current;
    // Crop whatever the operator has selected. Fall back to the open page's first photo.
    let rects: Awaited<ReturnType<NonNullable<typeof pdfRef.current>['stampRects']>> = [];
    try {
      rects = (await pdfRef.current?.stampRects()) || [];
    } catch {
      rects = [];
    }
    const selectedTag = rects.find((r) => r.selected)?.tag;
    if (selectedTag) {
      for (let i = 0; i < list.length; i++) {
        const cell = list[i].cells.find((c) => c.id === selectedTag);
        if (cell) {
          if (cell.plain) {
            toast.error('Whiteout cannot be cropped — select a photo');
            return;
          }
          cropIntent.current = { kind: 'parent', pageIndex: i, cellId: cell.id };
          setCropSource(cell.rawCanvas || cell.baseCanvas || cell.canvas);
          setCropOpen(true);
          return;
        }
      }
    }
    // Nothing selected: use the photo on the page the operator is looking at.
    let pageNumber = 1;
    try {
      pageNumber = (await pdfRef.current?.currentPage()) || 1;
    } catch {
      const withPhoto = list.filter((p) => p.cells.length > 0).length;
      if (withPhoto > 1) {
        toast.error('Tap a photo first, then Crop');
        return;
      }
    }
    const index = Math.min(Math.max(0, pageNumber - 1), Math.max(0, list.length - 1));
    const cell = list[index]?.cells.find((c) => !c.plain) || list[index]?.cells[0];
    if (!cell) {
      toast.error('This page has no photo to crop');
      return;
    }
    cropIntent.current = { kind: 'parent', pageIndex: index, cellId: cell.id };
    setCropSource(cell.rawCanvas || cell.baseCanvas || cell.canvas);
    setCropOpen(true);
  };

  const applyCrop = async (framed: HTMLCanvasElement) => {
    setCropOpen(false);
    const intent = cropIntent.current;
    if (intent.kind === 'parent') {
      await syncStamps();
      const sheet = paperRef.current;
      setPages((prev) =>
        prev.map((pg, i) => {
          if (i !== intent.pageIndex) return pg;
          return {
            ...pg,
            cells: pg.cells.map((c) => {
              if (c.id !== intent.cellId) return c;
              const base = cloneCanvas(framed);
              const filled = { ...c, baseCanvas: base, canvas: applyDocFilter(base, filterRef.current) };
              // A new crop has a new shape: refill the page margin instead of the old photo box.
              return c.id === pg.cells[0]?.id ? { ...filled, ...cellInMargin(filled, sheet, MARGIN_MM) } : filled;
            }),
          };
        }),
      );
      layoutKeyRef.current = '';
      resumePage.current = intent.pageIndex + 1;
      touchSheet();
      toast.success('Photo cropped');
      return;
    }
    try {
      // The added photo becomes a page photo, so filters, rebuilds and refresh keep it.
      const base = cloneCanvas(framed);
      await addExtraCell(base, applyDocFilter(base, filterRef.current), 0.6, false);
      toast.success('Image placed on the page');
    } catch (e: any) {
      toast.error(e?.message || 'Could not place the photo');
    }
  };

  const chooseFilter = async (id: DocScanFilter) => {
    if (id === docFilter) return;
    if (!pagesRef.current.some((p) => p.cells.length > 0)) {
      toast.error('Add a photo, then choose a filter');
      return;
    }
    await syncStamps();
    setDocFilter(id);
    setPages((prev) =>
      prev.map((pg) => ({
        ...pg,
        cells: pg.cells.map((c) => {
          if (c.plain) return c;
          const base = c.baseCanvas || c.canvas;
          return {
            ...c,
            baseCanvas: c.baseCanvas || cloneCanvas(base),
            canvas: applyDocFilter(base, id),
          };
        }),
      })),
    );
    layoutKeyRef.current = '';
    touchSheet();
  };

  const addBlankPage = async () => {
    setBusy(true);
    try {
      // Photos and edits are kept as data and put back on the rebuilt sheet.
      const base = await syncStamps();
      layoutKeyRef.current = '';
      setPages([...base, blankPage(paper)]);
      touchSheet();
      toast.success('Blank page added');
    } catch (e: any) {
      toast.error(e?.message || 'Could not add a page');
    } finally {
      setBusy(false);
    }
  };

  const backTo = from || '/app/whatsapp';
  const subtitle = useMemo(() => {
    const who = name || phone;
    return who ? `For ${who}` : 'WhatsApp / Drive document → paper';
  }, [name, phone]);
  const paperSizeLabel = `${paper.label} · ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`;


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm text-[var(--muted-foreground)]">
        <SpinnerGap size={22} className="animate-spin" /> Loading document…
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">No document loaded for print.</p>
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate(backTo)}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0" data-doc-print="1">
      <PrintToolbar
        title={subtitle}
        paperId={paperId}
        paperSizeLabel={paperSizeLabel}
        busy={busy}
        canExport={pages.length > 0}
        activeTool={activeTool}
        cropOpen={cropOpen}
        cleanupOpen={!!cleanup}
        onCleanup={() => void openCleanup()}
        filter={docFilter}
        onBack={() => navigate(backTo)}
        onDownload={() => void handleDownloadPdf()}
        onPrint={() => void handlePrint()}
        onTool={setViewerTool}
        onWhiteout={() => void placeWhiteout()}
        onImage={() => imageInputRef.current?.click()}
        canUndo={history.undo}
        canRedo={history.redo}
        onUndo={() => pdfRef.current?.undo()}
        onRedo={() => pdfRef.current?.redo()}
        onFiles={() => setDriveOpen(true)}
        onCrop={() => void openParentCrop()}
        onFilter={chooseFilter}
        onAddPage={() => void addBlankPage()}
        onPaper={changePaper}
      />

      <div className="flex-1 min-h-0" data-doc-print-pdf="1" data-doc-print-sheet={openSheet} data-doc-print-ready={sheetReady}>
        {viewerUrl ? (
          <MozillaPdfEmbed
            key={viewerUrl}
            ref={pdfRef}
            fileUrl={viewerUrl}
            mode="editor"
            onPickDriveImage={() => setDriveOpen(true)}
            onReady={() => { void placeParentImages(); }}
        onStampsChanged={() => { void syncStamps(); }}
        onHistory={setHistory}
          />
        ) : (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
            <SpinnerGap size={22} className="animate-spin" /> Opening PDF…
          </div>
        )}
      </div>

      <DrivePicker
        open={driveOpen}
        imagesOnly
        folderHint={{ customerId: phone, customerName: name, fileId }}
        onClose={() => setDriveOpen(false)}
        onPick={(file) => {
          setDriveOpen(false);
          void beginCrop(file);
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-doc-print-image-input="1"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void beginCrop(file);
        }}
      />
      <DotCropModal
        open={cropOpen}
        source={cropSource}
        onApply={(framed) => { void applyCrop(framed); }}
        onClose={() => setCropOpen(false)}
      />
      <CleanupModal
        open={!!cleanup}
        source={cleanup?.source ?? null}
        onApply={applyCleanup}
        onClose={() => setCleanup(null)}
      />
    </div>
  );
}
