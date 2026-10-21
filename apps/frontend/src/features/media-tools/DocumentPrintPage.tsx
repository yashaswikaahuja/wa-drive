/**
 * Document print layout — opened from media-viewer Print on JPEG/WhatsApp docs.
 * Pick paper → crop/rotate/tone/place → silent PDF → device print dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Printer,
  Trash,
  CaretLeft,
  SpinnerGap,
  ArrowsOut,
  DownloadSimple,
  Crop,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsLeftRight,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  Cursor,
  TextT,
  Square,
  Image as ImageIcon,
  FolderOpen,
  PencilSimple,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';
import {
  applyTone,
  downloadBlob,
  flipCanvas,
  loadImageFromFile,
  rotateCanvas,
} from './imageOps';
import AspectCropModal from './AspectCropModal';
import MozillaPdfEmbed, { type MozillaPdfHandle, type PdfEditorMode } from '../files/MozillaPdfEmbed';
import DrivePicker from '../photo-tool/DrivePicker';
import {
  DOC_PAPERS,
  blankPage,
  cellInMargin,
  cloneCanvas,
  type DocCell,
  type DocFitMode,
  type DocMark,
  type DocPage,
  type DocPaperId,
  fitImageOnPage,
  imageToCanvas,
  makeId,
  pagesToPdfBlob,
  ptsToMm,
  readPdfMediaBoxPts,
  renderPageCanvas,
} from './documentPrintLayout';
import { pdfBytesToPages } from './pdfPaper';

const MARGIN_PRESETS = [
  { mm: 0, label: '0' },
  { mm: 5, label: '5' },
  { mm: 10, label: '10' },
  { mm: 15, label: '15' },
] as const;

function PageThumb({
  page,
  paper,
}: {
  page: DocPage;
  paper: (typeof DOC_PAPERS)[DocPaperId];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sheet = renderPageCanvas(page, paper, null);
    const el = ref.current;
    if (!el) return;
    const w = 120;
    const h = Math.max(64, Math.round(w * (paper.h / paper.w)));
    el.width = w * 2;
    el.height = h * 2;
    el.getContext('2d')!.drawImage(sheet, 0, 0, el.width, el.height);
  }, [page, paper]);
  return <canvas ref={ref} className="block w-full h-auto bg-white" />;
}

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

  const addFileRef = useRef<HTMLInputElement>(null);
  const addModeRef = useRef<'new-page' | 'this-page'>('new-page');
  const textInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [paperId, setPaperId] = useState<DocPaperId>(
    initialPaper in DOC_PAPERS ? initialPaper : 'a4',
  );
  const paper = DOC_PAPERS[paperId];
  const [pages, setPages] = useState<DocPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1);
  const [stageZoom, setStageZoom] = useState(1);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  const [marginMm, setMarginMm] = useState(10);
  const [cropOpen, setCropOpen] = useState(false);
  const [tool, setTool] = useState<'select' | 'text' | 'box'>('select');
  const [surface, setSurface] = useState<'edit' | 'pdf'>('edit');
  const [sheetRev, setSheetRev] = useState(0);
  const [originalPdfUrl, setOriginalPdfUrl] = useState('');
  const [layoutPdfUrl, setLayoutPdfUrl] = useState('');
  const [driveOpen, setDriveOpen] = useState(false);
  const originalUrlRef = useRef('');
  const layoutKeyRef = useRef('');
  const pdfRef = useRef<MozillaPdfHandle>(null);
  const driveTargetRef = useRef<'canvas' | 'viewer'>('canvas');
  const touchSheet = () => {
    setSheetRev((n) => n + 1);
  };

  const dragRef = useRef<{
    cellId: string;
    startCellX: number;
    startCellY: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);
  const resizeRef = useRef<{
    cellId: string;
    startW: number;
    startH: number;
    startPointerX: number;
    startPointerY: number;
  } | null>(null);

  const page = pages[pageIndex] || null;
  const selectedCell = page?.cells.find((c) => c.id === selected) || null;
  const selectedMark = (page?.marks || []).find((m) => m.id === selected) || null;
  const textMarkId = selectedMark?.kind === 'text' ? selectedMark.id : null;
  useEffect(() => {
    if (!textMarkId) return;
    const el = textInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [textMarkId]);
  const selectedId = selected ?? page?.cells[0]?.id ?? null;

  useEffect(() => {
    if (!page) {
      setSelected(null);
      return;
    }
    const known =
      page.cells.some((c) => c.id === selected) || (page.marks || []).some((m) => m.id === selected);
    if (!known) setSelected(page.cells[0]?.id ?? null);
  }, [page, selected]);

  // ── Load primary + extras, or start on a blank sheet ───────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = DOC_PAPERS[paperId];
      if (!fileId) {
        setPages([blankPage(p)]);
        setPageIndex(0);
        setSelected(null);
        setSurface('edit');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = [fileId, ...extraIds.filter((id) => id !== fileId)];
        const built: DocPage[] = [];
        let firstPdfUrl = '';
        let sawPdf = false;
        for (let i = 0; i < ids.length; i++) {
          try {
            const blob = await loadDriveBlob(ids[i]);
            const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
            if (isPdfBlob(blob, head)) {
              sawPdf = true;
              const data = await blob.arrayBuffer();
              // Keep a copy: pdf.js detaches the buffer it is given.
              const copy = data.slice(0);
              const box = await readPdfMediaBoxPts(new Blob([copy], { type: 'application/pdf' }));
              const fits =
                !!box &&
                Math.abs(ptsToMm(box.w) - p.wMm) <= 2 &&
                Math.abs(ptsToMm(box.h) - p.hMm) <= 2;
              built.push(...(await pdfBytesToPages(data, p)));
              // Sharp original only when it is already the chosen paper. Otherwise the
              // viewer shows the composed sheet so text and stamps print at that size.
              if (!firstPdfUrl && fits) {
                firstPdfUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }));
              }
            } else {
              const img = await loadImageFromFile(blob);
              built.push(fitImageOnPage(imageToCanvas(img), p, marginMm, i === 0 ? name || undefined : undefined));
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
        setPages(built);
        setPageIndex(0);
        setSelected(built[0]?.cells[0]?.id ?? null);
        setSheetRev(0);
        layoutKeyRef.current = '';
        if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = firstPdfUrl;
        setOriginalPdfUrl(firstPdfUrl);
        setSurface(sawPdf ? 'pdf' : 'edit');
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || 'Failed to load document');
          setPages([blankPage(p)]);
          setPageIndex(0);
          setSelected(null);
          setSurface('edit');
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

  const changePaper = (next: DocPaperId) => {
    const prevPaper = DOC_PAPERS[paperId];
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
    setPages((prev) =>
      prev.map((pg) => {
        const marks = (pg.marks || []).map(scaleMark);
        if (pg.cells.length === 1) {
          const c = pg.cells[0];
          return { ...pg, cells: [{ ...c, ...cellInMargin(c, p, marginMm) }], marks };
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

  const applyMargin = (nextMm: number) => {
    touchSheet();
    setMarginMm(nextMm);
    setPages((prev) =>
      prev.map((pg) => {
        if (pg.cells.length !== 1) return pg;
        const c = pg.cells[0];
        return { ...pg, cells: [{ ...c, ...cellInMargin(c, paper, nextMm) }] };
      }),
    );
  };

  // ── Draw current page ───────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !page) return;
    const sheet = renderPageCanvas(page, paper, selectedId, true);
    el.width = sheet.width;
    el.height = sheet.height;
    el.getContext('2d')!.drawImage(sheet, 0, 0);
  }, [page, paper, selectedId]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStageBox({ w: rect.width, h: rect.height });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper.w, pageIndex, pages.length, loading, surface]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setScale(paper.w / rect.width);
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper.w, pageIndex, pages.length, stageZoom, stageBox.w, stageBox.h]);

  const toPaper = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
    },
    [scale],
  );

  const hitTest = useCallback(
    (px: number, py: number): { id: string; x: number; y: number; w: number; h: number } | null => {
      if (!page) return null;
      const marks = page.marks || [];
      for (let i = marks.length - 1; i >= 0; i--) {
        const m = marks[i];
        if (px >= m.x && px <= m.x + m.w && py >= m.y && py <= m.y + m.h) return m;
      }
      for (let i = page.cells.length - 1; i >= 0; i--) {
        const c = page.cells[i];
        if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
      }
      return null;
    },
    [page],
  );

  const isHandle = (box: { x: number; y: number; w: number; h: number }, px: number, py: number) => {
    const hs = 36;
    return px >= box.x + box.w - hs && py >= box.y + box.h - hs;
  };

  const updateCell = (cellId: string, patch: Partial<DocCell>) => {
    touchSheet();
    setPages((prev) =>
      prev.map((pg, i) =>
        i !== pageIndex
          ? pg
          : {
              ...pg,
              cells: pg.cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c)),
            },
      ),
    );
  };

  const updateMark = (markId: string, patch: Partial<DocMark>) => {
    touchSheet();
    setPages((prev) =>
      prev.map((pg, i) =>
        i !== pageIndex
          ? pg
          : {
              ...pg,
              marks: (pg.marks || []).map((m) => (m.id === markId ? ({ ...m, ...patch } as DocMark) : m)),
            },
      ),
    );
  };

  const addMark = (mark: DocMark) => {
    touchSheet();
    setPages((prev) =>
      prev.map((pg, i) => (i === pageIndex ? { ...pg, marks: [...(pg.marks || []), mark] } : pg)),
    );
    setSelected(mark.id);
    setTool('select');
  };

  const replaceBitmap = (cellId: string, next: HTMLCanvasElement) => {
    updateCell(cellId, {
      canvas: next,
      baseCanvas: cloneCanvas(next),
      brightness: 0,
      contrast: 0,
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!page) return;
    const { x, y } = toPaper(e);
    if (tool === 'text') {
      const size = Math.round(paper.w * 0.028);
      const tw = Math.round(size * 7);
      const th = Math.round(size * 1.7);
      addMark({
        id: makeId('t'),
        kind: 'text',
        x: Math.max(0, Math.min(paper.w - tw, Math.round(x))),
        y: Math.max(0, Math.min(paper.h - th, Math.round(y))),
        w: tw,
        h: th,
        text: 'Text',
        size,
        color: '#111111',
      });
      return;
    }
    if (tool === 'box') {
      addMark({
        id: makeId('b'),
        kind: 'box',
        x: Math.max(0, Math.round(x - 40)),
        y: Math.max(0, Math.round(y - 24)),
        w: Math.round(paper.w * 0.22),
        h: Math.round(paper.h * 0.08),
        fill: '#ffffff',
      });
      return;
    }
    const cell = hitTest(x, y);
    if (!cell) return;
    setSelected(cell.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    if (isHandle(cell, x, y)) {
      resizeRef.current = {
        cellId: cell.id,
        startW: cell.w,
        startH: cell.h,
        startPointerX: x,
        startPointerY: y,
      };
    } else {
      dragRef.current = {
        cellId: cell.id,
        startCellX: cell.x,
        startCellY: cell.y,
        startPointerX: x,
        startPointerY: y,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toPaper(e);
    const findBox = (id: string) =>
      (page?.marks || []).find((m) => m.id === id) || page?.cells.find((c) => c.id === id) || null;
    const patchPos = (id: string, px: number, py: number) => {
      const box = findBox(id);
      const maxX = Math.max(0, paper.w - (box?.w ?? 0));
      const maxY = Math.max(0, paper.h - (box?.h ?? 0));
      const patch = {
        x: Math.min(maxX, Math.max(0, Math.round(px))),
        y: Math.min(maxY, Math.max(0, Math.round(py))),
      };
      if ((page?.marks || []).some((m) => m.id === id)) updateMark(id, patch);
      else updateCell(id, patch);
    };
    const patchSize = (id: string, w: number, h: number) => {
      const box = findBox(id);
      const isMark = (page?.marks || []).some((m) => m.id === id);
      const min = isMark ? 28 : mmMin();
      const maxW = Math.max(min, paper.w - (box?.x ?? 0));
      const maxH = Math.max(min, paper.h - (box?.y ?? 0));
      const patch = {
        w: Math.min(maxW, Math.max(min, Math.round(w))),
        h: Math.min(maxH, Math.max(min, Math.round(h))),
      };
      if (isMark) updateMark(id, patch);
      else updateCell(id, patch);
    };
    if (dragRef.current) {
      const { cellId, startCellX, startCellY, startPointerX, startPointerY } = dragRef.current;
      patchPos(cellId, startCellX + (x - startPointerX), startCellY + (y - startPointerY));
    } else if (resizeRef.current) {
      const { cellId, startW, startH, startPointerX, startPointerY } = resizeRef.current;
      patchSize(cellId, startW + (x - startPointerX), startH + (y - startPointerY));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    resizeRef.current = null;
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  function mmMin() {
    return Math.round((10 * 300) / 25.4);
  }

  // ── Edit actions ────────────────────────────────────────────────
  const rotateSelected = (deg: 90 | -90) => {
    if (!selectedCell) return;
    replaceBitmap(selectedCell.id, rotateCanvas(selectedCell.canvas, deg));
  };

  const flipSelected = () => {
    if (!selectedCell) return;
    replaceBitmap(selectedCell.id, flipCanvas(selectedCell.canvas, true));
  };

  const setFitMode = (mode: DocFitMode) => {
    if (!selectedCell) return;
    updateCell(selectedCell.id, { fitMode: mode });
  };

  const applyToneToSelected = (brightness: number, contrast: number) => {
    if (!selectedCell) return;
    const base = selectedCell.baseCanvas || selectedCell.canvas;
    const baseCanvas = selectedCell.baseCanvas || cloneCanvas(selectedCell.canvas);
    const next =
      brightness === 0 && contrast === 0
        ? cloneCanvas(baseCanvas)
        : applyTone(base, { brightness, contrast, smooth: 0 });
    updateCell(selectedCell.id, {
      baseCanvas,
      canvas: next,
      brightness,
      contrast,
    });
  };

  const fitSelected = () => {
    if (!selectedCell) return;
    updateCell(selectedCell.id, {
      ...cellInMargin(selectedCell, paper, marginMm),
      fitMode: selectedCell.fitMode || 'contain',
    });
  };

  const fillPageSelected = () => {
    if (!selectedCell) return;
    updateCell(selectedCell.id, {
      x: 0,
      y: 0,
      w: paper.w,
      h: paper.h,
      fitMode: 'cover',
    });
  };

  const onCropApply = (framed: HTMLCanvasElement) => {
    if (!selectedCell) return;
    replaceBitmap(selectedCell.id, framed);
    setCropOpen(false);
    toast.success('Crop applied');
  };

  // ── Add / remove ────────────────────────────────────────────────
  const addBlankPage = () => {
    const pg = blankPage(paper);
    touchSheet();
    setPages((prev) => [...prev, pg]);
    setPageIndex(pages.length);
    setSelected(null);
    setSurface('edit');
  };

  const placeImage = (c: HTMLCanvasElement, label: string | undefined, onBlank: boolean): DocCell => {
    const box = cellInMargin({ id: '', x: 0, y: 0, w: 0, h: 0, canvas: c }, paper, marginMm);
    if (onBlank) {
      return {
        id: makeId('c'),
        ...box,
        canvas: c,
        baseCanvas: cloneCanvas(c),
        fitMode: 'contain',
        brightness: 0,
        contrast: 0,
        label,
      };
    }
    const nw = Math.max(mmMin(), Math.round(box.w * 0.46));
    const nh = Math.max(mmMin(), Math.round(box.h * 0.46));
    return {
      id: makeId('c'),
      x: Math.min(paper.w - nw, box.x + Math.round(box.w * 0.5)),
      y: Math.min(paper.h - nh, box.y + Math.round((box.h - nh) / 2)),
      w: nw,
      h: nh,
      canvas: c,
      baseCanvas: cloneCanvas(c),
      fitMode: 'contain',
      brightness: 0,
      contrast: 0,
      label,
    };
  };

  const addCanvas = (c: HTMLCanvasElement, label?: string) => {
    const mode = addModeRef.current;
    touchSheet();
    setSurface('edit');
    if (mode === 'this-page' && pages[pageIndex]) {
      const onBlank = pages[pageIndex].cells.length === 0;
      const cell = placeImage(c, label, onBlank);
      setPages((prev) =>
        prev.map((pg, i) => (i === pageIndex ? { ...pg, cells: [...pg.cells, cell] } : pg)),
      );
      setSelected(cell.id);
    } else {
      const pg = fitImageOnPage(c, paper, marginMm, label);
      const newIndex = pages.length;
      setPages((prev) => [...prev, pg]);
      setPageIndex(newIndex);
      setSelected(pg.cells[0]?.id ?? null);
    }
  };

  const onAddLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      addCanvas(imageToCanvas(img), file.name);
      toast.success(addModeRef.current === 'new-page' ? 'Added as new page' : 'Added to this page');
    } catch {
      toast.error('Could not load image');
    }
  };

  const removeSelected = () => {
    if (!selected || !page) return;
    if (selectedMark) {
      touchSheet();
      setPages((prev) =>
        prev.map((pg, i) =>
          i !== pageIndex ? pg : { ...pg, marks: (pg.marks || []).filter((m) => m.id !== selected) },
        ),
      );
      setSelected(page.cells[0]?.id ?? null);
      return;
    }
    if (!selectedCell) return;
    touchSheet();
    setPages((prev) =>
      prev.map((pg, i) =>
        i !== pageIndex ? pg : { ...pg, cells: pg.cells.filter((c) => c.id !== selectedCell.id) },
      ),
    );
    setSelected(null);
  };

  const paperSizeLabel = `${paper.label} · ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`;

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

  // Sharp original while it already matches the paper. After a layout change, or when
  // the file is a different size, the viewer shows the composed sheet. Re-opening the
  // viewer with the same sheet keeps stamps and text already placed on it.
  useEffect(() => {
    if (surface !== 'pdf') return;
    if (originalPdfUrl && sheetRev === 0) return;
    const key = `${paper.wMm}x${paper.hMm}@${sheetRev}`;
    if (layoutKeyRef.current === key) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await pagesToPdfBlob(pages, paper);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        layoutKeyRef.current = key;
        setLayoutPdfUrl((prev) => {
          if (prev && prev !== url) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Could not open the PDF viewer');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surface, sheetRev, pages, paper, originalPdfUrl]);

  const outputPdf = async () => {
    if (surface === 'pdf' && pdfRef.current) {
      try {
        return await assertPaper(await pdfRef.current.exportPdf());
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('mm')) throw e;
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

  const openDrive = (target: 'canvas' | 'viewer') => {
    driveTargetRef.current = target;
    if (target === 'canvas') addModeRef.current = 'this-page';
    setDriveOpen(true);
  };

  const onDrivePick = async (file: File) => {
    const looksImage = !file.type || file.type.startsWith('image/');
    if (!looksImage) {
      toast.error('Choose a photo (JPG or PNG)');
      return;
    }
    if (driveTargetRef.current === 'viewer') {
      setSurface('pdf');
      pdfRef.current?.stampFile(file);
      toast.success('Image placed on the PDF');
      return;
    }
    try {
      const img = await loadImageFromFile(file);
      addCanvas(imageToCanvas(img), file.name);
      toast.success(addModeRef.current === 'new-page' ? 'Added as new page' : 'Added to this page');
    } catch {
      toast.error('Could not load image');
    }
  };

  const setViewerTool = (mode: PdfEditorMode) => {
    setSurface('pdf');
    pdfRef.current?.setEditorMode(mode);
  };

  const backTo = from || '/app/whatsapp';
  const subtitle = useMemo(() => {
    const who = name || phone;
    return who ? `For ${who}` : 'WhatsApp / Drive document → paper';
  }, [name, phone]);

  const cropAspect = selectedCell
    ? selectedCell.w / Math.max(1, selectedCell.h)
    : paper.w / paper.h;
  const cropTargetW = Math.min(1800, selectedCell?.w || paper.w);
  const cropTargetH = Math.round(cropTargetW / cropAspect);

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
        <p className="text-sm text-[var(--muted-foreground)]">No image loaded for print layout.</p>
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate(backTo)}>
          Go back
        </button>
      </div>
    );
  }

  const fitMode = selectedCell?.fitMode || 'contain';
  const brightness = selectedCell?.brightness ?? 0;
  const contrast = selectedCell?.contrast ?? 0;
  const pad = 28;
  const availW = Math.max(160, stageBox.w - pad * 2);
  const availH = Math.max(160, stageBox.h - pad * 2);
  const aspect = paper.w / Math.max(1, paper.h);
  // Portrait pages fill the stage width and scroll (PDF-editor style).
  // Landscape pages shrink to stay fully visible.
  let sheetW = availW;
  let sheetH = sheetW / aspect;
  if (aspect >= 1 && sheetH > availH) {
    sheetH = availH;
    sheetW = sheetH * aspect;
  }
  sheetW = Math.round(sheetW * stageZoom);
  sheetH = Math.round(sheetH * stageZoom);
  const sheetFits = sheetH <= availH + 4;
  const viewerUrl = originalPdfUrl && sheetRev === 0 ? originalPdfUrl : layoutPdfUrl;

  const chip = (on: boolean) =>
    ({
      borderColor: on ? 'hsl(27 95% 55%)' : 'var(--border)',
      background: on ? 'hsl(27 95% 55% / 0.14)' : 'transparent',
      color: on ? 'hsl(18 80% 32%)' : 'inherit',
    }) as const;

  const textMark = selectedMark?.kind === 'text' ? selectedMark : null;
  const toolBtn = (on: boolean) =>
    ({
      color: on ? 'hsl(18 80% 32%)' : 'inherit',
      background: on ? 'hsl(27 95% 55% / 0.16)' : 'transparent',
      borderRadius: 8,
    }) as const;

  return (
    <div className="flex flex-col h-full min-h-0" data-doc-print="1">
      <header
        className="shrink-0 border-b"
        style={{ background: '#fff', borderColor: 'hsl(var(--pt-border))' }}
      >
        <div className="h-12 px-2 flex items-center gap-1">
        <button type="button" className="btn-secondary text-xs py-1.5 px-2 shrink-0" onClick={() => navigate(backTo)}>
          <CaretLeft size={14} className="inline" /> Back
        </button>
        <span className="text-sm font-semibold truncate min-w-0 flex-1 px-1" title={subtitle}>{subtitle}</span>
        <span className="sr-only" data-doc-print-paper={paperId}>{paperSizeLabel}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="btn-secondary text-xs py-1.5 px-2 shrink-0"
            onClick={handleDownloadPdf}
            disabled={busy || !pages.length}
            data-doc-print-download="1"
          >
            <DownloadSimple size={14} /> PDF
          </button>
          <button
            type="button"
            className="btn-primary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1"
            onClick={handlePrint}
            disabled={busy || !pages.length}
            data-doc-print-submit="1"
          >
            {busy ? <SpinnerGap size={14} className="animate-spin" /> : <Printer size={14} />}
            Print
          </button>
        </div>
        </div>
        <div className="flex items-center gap-0.5 px-2 overflow-x-auto border-t" style={{ borderColor: 'hsl(var(--pt-border))' }}>
          {(
            [
              ['select', 'Select', <Cursor size={18} key="c" />],
              ['text', 'Text', <TextT size={18} key="t" />],
              ['box', 'Whiteout', <Square size={18} key="s" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium"
              style={toolBtn(tool === id)}
              onClick={() => {
                if (surface === 'pdf' && id === 'text') {
                  setViewerTool('text');
                  return;
                }
                if (surface === 'pdf' && id === 'select') {
                  setViewerTool('none');
                  return;
                }
                setSurface('edit');
                setTool(id);
              }}
              data-doc-print-tool={id}
            >
              {icon}
              {label}
            </button>
          ))}
          <button
            type="button"
            className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium"
            onClick={() => {
              if (surface === 'pdf') {
                setViewerTool('image');
                return;
              }
              setSurface('edit');
              addModeRef.current = 'this-page';
              addFileRef.current?.click();
            }}
            data-doc-print-tool="image"
            title="Add an image from this computer"
          >
            <ImageIcon size={18} />
            Image
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium"
            onClick={() => openDrive(surface === 'pdf' ? 'viewer' : 'canvas')}
            data-doc-print-tool="files"
            title="Choose an image from File Manager"
          >
            <FolderOpen size={18} />
            Files
          </button>
          <span className="w-px h-6 mx-1 shrink-0" style={{ background: 'hsl(var(--pt-border))' }} />
          <button
            type="button"
            className="text-[11px] rounded-md px-2 py-1 border font-medium shrink-0"
            style={chip(surface === 'edit')}
            onClick={() => setSurface('edit')}
            data-doc-print-surface="edit"
          >
            Edit
          </button>
          <button
            type="button"
            className="text-[11px] rounded-md px-2 py-1 border font-medium shrink-0"
            style={chip(surface === 'pdf')}
            onClick={() => setSurface('pdf')}
            title="Mozilla PDF viewer"
            data-doc-print-surface="pdf"
          >
            Viewer
          </button>
          <span className="w-px h-6 mx-1 shrink-0" style={{ background: 'hsl(var(--pt-border))' }} />
          {(Object.keys(DOC_PAPERS) as DocPaperId[]).map((id) => (
            <button
              key={id}
              type="button"
              className="text-[11px] rounded-md px-2 py-1 border font-medium shrink-0"
              style={chip(paperId === id)}
              onClick={() => changePaper(id)}
            >
              {id === 'a4' ? 'A4' : id === 'a4-landscape' ? 'A4 wide' : '4×6'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <aside
          className="w-full md:w-[104px] shrink-0 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r py-2 px-2 flex md:flex-col flex-row gap-2"
          style={{ background: '#ececec', borderColor: 'hsl(var(--pt-border))' }}
          data-doc-print-rail="1"
        >
          {pages.map((pg, i) => (
            <button
              key={pg.id}
              type="button"
              className="w-16 md:w-full shrink-0 text-left"
              onClick={() => {
                setPageIndex(i);
                setSelected(null);
                setSurface('edit');
              }}
            >
              <div
                className="rounded overflow-hidden bg-white"
                style={{ boxShadow: i === pageIndex ? '0 0 0 2px hsl(27 95% 55%)' : '0 1px 3px rgba(0,0,0,.2)' }}
              >
                <PageThumb page={pg} paper={paper} />
              </div>
              <div className="text-[10px] text-center mt-0.5 text-[var(--muted-foreground)]">{i + 1}</div>
            </button>
          ))}
          <button
            type="button"
            className="w-16 md:w-full shrink-0 text-[10px] rounded border border-dashed py-2"
            onClick={addBlankPage}
            data-doc-print-blank="1"
          >
            Blank
          </button>
          <button
            type="button"
            className="w-16 md:w-full shrink-0 text-[10px] rounded border border-dashed py-2"
            onClick={() => {
              addModeRef.current = 'new-page';
              addFileRef.current?.click();
            }}
          >
            + Page
          </button>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {surface === 'pdf' ? (
          <div
            className="shrink-0 h-10 border-b px-2 flex items-center gap-1.5 text-xs overflow-x-auto whitespace-nowrap [&>*]:shrink-0"
            style={{ background: '#fafafa', borderColor: 'hsl(var(--pt-border))' }}
            data-doc-print-pdf-tools="1"
          >
            <button type="button" className="text-[11px] rounded-md px-2 py-1 border font-medium" onClick={() => setViewerTool('text')} data-doc-print-viewer-tool="text">
              <TextT size={14} className="inline mr-1" /> Text
            </button>
            <button type="button" className="text-[11px] rounded-md px-2 py-1 border font-medium" onClick={() => setViewerTool('draw')} data-doc-print-viewer-tool="draw">
              <PencilSimple size={14} className="inline mr-1" /> Draw
            </button>
            <button type="button" className="text-[11px] rounded-md px-2 py-1 border font-medium" onClick={() => setViewerTool('highlight')} data-doc-print-viewer-tool="highlight">
              Highlight
            </button>
            <button type="button" className="text-[11px] rounded-md px-2 py-1 border font-medium" onClick={() => setViewerTool('image')} data-doc-print-viewer-tool="image">
              <ImageIcon size={14} className="inline mr-1" /> Image
            </button>
            <button type="button" className="btn-primary text-[11px] py-1 px-2" onClick={() => openDrive('viewer')} data-doc-print-viewer-tool="files">
              <FolderOpen size={14} className="inline mr-1" /> From files
            </button>
            <span className="text-[var(--muted-foreground)]">Text, drawing, and images here print on this {paper.label}.</span>
          </div>
          ) : (
          <div
            className="shrink-0 h-10 border-b px-2 flex items-center gap-1.5 text-xs overflow-x-auto whitespace-nowrap [&>*]:shrink-0"
            style={{ background: '#fafafa', borderColor: 'hsl(var(--pt-border))' }}
            data-doc-print-edit="1"
          >
            {textMark && (
              <>
                <input
                  ref={textInputRef}
                  className="input-field text-xs py-1 w-48"
                  value={textMark.text}
                  data-doc-print-text="1"
                  onChange={(e) => updateMark(textMark.id, { text: e.target.value })}
                  aria-label="Text"
                />
                <input
                  type="number"
                  className="input-field text-xs py-1 w-16"
                  min={12}
                  max={200}
                  value={textMark.size}
                  onChange={(e) => updateMark(textMark.id, { size: Math.max(12, +e.target.value || 12) })}
                  aria-label="Font size"
                />
                <input
                  type="color"
                  value={textMark.color}
                  onChange={(e) => updateMark(textMark.id, { color: e.target.value })}
                  aria-label="Text color"
                />
                <button type="button" className="btn-secondary text-xs py-1 text-red-600" onClick={removeSelected}>
                  <Trash size={13} /> Delete
                </button>
              </>
            )}
            {selectedMark?.kind === 'box' && (
              <button type="button" className="btn-secondary text-xs py-1 text-red-600" onClick={removeSelected}>
                <Trash size={13} /> Delete whiteout
              </button>
            )}
            {selectedCell && (
              <>
                <button type="button" className="btn-primary text-xs py-1 px-2 flex items-center gap-1" onClick={() => setCropOpen(true)} data-doc-print-crop="1">
                  <Crop size={14} /> Crop
                </button>
                <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => rotateSelected(-90)} aria-label="Rotate left" data-doc-print-rotate-left="1">
                  <ArrowCounterClockwise size={14} />
                </button>
                <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => rotateSelected(90)} aria-label="Rotate right" data-doc-print-rotate-right="1">
                  <ArrowClockwise size={14} />
                </button>
                <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={flipSelected} aria-label="Flip horizontal" data-doc-print-flip="1">
                  <ArrowsLeftRight size={14} />
                </button>
                {(
                  [
                    ['contain', 'Fit'],
                    ['cover', 'Fill'],
                  ] as const
                ).map(([mode, label]) => (
                  <button key={mode} type="button" className="text-xs rounded-md px-2 py-1 border" style={chip(fitMode === mode)} onClick={() => setFitMode(mode)} data-doc-print-fit={mode}>
                    {label}
                  </button>
                ))}
                <div className="flex gap-0.5" data-doc-print-margin="1">
                  {MARGIN_PRESETS.map((m) => (
                    <button key={m.mm} type="button" className="text-[11px] w-7 py-1 border rounded" style={chip(marginMm === m.mm)} onClick={() => applyMargin(m.mm)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[10px]">
                  B
                  <input type="range" min={-40} max={40} value={brightness} onChange={(e) => applyToneToSelected(+e.target.value, contrast)} className="w-16" data-doc-print-brightness="1" aria-label="Brightness" />
                </label>
                <label className="flex items-center gap-1 text-[10px]">
                  C
                  <input type="range" min={-40} max={40} value={contrast} onChange={(e) => applyToneToSelected(brightness, +e.target.value)} className="w-16" data-doc-print-contrast="1" aria-label="Contrast" />
                </label>
                <button type="button" className="btn-secondary text-xs py-1" onClick={fitSelected}>Margin</button>
                <button type="button" className="btn-secondary text-xs py-1" onClick={fillPageSelected}>Bleed</button>
                <button type="button" className="btn-secondary text-xs py-1 text-red-600" onClick={removeSelected} disabled={page.cells.length === 1 && pages.length === 1 && !selectedMark}>
                  <Trash size={13} />
                </button>
              </>
            )}
            {!selectedCell && !selectedMark && (
              <span className="text-[var(--muted-foreground)]">
                {page.cells.length ? 'Select the page, or add Text, Image, or Whiteout.' : 'Blank paper. Add an image, or drop a photo on the page.'}
              </span>
            )}
          </div>
          )}

          {surface === 'pdf' ? (
            <div className="flex-1 min-h-0" data-doc-print-pdf="1">
              {viewerUrl ? (
                <MozillaPdfEmbed
                  key={viewerUrl}
                  ref={pdfRef}
                  fileUrl={viewerUrl}
                  mode="editor"
                  onPickDriveImage={() => openDrive('viewer')}
                />
              ) : (
                <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
                  <SpinnerGap size={22} className="animate-spin" /> Opening PDF…
                </div>
              )}
            </div>
          ) : (
          <div
            ref={stageRef}
            className="flex-1 min-h-0 overflow-auto"
            style={{ background: '#d0d0d0' }}
            data-doc-print-stage="1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (!file || !file.type.startsWith('image/')) return;
              addModeRef.current = 'this-page';
              void loadImageFromFile(file)
                .then((img) => addCanvas(imageToCanvas(img), file.name))
                .catch(() => toast.error('Could not load image'));
            }}
          >
            <div
              className="relative flex justify-center p-4 box-border"
              style={{ minHeight: '100%', alignItems: sheetFits ? 'center' : 'flex-start' }}
            >
              <canvas
                ref={canvasRef}
                className="block select-none bg-white shrink-0"
                style={{
                  touchAction: 'pan-y',
                  width: sheetW,
                  height: sheetH,
                  cursor: tool === 'select' ? 'grab' : 'crosshair',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              {!page.cells.length && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-2">
                  <button
                    type="button"
                    className="btn-primary text-sm px-4 py-2 shadow"
                    data-doc-print-add-image="1"
                    onClick={() => {
                      addModeRef.current = 'this-page';
                      addFileRef.current?.click();
                    }}
                  >
                    Add image
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-sm px-4 py-2 shadow"
                    data-doc-print-add-drive="1"
                    onClick={() => openDrive('canvas')}
                  >
                    From files
                  </button>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={onAddLocal} />
      <DrivePicker
        open={driveOpen}
        imagesOnly
        onClose={() => setDriveOpen(false)}
        onPick={(file) => {
          setDriveOpen(false);
          void onDrivePick(file);
        }}
      />
      {surface === 'edit' && (
      <footer
        className="shrink-0 h-10 border-t px-3 flex items-center gap-2 text-xs overflow-x-auto whitespace-nowrap"
        style={{ background: '#fff', borderColor: 'hsl(var(--pt-border))' }}
      >
        <span className="hidden md:inline-flex items-center gap-1 text-[var(--muted-foreground)]">
          <ArrowsOut size={12} /> Drag to move · corner to resize
        </span>
        <div className="flex items-center gap-1 mx-auto">
          <button type="button" className="btn-secondary p-1.5" onClick={() => setStageZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
            <MagnifyingGlassMinus size={14} />
          </button>
          <input type="range" min={0.5} max={2.4} step={0.05} value={stageZoom} onChange={(e) => setStageZoom(+e.target.value)} className="w-28" data-doc-print-stage-zoom="1" aria-label="Page zoom" />
          <button type="button" className="btn-secondary p-1.5" onClick={() => setStageZoom((z) => Math.min(2.4, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
            <MagnifyingGlassPlus size={14} />
          </button>
          <button type="button" className="btn-secondary text-[11px] px-2 py-1" onClick={() => setStageZoom(1)}>Fit page</button>
          <span className="tabular-nums w-10">{Math.round(stageZoom * 100)}%</span>
        </div>
        <span className="tabular-nums">{pageIndex + 1} / {pages.length}</span>
      </footer>
      )}

      <AspectCropModal
        open={cropOpen}
        source={selectedCell?.canvas ?? null}
        aspect={cropAspect}
        targetW={cropTargetW}
        targetH={cropTargetH}
        onApply={onCropApply}
        onClose={() => setCropOpen(false)}
        title="Crop document"
        hint="Drag to pan · wheel to zoom · keep what you want to print inside the box"
        applyLabel="Apply crop"
        showFaceGuide={false}
      />
    </div>
  );
}
