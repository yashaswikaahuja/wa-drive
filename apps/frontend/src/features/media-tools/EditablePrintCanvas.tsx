/**
 * EditablePrintCanvas — interactive print sheet for issue #319.
 *
 * Features:
 * - Auto-pack N copies of the primary photo as the starting layout
 * - Drag/move each cell on the page
 * - Remove individual cells (× button)
 * - Add extra cells (local file or Drive) — mixed photos on one sheet
 * - Duplicate a cell
 * - Resize a cell by dragging the bottom-right handle
 * - Free paper (4×6 / A4) and copy-count controls
 * - Renders to JPEG for Print / Download / Save to Drive
 */
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Plus, Trash, Copy, Printer, DownloadSimple, FloppyDisk,
  ArrowsOut,
} from '@phosphor-icons/react';
import { mm, PAPER_4X6_L, PAPER_A4_P, PASSPORT_SLOT } from './sheetGeometry';
import { loadImageFromFile } from './imageOps';
import { type PaperId } from './printSheetBuild';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrintCell {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
}

interface Props {
  primary: HTMLCanvasElement;
  initCount?: number;
  paper?: PaperId;
  onPaperChange?: (p: PaperId) => void;
  onPrint?: (blob: Blob) => void;
  onSave?: (blob: Blob) => void;
  onPickDrive?: () => Promise<HTMLCanvasElement | null>;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const PAPER_DEF: Record<PaperId, typeof PAPER_4X6_L> = {
  '4x6': PAPER_4X6_L,
  a4: PAPER_A4_P,
};

function makeCellId() {
  return `c${Math.random().toString(36).slice(2, 9)}`;
}

function autoPackCells(
  img: HTMLCanvasElement,
  count: number,
  paper: typeof PAPER_4X6_L,
  slotW: number,
  slotH: number,
): PrintCell[] {
  const gapPx = mm(3);
  const marginPx = mm(6);
  const usableW = paper.w - marginPx * 2;
  const usableH = paper.h - marginPx * 2;
  const cols = Math.max(1, Math.floor((usableW + gapPx) / (slotW + gapPx)));
  const rows = Math.max(1, Math.floor((usableH + gapPx) / (slotH + gapPx)));
  const n = Math.min(count, cols * rows * 4);

  const gridCols = Math.min(cols, n);
  const gridRows = Math.ceil(n / gridCols);
  const gridW = gridCols * slotW + (gridCols - 1) * gapPx;
  const gridH = Math.min(gridRows, rows) * slotH + (Math.min(gridRows, rows) - 1) * gapPx;
  const ox = Math.round((paper.w - gridW) / 2);
  const oy = Math.round((paper.h - gridH) / 2);

  const cells: PrintCell[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / gridCols);
    const c = i % gridCols;
    cells.push({
      id: makeCellId(),
      x: ox + c * (slotW + gapPx),
      y: oy + r * (slotH + gapPx),
      w: slotW,
      h: slotH,
      canvas: img,
    });
  }
  return cells;
}

async function renderSheet(cells: PrintCell[], paper: typeof PAPER_4X6_L): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = paper.w;
  c.height = paper.h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const cell of cells) {
    const img = cell.canvas;
    const nw = img.width;
    const nh = img.height;
    const sa = nw / nh;
    const da = cell.w / cell.h;
    let sx = 0, sy = 0, sw = nw, sh = nh;
    if (sa > da) { sw = nh * da; sx = (nw - sw) / 2; }
    else { sh = nw / da; sy = (nh - sh) * 0.35; }
    ctx.drawImage(img, sx, sy, sw, sh, cell.x, cell.y, cell.w, cell.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
  }

  return new Promise((res, rej) => {
    c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.93);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditablePrintCanvas({
  primary,
  initCount = 8,
  paper: initPaper = '4x6',
  onPaperChange,
  onPrint,
  onSave,
  onPickDrive,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);

  const [paper, setPaper] = useState<PaperId>(initPaper);
  const paperDef = PAPER_DEF[paper];
  const [slotW] = useState(PASSPORT_SLOT.w);
  const [slotH] = useState(PASSPORT_SLOT.h);
  const [count, setCount] = useState(initCount);
  const [cells, setCells] = useState<PrintCell[]>(() =>
    autoPackCells(primary, initCount, PAPER_DEF[initPaper], PASSPORT_SLOT.w, PASSPORT_SLOT.h)
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1); // display px → paper px

  const dragRef = useRef<{
    cellId: string; startCellX: number; startCellY: number;
    startPointerX: number; startPointerY: number;
  } | null>(null);

  const resizeRef = useRef<{
    cellId: string; startW: number; startH: number;
    startPointerX: number; startPointerY: number;
  } | null>(null);

  // ── Draw ────────────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.width = paperDef.w;
    el.height = paperDef.h;
    const ctx = el.getContext('2d')!;
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, paperDef.w, paperDef.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (const cell of cells) {
      const img = cell.canvas;
      const nw = img.width;
      const nh = img.height;
      const sa = nw / nh;
      const da = cell.w / cell.h;
      let sx = 0, sy = 0, sw = nw, sh = nh;
      if (sa > da) { sw = nh * da; sx = (nw - sw) / 2; }
      else { sh = nw / da; sy = (nh - sh) * 0.35; }
      ctx.drawImage(img, sx, sy, sw, sh, cell.x, cell.y, cell.w, cell.h);

      if (cell.id === selected) {
        ctx.strokeStyle = 'hsl(27 95% 55%)';
        ctx.lineWidth = 6;
        ctx.strokeRect(cell.x + 3, cell.y + 3, cell.w - 6, cell.h - 6);
        // resize handle
        const hs = 28;
        ctx.fillStyle = 'hsl(27 95% 55%)';
        ctx.fillRect(cell.x + cell.w - hs, cell.y + cell.h - hs, hs, hs);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cell.x + cell.w - hs + 6, cell.y + cell.h - 8);
        ctx.lineTo(cell.x + cell.w - 8, cell.y + cell.h - 8);
        ctx.lineTo(cell.x + cell.w - 8, cell.y + cell.h - hs + 6);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.strokeRect(cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2);
      }
    }
  }, [cells, selected, paperDef]);

  // ── Scale observer ───────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setScale(paperDef.w / rect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [paperDef.w]);

  // ── Pointer helpers ──────────────────────────────────────────────

  const toPaper = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
    },
    [scale]
  );

  const hitTest = useCallback(
    (px: number, py: number): PrintCell | null => {
      for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i];
        if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
      }
      return null;
    },
    [cells]
  );

  const isHandle = (cell: PrintCell, px: number, py: number) => {
    const hs = 28; // paper px — matches draw above
    return px >= cell.x + cell.w - hs && py >= cell.y + cell.h - hs;
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const { x, y } = toPaper(e);
      const cell = hitTest(x, y);
      if (!cell) { setSelected(null); return; }
      setSelected(cell.id);
      (e.target as Element).setPointerCapture(e.pointerId);
      if (isHandle(cell, x, y)) {
        resizeRef.current = { cellId: cell.id, startW: cell.w, startH: cell.h, startPointerX: x, startPointerY: y };
      } else {
        dragRef.current = { cellId: cell.id, startCellX: cell.x, startCellY: cell.y, startPointerX: x, startPointerY: y };
      }
    },
    [toPaper, hitTest]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const { x, y } = toPaper(e);
      if (dragRef.current) {
        const { cellId, startCellX, startCellY, startPointerX, startPointerY } = dragRef.current;
        const dx = x - startPointerX;
        const dy = y - startPointerY;
        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? { ...c, x: Math.max(0, Math.round(startCellX + dx)), y: Math.max(0, Math.round(startCellY + dy)) }
              : c
          )
        );
      } else if (resizeRef.current) {
        const { cellId, startW, startH, startPointerX, startPointerY } = resizeRef.current;
        const dw = x - startPointerX;
        const dh = y - startPointerY;
        setCells((prev) =>
          prev.map((c) =>
            c.id === cellId
              ? { ...c, w: Math.max(mm(10), Math.round(startW + dw)), h: Math.max(mm(10), Math.round(startH + dh)) }
              : c
          )
        );
      }
    },
    [toPaper]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  // ── Cell mutations ───────────────────────────────────────────────

  const removeCell = (id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
    if (selected === id) setSelected(null);
  };

  const duplicateCell = (id: string) => {
    setCells((prev) => {
      const src = prev.find((c) => c.id === id);
      if (!src) return prev;
      return [...prev, { ...src, id: makeCellId(), x: src.x + mm(4), y: src.y + mm(4) }];
    });
  };

  const repack = (n: number, p: PaperId) => {
    setCells(autoPackCells(primary, n, PAPER_DEF[p], slotW, slotH));
    setSelected(null);
  };

  const addCellCanvas = (canvas: HTMLCanvasElement) => {
    const cx = Math.round(paperDef.w / 2 - slotW / 2);
    const cy = Math.round(paperDef.h / 2 - slotH / 2);
    const nc: PrintCell = { id: makeCellId(), x: cx, y: cy, w: slotW, h: slotH, canvas };
    setCells((prev) => [...prev, nc]);
    setSelected(nc.id);
  };

  const onAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await loadImageFromFile(file);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      addCellCanvas(c);
    } catch { /* ignore */ }
  };

  const addDrivePhoto = async () => {
    if (!onPickDrive) return;
    setBusy(true);
    try {
      const c = await onPickDrive();
      if (c) addCellCanvas(c);
    } finally {
      setBusy(false);
    }
  };

  // ── Output ───────────────────────────────────────────────────────

  const doRender = useCallback(async () => {
    setBusy(true);
    try {
      return await renderSheet(cells, paperDef);
    } finally {
      setBusy(false);
    }
  }, [cells, paperDef]);

  const handlePrint = async () => { const b = await doRender(); onPrint?.(b); };
  const handleSave = async () => { const b = await doRender(); onSave?.(b); };
  const handleDownload = async () => {
    const b = await doRender();
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url; a.download = `sheet_${paper}_x${count}.jpg`; a.click();
    URL.revokeObjectURL(url);
  };

  const selectedCell = cells.find((c) => c.id === selected);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {(['4x6', 'a4'] as const).map((p) => (
          <button key={p} type="button"
            className="text-xs rounded-lg border px-3 py-1.5"
            style={{ borderColor: paper === p ? 'hsl(27 95% 55%)' : 'var(--border)', background: paper === p ? 'hsl(27 95% 55% / 0.12)' : 'transparent' }}
            onClick={() => { setPaper(p); onPaperChange?.(p); repack(count, p); }}
          >{p === '4x6' ? '4×6' : 'A4'}</button>
        ))}

        <span className="text-xs text-[var(--muted-foreground)]">Copies:</span>
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => { const n = Math.max(1, count - 1); setCount(n); repack(n, paper); }}>−</button>
        <input type="number" min={1} max={100} value={count}
          className="input-field w-14 text-center text-xs py-1"
          onChange={(e) => { const n = Math.max(1, Math.min(100, +e.target.value || 1)); setCount(n); repack(n, paper); }} />
        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => { const n = Math.min(100, count + 1); setCount(n); repack(n, paper); }}>+</button>

        <div className="flex items-center gap-1.5 ml-auto">
          <button type="button" className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-2"
            onClick={() => addFileRef.current?.click()} title="Add local photo">
            <Plus size={13} /> Local
          </button>
          {onPickDrive && (
            <button type="button" className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-2"
              onClick={addDrivePhoto} disabled={busy} title="Add from Drive">
              <Plus size={13} /> Drive
            </button>
          )}
          <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={onAddFile} />
        </div>
      </div>

      {/* ── Selected cell toolbar ── */}
      {selectedCell && (
        <div className="flex items-center gap-3 shrink-0 rounded-lg border px-3 py-1.5 text-xs"
          style={{ borderColor: 'hsl(27 95% 55% / 0.4)', background: 'hsl(27 95% 55% / 0.06)' }}>
          <button type="button" className="flex items-center gap-1 text-amber-400 hover:text-amber-300"
            onClick={() => duplicateCell(selectedCell.id)}>
            <Copy size={12} /> Duplicate
          </button>
          <button type="button" className="flex items-center gap-1 text-red-400 hover:text-red-300"
            onClick={() => removeCell(selectedCell.id)}>
            <Trash size={12} /> Remove
          </button>
          <span className="text-[10px] text-[var(--muted-foreground)] ml-auto">
            {Math.round(selectedCell.w / (300 / 25.4))}×{Math.round(selectedCell.h / (300 / 25.4))} mm
            &nbsp;·&nbsp;drag to move&nbsp;·&nbsp;<ArrowsOut size={10} className="inline" /> corner to resize
          </span>
        </div>
      )}

      {/* ── Canvas ── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg flex items-start justify-center p-2" style={{ background: '#d4d4d4' }}>
        <canvas
          ref={canvasRef}
          className="block rounded shadow-xl cursor-pointer select-none"
          style={{ maxWidth: '100%', width: '100%', height: 'auto', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* ── Output buttons ── */}
      <div className="flex gap-2 shrink-0">
        <button type="button"
          className="btn-primary flex-1 text-sm flex items-center justify-center gap-2 py-2.5"
          onClick={handlePrint} disabled={busy || cells.length === 0}>
          <Printer size={16} /> {busy ? 'Rendering…' : 'Print'}
        </button>
        {onSave && (
          <button type="button"
            className="btn-secondary flex-1 text-sm flex items-center justify-center gap-2 py-2.5"
            onClick={handleSave} disabled={busy || cells.length === 0}>
            <FloppyDisk size={16} /> Save to Drive
          </button>
        )}
        <button type="button"
          className="btn-secondary text-sm flex items-center justify-center gap-2 px-3 py-2.5"
          onClick={handleDownload} disabled={busy || cells.length === 0}
          title="Download JPEG">
          <DownloadSimple size={16} />
        </button>
      </div>
    </div>
  );
}
