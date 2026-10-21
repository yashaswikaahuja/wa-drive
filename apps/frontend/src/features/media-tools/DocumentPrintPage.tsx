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
  CaretRight,
  SpinnerGap,
  UploadSimple,
  ArrowsOut,
  DownloadSimple,
  Crop,
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsLeftRight,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
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
import {
  DOC_PAPERS,
  cellInMargin,
  cloneCanvas,
  type DocCell,
  type DocFitMode,
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

const MARGIN_PRESETS = [
  { mm: 0, label: '0' },
  { mm: 5, label: '5' },
  { mm: 10, label: '10' },
  { mm: 15, label: '15' },
] as const;

async function loadDriveImage(fileId: string): Promise<HTMLCanvasElement> {
  const blob = await getCachedBlob(fileId, async () => {
    const res = await api.get(`/drive/download/${fileId}`, { responseType: 'blob' });
    return new Blob([res.data], {
      type: String(res.headers['content-type'] ?? 'image/jpeg'),
    });
  });
  const img = await loadImageFromFile(blob);
  return imageToCanvas(img);
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
  const [marginMm, setMarginMm] = useState(10);
  const [addMode, setAddMode] = useState<'new-page' | 'this-page'>('new-page');
  const [cropOpen, setCropOpen] = useState(false);

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
  const selectedCell = page?.cells.find((c) => c.id === selected) || page?.cells[0] || null;
  const selectedId = selectedCell?.id ?? null;

  // Keep selection on a real cell when pages change
  useEffect(() => {
    if (!page) {
      setSelected(null);
      return;
    }
    if (!selected || !page.cells.some((c) => c.id === selected)) {
      setSelected(page.cells[0]?.id ?? null);
    }
  }, [page, selected]);

  // ── Load primary + extras ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!fileId) {
        setLoading(false);
        toast.error('No file to print');
        return;
      }
      setLoading(true);
      try {
        const ids = [fileId, ...extraIds.filter((id) => id !== fileId)];
        const canvases: HTMLCanvasElement[] = [];
        for (const id of ids) {
          try {
            canvases.push(await loadDriveImage(id));
          } catch {
            /* skip missing */
          }
        }
        if (cancelled) return;
        if (!canvases.length) throw new Error('Could not load image');
        const p = DOC_PAPERS[paperId];
        const built = canvases.map((c, i) =>
          fitImageOnPage(c, p, marginMm, i === 0 ? name || undefined : undefined),
        );
        setPages(built);
        setPageIndex(0);
        setSelected(built[0]?.cells[0]?.id ?? null);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load image');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const changePaper = (next: DocPaperId) => {
    setPaperId(next);
    const p = DOC_PAPERS[next];
    setPages((prev) =>
      prev.map((pg) => {
        if (pg.cells.length === 1) {
          const c = pg.cells[0];
          return fitImageOnPage(c.canvas, p, marginMm, c.label, c.fitMode || 'contain');
        }
        const sx = p.w / Math.max(1, DOC_PAPERS[paperId].w);
        const sy = p.h / Math.max(1, DOC_PAPERS[paperId].h);
        return {
          ...pg,
          cells: pg.cells.map((c) => ({
            ...c,
            x: Math.round(c.x * sx),
            y: Math.round(c.y * sy),
            w: Math.round(c.w * sx),
            h: Math.round(c.h * sy),
          })),
        };
      }),
    );
  };

  const applyMargin = (nextMm: number) => {
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
    const sheet = renderPageCanvas(page, paper, selectedId);
    el.width = sheet.width;
    el.height = sheet.height;
    el.getContext('2d')!.drawImage(sheet, 0, 0);
  }, [page, paper, selectedId]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setScale(paper.w / rect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper.w, pageIndex, pages.length, stageZoom]);

  const toPaper = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
    },
    [scale],
  );

  const hitTest = useCallback(
    (px: number, py: number): DocCell | null => {
      if (!page) return null;
      for (let i = page.cells.length - 1; i >= 0; i--) {
        const c = page.cells[i];
        if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
      }
      return null;
    },
    [page],
  );

  const isHandle = (cell: DocCell, px: number, py: number) => {
    const hs = 28;
    return px >= cell.x + cell.w - hs && py >= cell.y + cell.h - hs;
  };

  const updateCell = (cellId: string, patch: Partial<DocCell>) => {
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
    if (dragRef.current) {
      const { cellId, startCellX, startCellY, startPointerX, startPointerY } = dragRef.current;
      updateCell(cellId, {
        x: Math.max(0, Math.round(startCellX + (x - startPointerX))),
        y: Math.max(0, Math.round(startCellY + (y - startPointerY))),
      });
    } else if (resizeRef.current) {
      const { cellId, startW, startH, startPointerX, startPointerY } = resizeRef.current;
      updateCell(cellId, {
        w: Math.max(mmMin(), Math.round(startW + (x - startPointerX))),
        h: Math.max(mmMin(), Math.round(startH + (y - startPointerY))),
      });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    resizeRef.current = null;
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
  const addCanvas = (c: HTMLCanvasElement, label?: string) => {
    if (addMode === 'this-page' && pages[pageIndex]) {
      const box = cellInMargin(
        { id: '', x: 0, y: 0, w: 0, h: 0, canvas: c },
        paper,
        marginMm,
      );
      const cell: DocCell = {
        id: makeId('c'),
        ...box,
        w: Math.round(box.w / 2),
        h: Math.round(box.h / 2),
        canvas: c,
        baseCanvas: cloneCanvas(c),
        fitMode: 'contain',
        brightness: 0,
        contrast: 0,
        label,
      };
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
      toast.success(addMode === 'new-page' ? 'Added as new page' : 'Added to this page');
    } catch {
      toast.error('Could not load image');
    }
  };

  const removeSelected = () => {
    if (!selectedCell || !page) return;
    setPages((prev) => {
      const next = prev
        .map((pg, i) =>
          i !== pageIndex ? pg : { ...pg, cells: pg.cells.filter((c) => c.id !== selectedCell.id) },
        )
        .filter((pg) => pg.cells.length > 0);
      return next.length ? next : prev;
    });
    setSelected(null);
  };

  const removePage = () => {
    if (pages.length <= 1) {
      toast.error('Keep at least one page');
      return;
    }
    setPages((prev) => prev.filter((_, i) => i !== pageIndex));
    setPageIndex((i) => Math.max(0, Math.min(i, pages.length - 2)));
    setSelected(null);
  };

  const paperSizeLabel = `${paper.label} · ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`;

  const buildPdf = async () => {
    const pdfBlob = await pagesToPdfBlob(pages, paper);
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

  const handlePrint = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await buildPdf();
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
      const pdfBlob = await buildPdf();
      downloadBlob(pdfBlob, `document_${paperId}_${pages.length}p.pdf`);
      toast.success(`Saved ${paper.label} PDF`);
    } catch (e: any) {
      toast.error(e?.message || 'PDF failed');
    } finally {
      setBusy(false);
    }
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
  const baseMaxW = paperId === '4x6' ? 480 : 560;

  return (
    <div className="flex flex-col lg:flex-row gap-3 p-3 md:p-4 h-full min-h-0" data-doc-print="1">
      <aside className="w-full lg:w-80 shrink-0 space-y-3 overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold">Print on paper</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1.5 leading-snug">
            Crop, rotate, fit the photo on the page, then Print. PDF uses the exact paper size.
          </p>
          <div
            className="mt-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            style={{ background: 'hsl(27 95% 55% / 0.15)', color: 'hsl(27 95% 35%)' }}
            data-doc-print-paper={paperId}
          >
            Selected: {paperSizeLabel}
          </div>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Paper</p>
          <div className="grid grid-cols-1 gap-1.5">
            {(Object.keys(DOC_PAPERS) as DocPaperId[]).map((id) => (
              <button
                key={id}
                type="button"
                className="text-left text-sm rounded-lg py-2.5 px-3 border"
                style={{
                  borderColor: paperId === id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: paperId === id ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
                onClick={() => changePaper(id)}
              >
                <span className="font-medium">{DOC_PAPERS[id].label}</span>
                <span className="block text-[10px] text-[var(--muted-foreground)] mt-0.5">
                  {DOC_PAPERS[id].wMm.toFixed(0)}×{DOC_PAPERS[id].hMm.toFixed(0)} mm
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 pt-1">Margin (mm)</p>
          <div className="flex gap-1" data-doc-print-margin="1">
            {MARGIN_PRESETS.map((m) => (
              <button
                key={m.mm}
                type="button"
                className="flex-1 text-xs rounded-lg py-2 border font-medium"
                style={{
                  borderColor: marginMm === m.mm ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: marginMm === m.mm ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
                onClick={() => applyMargin(m.mm)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Always-visible edit bar for the active image */}
        <div className="card space-y-2.5" data-doc-print-edit="1">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Edit image</p>

          <button
            type="button"
            className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-1.5"
            onClick={() => setCropOpen(true)}
            disabled={!selectedCell}
            data-doc-print-crop="1"
          >
            <Crop size={16} /> Crop
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              className="btn-secondary text-xs py-2.5 flex flex-col items-center gap-0.5"
              onClick={() => rotateSelected(-90)}
              disabled={!selectedCell}
              aria-label="Rotate left"
              data-doc-print-rotate-left="1"
            >
              <ArrowCounterClockwise size={16} /> Left
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-2.5 flex flex-col items-center gap-0.5"
              onClick={() => rotateSelected(90)}
              disabled={!selectedCell}
              aria-label="Rotate right"
              data-doc-print-rotate-right="1"
            >
              <ArrowClockwise size={16} /> Right
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-2.5 flex flex-col items-center gap-0.5"
              onClick={flipSelected}
              disabled={!selectedCell}
              aria-label="Flip horizontal"
              data-doc-print-flip="1"
            >
              <ArrowsLeftRight size={16} /> Flip
            </button>
          </div>

          <p className="text-[11px] text-gray-500">Fit on page</p>
          <div className="flex gap-1">
            {(
              [
                ['contain', 'Fit'],
                ['cover', 'Fill'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="flex-1 text-xs rounded-lg py-2 border font-medium"
                style={{
                  borderColor: fitMode === mode ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: fitMode === mode ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
                onClick={() => setFitMode(mode)}
                data-doc-print-fit={mode}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" className="btn-secondary flex-1 text-xs py-2" onClick={fitSelected}>
              Fit + margin
            </button>
            <button type="button" className="btn-secondary flex-1 text-xs py-2" onClick={fillPageSelected}>
              Edge to edge
            </button>
          </div>

          <label className="block text-[11px] text-gray-500">
            Brightness <span className="float-right tabular-nums">{brightness}</span>
          </label>
          <input
            type="range"
            min={-40}
            max={40}
            step={1}
            value={brightness}
            disabled={!selectedCell}
            onChange={(e) => applyToneToSelected(+e.target.value, contrast)}
            className="w-full"
            data-doc-print-brightness="1"
          />
          <label className="block text-[11px] text-gray-500">
            Contrast <span className="float-right tabular-nums">{contrast}</span>
          </label>
          <input
            type="range"
            min={-40}
            max={40}
            step={1}
            value={contrast}
            disabled={!selectedCell}
            onChange={(e) => applyToneToSelected(brightness, +e.target.value)}
            className="w-full"
            data-doc-print-contrast="1"
          />

          <p className="text-[10px] text-[var(--muted-foreground)] flex items-center gap-1">
            <ArrowsOut size={10} /> Drag to move · corner to resize
          </p>
          <button
            type="button"
            className="btn-secondary w-full text-sm py-2 flex items-center justify-center gap-1.5 text-red-600"
            onClick={removeSelected}
            disabled={!selectedCell || (page?.cells.length === 1 && pages.length === 1)}
          >
            <Trash size={14} /> Remove image
          </button>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Preview zoom</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary p-2"
              onClick={() => setStageZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}
              aria-label="Zoom out"
            >
              <MagnifyingGlassMinus size={16} />
            </button>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.05}
              value={stageZoom}
              onChange={(e) => setStageZoom(+e.target.value)}
              className="flex-1"
              data-doc-print-stage-zoom="1"
            />
            <button
              type="button"
              className="btn-secondary p-2"
              onClick={() => setStageZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}
              aria-label="Zoom in"
            >
              <MagnifyingGlassPlus size={16} />
            </button>
            <span className="text-xs tabular-nums w-10 text-right">{Math.round(stageZoom * 100)}%</span>
          </div>
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">Add images</p>
          <div className="flex gap-1">
            {(
              [
                ['new-page', 'New page'],
                ['this-page', 'This page'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="flex-1 text-xs rounded-lg py-2 border"
                style={{
                  borderColor: addMode === id ? 'hsl(27 95% 55%)' : 'var(--border)',
                  background: addMode === id ? 'hsl(27 95% 55% / 0.12)' : 'transparent',
                }}
                onClick={() => setAddMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary w-full text-sm flex items-center justify-center gap-2 py-2.5"
            onClick={() => addFileRef.current?.click()}
          >
            <UploadSimple size={16} /> Add image
          </button>
          <input
            ref={addFileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/*"
            className="hidden"
            onChange={onAddLocal}
          />
        </div>

        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-gray-500">
            Pages · {pages.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary p-2"
              disabled={pageIndex <= 0}
              onClick={() => {
                setPageIndex((i) => i - 1);
                setSelected(null);
              }}
              aria-label="Previous page"
            >
              <CaretLeft size={16} />
            </button>
            <span className="flex-1 text-center text-sm font-medium">
              Page {pageIndex + 1} of {pages.length}
            </span>
            <button
              type="button"
              className="btn-secondary p-2"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => {
                setPageIndex((i) => i + 1);
                setSelected(null);
              }}
              aria-label="Next page"
            >
              <CaretRight size={16} />
            </button>
          </div>
          {pages.length > 1 && (
            <button type="button" className="btn-secondary w-full text-xs py-2 text-red-600" onClick={removePage}>
              Remove this page
            </button>
          )}
        </div>

        <button
          type="button"
          className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-3"
          onClick={handlePrint}
          disabled={busy || !pages.length}
          data-doc-print-submit="1"
        >
          {busy ? <SpinnerGap size={18} className="animate-spin" /> : <Printer size={18} />}
          {busy ? 'Preparing PDF…' : `Print ${paper.label} PDF`}
        </button>
        <button
          type="button"
          className="btn-secondary w-full text-sm flex items-center justify-center gap-2 py-2.5"
          onClick={handleDownloadPdf}
          disabled={busy || !pages.length}
          data-doc-print-download="1"
        >
          <DownloadSimple size={16} /> Download PDF ({paper.label})
        </button>
        <p className="text-[10px] text-center text-[var(--muted-foreground)] leading-snug">
          In the printer dialog, paper should show {paper.label}. If it still says A4, pick{' '}
          {paper.label} once (PDF page is already {paper.wMm.toFixed(0)}×{paper.hMm.toFixed(0)} mm).
        </p>
      </aside>

      <div
        className="flex-1 min-h-[280px] rounded-xl flex items-center justify-center overflow-auto p-3"
        style={{ background: '#d4d4d4' }}
      >
        <canvas
          ref={canvasRef}
          className="block rounded shadow-xl h-auto cursor-grab active:cursor-grabbing select-none bg-white"
          style={{
            touchAction: 'none',
            width: '100%',
            maxWidth: Math.round(baseMaxW * stageZoom),
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

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
