/**
 * Clean up a photo like Adobe Scan: paint over a stain, pen mark, finger or
 * staple and it is filled with the colours around it when you lift the finger.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { fillFromSurroundings } from './docInpaint';

type Props = {
  open: boolean;
  source: HTMLCanvasElement | null;
  onApply: (cleaned: HTMLCanvasElement) => void;
  onClose: () => void;
};

const BRUSHES = [
  { id: 's', label: 'Small', frac: 0.012 },
  { id: 'm', label: 'Medium', frac: 0.025 },
  { id: 'l', label: 'Large', frac: 0.05 },
] as const;
const MAX_UNDO = 12;

function copy(c: HTMLCanvasElement) {
  const o = document.createElement('canvas');
  o.width = c.width;
  o.height = c.height;
  o.getContext('2d')?.drawImage(c, 0, 0);
  return o;
}

export default function CleanupModal({ open, source, onApply, onClose }: Props) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const history = useRef<HTMLCanvasElement[]>([]);
  const stroke = useRef<{ x: number; y: number }[] | null>(null);
  const [brush, setBrush] = useState<(typeof BRUSHES)[number]['id']>('m');
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [undoCount, setUndoCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState(0);

  // Fit the photo on screen.
  useLayoutEffect(() => {
    if (!open || !source) return;
    work.current = copy(source);
    history.current = [];
    setUndoCount(0);
    setEdits(0);
    const fit = () => {
      const narrow = window.innerWidth < 640;
      const maxW = Math.min(860, window.innerWidth - (narrow ? 40 : 80));
      const maxH = Math.min(760, window.innerHeight - (narrow ? 250 : 220));
      const s = Math.min(maxW / source.width, maxH / source.height, 1);
      setStage({ w: Math.max(1, Math.round(source.width * s)), h: Math.max(1, Math.round(source.height * s)) });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open, source]);

  const redraw = () => {
    const v = viewRef.current;
    const w = work.current;
    if (!v || !w) return;
    v.width = stage.w;
    v.height = stage.h;
    const g = v.getContext('2d');
    if (!g) return;
    g.imageSmoothingQuality = 'high';
    g.drawImage(w, 0, 0, stage.w, stage.h);
  };
  useEffect(() => {
    if (!open || !stage.w) return;
    redraw();
    const p = paintRef.current;
    if (p) {
      p.width = stage.w;
      p.height = stage.h;
    }
    doneRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stage]);

  if (!open || !source) return null;

  const radius = () => {
    const b = BRUSHES.find((x) => x.id === brush)!;
    return Math.max(4, b.frac * Math.max(stage.w, stage.h));
  };
  const local = (e: React.PointerEvent) => {
    const r = paintRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * stage.w, y: ((e.clientY - r.top) / r.height) * stage.h };
  };
  const dab = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = paintRef.current?.getContext('2d');
    if (!g) return;
    g.strokeStyle = 'rgba(255, 64, 129, 0.55)';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = radius() * 2;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    stroke.current = [p];
    dab(p, p);
  };
  const move = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    const p = local(e);
    dab(s[s.length - 1], p);
    s.push(p);
  };
  const up = () => {
    const s = stroke.current;
    stroke.current = null;
    const p = paintRef.current;
    if (!s || !p) return;
    setBusy(true);
    // Let the pink stroke paint before the fill runs. Strokes queue in order.
    requestAnimationFrame(() => {
      const w = work.current;
      if (!w) return;
      // Rasterize the stroke at full photo resolution.
      const m = document.createElement('canvas');
      m.width = w.width;
      m.height = w.height;
      const g = m.getContext('2d', { willReadFrequently: true })!;
      const k = w.width / stage.w;
      g.strokeStyle = '#fff';
      g.fillStyle = '#fff';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = radius() * 2 * k;
      g.beginPath();
      g.moveTo(s[0].x * k, s[0].y * k);
      for (const q of s) g.lineTo(q.x * k, q.y * k);
      if (s.length === 1) g.lineTo(s[0].x * k + 0.1, s[0].y * k);
      g.stroke();
      const px = g.getImageData(0, 0, m.width, m.height).data;
      const mask = new Uint8Array(m.width * m.height);
      for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0;

      history.current.push(w);
      if (history.current.length > MAX_UNDO) history.current.shift();
      work.current = fillFromSurroundings(w, mask);
      setUndoCount(history.current.length);
      setEdits((n) => n + 1);
      // Keep the pink of a stroke still being drawn.
      if (!stroke.current) p.getContext('2d')?.clearRect(0, 0, p.width, p.height);
      redraw();
      setBusy(false);
    });
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    work.current = prev;
    setUndoCount(history.current.length);
    setEdits((n) => Math.max(0, n - 1));
    redraw();
  };
  const apply = () => {
    if (work.current && edits > 0) onApply(work.current);
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'hsl(220 30% 6% / 0.72)' }}
      data-image-cleanup="1"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cleanup-title"
        className="rounded-xl border w-full max-w-4xl p-3 sm:p-4 flex flex-col gap-3 max-h-full"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))', boxShadow: 'var(--shadow-lift)' }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        }}
      >
        <div>
          <h2 id="cleanup-title" className="text-base font-semibold">Clean up</h2>
          <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--pt-muted))' }} aria-live="polite">
            {busy
              ? 'Cleaning…'
              : 'Paint over a stain, pen mark, finger or staple. It is filled with the paper around it when you lift.'}
          </p>
        </div>

        <div className="flex justify-center rounded-lg py-2" style={{ background: 'hsl(220 20% 12%)' }}>
          <div className="relative" style={{ width: stage.w, height: stage.h }}>
            <canvas ref={viewRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
            <canvas
              ref={paintRef}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none', cursor: 'crosshair' }}
              aria-label="Photo. Paint over marks to remove them."
              data-cleanup-canvas="1"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div role="radiogroup" aria-label="Brush size" className="grid grid-cols-3 gap-1 rounded-lg border p-1" style={{ borderColor: 'hsl(var(--pt-border))' }}>
            {BRUSHES.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={brush === b.id}
                data-cleanup-brush={b.id}
                onClick={() => setBrush(b.id)}
                className="h-11 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))]"
                style={{
                  background: brush === b.id ? 'hsl(var(--marigold) / 0.16)' : 'transparent',
                  color: brush === b.id ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-ink))',
                }}
              >
                <span
                  aria-hidden="true"
                  className="rounded-full"
                  style={{ width: 6 + BRUSHES.indexOf(b) * 5, height: 6 + BRUSHES.indexOf(b) * 5, background: 'currentColor' }}
                />
                {b.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={undo}
            disabled={!undoCount || busy}
            data-cleanup-undo="1"
            className="btn-secondary h-11 px-4 inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ArrowCounterClockwise size={18} aria-hidden="true" /> Undo
          </button>
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" onClick={onClose} className="btn-secondary h-11 px-4 flex-1 sm:flex-none">
              Cancel
            </button>
            <button
              ref={doneRef}
              type="button"
              onClick={apply}
              disabled={busy}
              data-cleanup-apply="1"
              className="btn-primary h-11 px-5 inline-flex items-center justify-center gap-2 flex-[2] sm:flex-none"
            >
              <Check size={18} weight="bold" aria-hidden="true" /> Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
