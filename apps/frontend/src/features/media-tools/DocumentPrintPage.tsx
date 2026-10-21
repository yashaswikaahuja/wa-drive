/**
 * Document print layout — opened from media-viewer Print on JPEG/WhatsApp docs.
 * Pick paper → place/adjust images → silent PDF → device print dialog.
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
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';
import { loadImageFromFile } from './imageOps';
import {
  DOC_PAPERS,
  type DocCell,
  type DocPage,
  type DocPaperId,
  fitImageOnPage,
  imageToCanvas,
  makeId,
  pagesToPdfBlob,
  renderPageCanvas,
} from './documentPrintLayout';

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
  const [addMode, setAddMode] = useState<'new-page' | 'this-page'>('new-page');

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
        setPages(canvases.map((c, i) => fitImageOnPage(c, p, 10, i === 0 ? name || undefined : undefined)));
        setPageIndex(0);
        setSelected(null);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load image');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on first mount / fileId change — paper change handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Refit when paper changes (keep sources, rebuild default fit per page)
  const changePaper = (next: DocPaperId) => {
    setPaperId(next);
    const p = DOC_PAPERS[next];
    setPages((prev) =>
      prev.map((pg) => {
        if (pg.cells.length === 1) {
          return fitImageOnPage(pg.cells[0].canvas, p, 10, pg.cells[0].label);
        }
        // Multi-cell: scale positions roughly into new paper
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
    setSelected(null);
  };

  // ── Draw current page ───────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !page) return;
    const sheet = renderPageCanvas(page, paper, selected);
    el.width = sheet.width;
    el.height = sheet.height;
    el.getContext('2d')!.drawImage(sheet, 0, 0);
  }, [page, paper, selected]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setScale(paper.w / rect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [paper.w, pageIndex, pages.length]);

  // ── Pointer ─────────────────────────────────────────────────────
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

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!page) return;
    const { x, y } = toPaper(e);
    const cell = hitTest(x, y);
    if (!cell) {
      setSelected(null);
      return;
    }
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

  // ── Add / remove ────────────────────────────────────────────────
  const addCanvas = (c: HTMLCanvasElement, label?: string) => {
    if (addMode === 'this-page' && pages[pageIndex]) {
      const margin = Math.round((10 * 300) / 25.4);
      const cell: DocCell = {
        id: makeId('c'),
        x: margin,
        y: margin,
        w: Math.round(paper.w / 2 - margin),
        h: Math.round(paper.h / 2 - margin),
        canvas: c,
        label,
      };
      setPages((prev) =>
        prev.map((pg, i) => (i === pageIndex ? { ...pg, cells: [...pg.cells, cell] } : pg)),
      );
      setSelected(cell.id);
    } else {
      const pg = fitImageOnPage(c, paper, 10, label);
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
    if (!selected || !page) return;
    setPages((prev) => {
      const next = prev
        .map((pg, i) =>
          i !== pageIndex ? pg : { ...pg, cells: pg.cells.filter((c) => c.id !== selected) },
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

  const fitSelected = () => {
    if (!selected || !page) return;
    const cell = page.cells.find((c) => c.id === selected);
    if (!cell) return;
    const fitted = fitImageOnPage(cell.canvas, paper, 10, cell.label);
    updateCell(selected, {
      x: fitted.cells[0].x,
      y: fitted.cells[0].y,
      w: fitted.cells[0].w,
      h: fitted.cells[0].h,
    });
  };

  // ── Print (silent PDF) ──────────────────────────────────────────
  const handlePrint = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await pagesToPdfBlob(pages, paper);
      printBlob(pdfBlob);
      toast.success('Opening print dialog…');
    } catch (e: any) {
      toast.error(e?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  };

  const backTo = from || '/app/whatsapp';
  const subtitle = useMemo(() => {
    const who = name || phone;
    return who ? `For ${who}` : 'WhatsApp / Drive document → paper';
  }, [name, phone]);

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

  return (
    <div className="flex flex-col lg:flex-row gap-3 p-3 md:p-4 h-full min-h-0" data-doc-print="1">
      {/* Sidebar */}
      <aside className="w-full lg:w-80 shrink-0 space-y-3 overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold">Print on paper</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{subtitle}</p>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-1.5 leading-snug">
            Layout here (page size + margins). When you Print, we build a PDF so the device dialog
            does not ask for page and margins again.
          </p>
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
                {DOC_PAPERS[id].label}
              </button>
            ))}
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

        {selected && (
          <div className="card space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Selected image</p>
            <button type="button" className="btn-secondary w-full text-sm py-2" onClick={fitSelected}>
              Fit to page
            </button>
            <button
              type="button"
              className="btn-secondary w-full text-sm py-2 flex items-center justify-center gap-1.5 text-red-600"
              onClick={removeSelected}
            >
              <Trash size={14} /> Remove image
            </button>
            <p className="text-[10px] text-[var(--muted-foreground)] flex items-center gap-1">
              <ArrowsOut size={10} /> Drag to move · corner to resize
            </p>
          </div>
        )}

        <button
          type="button"
          className="btn-primary w-full text-sm flex items-center justify-center gap-2 py-3"
          onClick={handlePrint}
          disabled={busy || !pages.length}
          data-doc-print-submit="1"
        >
          {busy ? <SpinnerGap size={18} className="animate-spin" /> : <Printer size={18} />}
          {busy ? 'Preparing PDF…' : 'Print'}
        </button>
        <p className="text-[10px] text-center text-[var(--muted-foreground)]">
          Converts layout to PDF, then opens the printer dialog
        </p>
      </aside>

      {/* Stage */}
      <div
        className="flex-1 min-h-[280px] rounded-xl flex items-center justify-center overflow-auto p-3"
        style={{ background: '#d4d4d4' }}
      >
        <canvas
          ref={canvasRef}
          className="block rounded shadow-xl max-w-full h-auto cursor-grab active:cursor-grabbing select-none bg-white"
          style={{ touchAction: 'none', width: '100%', maxWidth: paperId === '4x6' ? 480 : 560 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    </div>
  );
}
