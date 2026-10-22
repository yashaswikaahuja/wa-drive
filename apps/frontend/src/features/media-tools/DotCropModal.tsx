/**
 * Adobe Scan style crop: four corner dots on the photo, a magnifier while
 * a corner is dragged, then the page is straightened.
 */
import { useEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Drag =
  | { kind: 'corner'; index: number; x: number; y: number; pts: Point[] }
  | { kind: 'edge'; edge: number; x: number; y: number; pts: Point[] }
  | { kind: 'move'; x: number; y: number; pts: Point[] };

const HANDLES = ['tl', 'tr', 'br', 'bl'] as const;
const MIN_EDGE = 24;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function cloneCanvas(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

function rotateCanvas(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const g = c.getContext('2d')!;
  g.translate(c.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

function fitStage(bmp: HTMLCanvasElement) {
  const maxW = Math.min(window.innerWidth - 48, 920);
  const maxH = Math.min(window.innerHeight * 0.68, 620);
  const ratio = bmp.width / Math.max(1, bmp.height);
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w: Math.max(180, Math.round(w)), h: Math.max(140, Math.round(h)) };
}

function insetQuad(stage: { w: number; h: number }): Point[] {
  const m = Math.round(Math.min(stage.w, stage.h) * 0.08);
  return [
    { x: m, y: m },
    { x: stage.w - m, y: m },
    { x: stage.w - m, y: stage.h - m },
    { x: m, y: stage.h - m },
  ];
}

function fullQuad(stage: { w: number; h: number }): Point[] {
  return [
    { x: 0, y: 0 },
    { x: stage.w, y: 0 },
    { x: stage.w, y: stage.h },
    { x: 0, y: stage.h },
  ];
}

function edgeLen(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function convex(pts: Point[]) {
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const z = cross(pts[i], pts[(i + 1) % 4], pts[(i + 2) % 4]);
    if (Math.abs(z) < 1) continue;
    if (!sign) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return sign !== 0 && pts.every((p, i) => edgeLen(p, pts[(i + 1) % 4]) >= MIN_EDGE);
}

function shiftSome(start: Point[], indexes: number[], dx: number, dy: number, bounds: { w: number; h: number }) {
  let adx = dx;
  let ady = dy;
  for (const i of indexes) {
    const p = start[i];
    if (p.x + adx < 0) adx = -p.x;
    if (p.x + adx > bounds.w) adx = bounds.w - p.x;
    if (p.y + ady < 0) ady = -p.y;
    if (p.y + ady > bounds.h) ady = bounds.h - p.y;
  }
  const next = start.map((p) => ({ ...p }));
  for (const i of indexes) next[i] = { x: start[i].x + adx, y: start[i].y + ady };
  return convex(next) ? next : start;
}

function solve8(rows: number[][], rhs: number[]): number[] | null {
  const n = 8;
  const m = rows.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-8) return null;
    const tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    const div = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

/** Map the quadrilateral onto a straight page. */
function straighten(source: HTMLCanvasElement, quad: Point[], stage: { w: number; h: number }) {
  const srcPts = quad.map((p) => ({
    x: (p.x / stage.w) * source.width,
    y: (p.y / stage.h) * source.height,
  }));
  let dw = Math.round((edgeLen(srcPts[0], srcPts[1]) + edgeLen(srcPts[3], srcPts[2])) / 2);
  let dh = Math.round((edgeLen(srcPts[0], srcPts[3]) + edgeLen(srcPts[1], srcPts[2])) / 2);
  dw = Math.max(1, dw);
  dh = Math.max(1, dh);
  const cap = 2000;
  const fit = Math.min(1, cap / Math.max(dw, dh));
  dw = Math.max(1, Math.round(dw * fit));
  dh = Math.max(1, Math.round(dh * fit));
  const from = [
    [0, 0],
    [dw, 0],
    [dw, dh],
    [0, dh],
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const u = srcPts[i].x;
    const v = srcPts[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve8(A, b);
  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext('2d');
  const srcCtx = source.getContext('2d');
  if (!h || !ctx || !srcCtx) return out;
  const src = srcCtx.getImageData(0, 0, source.width, source.height);
  const dst = ctx.createImageData(dw, dh);
  const sw = source.width;
  const sh = source.height;
  const s = src.data;
  const d = dst.data;
  const pix = (x: number, y: number, c: number) =>
    s[(clamp(y, 0, sh - 1) * sw + clamp(x, 0, sw - 1)) * 4 + c];
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const den = h[6] * x + h[7] * y + 1;
      if (!Number.isFinite(den) || Math.abs(den) < 1e-6) continue;
      const u = (h[0] * x + h[1] * y + h[2]) / den;
      const v = (h[3] * x + h[4] * y + h[5]) / den;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      const i = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        d[i + c] =
          pix(x0, y0, c) * (1 - fx) * (1 - fy) +
          pix(x0 + 1, y0, c) * fx * (1 - fy) +
          pix(x0, y0 + 1, c) * (1 - fx) * fy +
          pix(x0 + 1, y0 + 1, c) * fx * fy;
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}

type Props = {
  open: boolean;
  source: HTMLCanvasElement | null;
  onApply: (framed: HTMLCanvasElement) => void;
  onClose: () => void;
};

export default function DotCropModal({ open, source, onApply, onClose }: Props) {
  const [bitmap, setBitmap] = useState<HTMLCanvasElement | null>(null);
  const [stage, setStage] = useState({ w: 320, h: 240 });
  const [pts, setPts] = useState<Point[]>(insetQuad({ w: 320, h: 240 }));
  const [imgUrl, setImgUrl] = useState('');
  const [loupe, setLoupe] = useState(false);
  const drag = useRef<Drag | null>(null);
  const stageRef = useRef(stage);
  const ptsRef = useRef(pts);
  const bitmapRef = useRef(bitmap);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  stageRef.current = stage;
  ptsRef.current = pts;
  bitmapRef.current = bitmap;

  const place = (bmp: HTMLCanvasElement, quad: 'inset' | 'full') => {
    const next = fitStage(bmp);
    setBitmap(bmp);
    setStage(next);
    setPts(quad === 'full' ? fullQuad(next) : insetQuad(next));
    setImgUrl(bmp.toDataURL('image/jpeg', 0.92));
  };

  useEffect(() => {
    if (!open || !source) return;
    place(cloneCanvas(source), 'inset');
    setLoupe(false);
    // source identity is the photo handed to this open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  const drawLoupe = (pt: Point) => {
    const canvas = loupeRef.current;
    const bmp = bitmapRef.current;
    const box = stageRef.current;
    if (!canvas || !bmp) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const zoom = 2.4;
    const sw = canvas.width / zoom;
    const sh = canvas.height / zoom;
    const sx = (pt.x / box.w) * bmp.width - sw / 2;
    const sy = (pt.y / box.h) * bmp.height - sh / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#2680eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, canvas.height * 0.32);
    ctx.lineTo(canvas.width / 2, canvas.height * 0.68);
    ctx.moveTo(canvas.width * 0.32, canvas.height / 2);
    ctx.lineTo(canvas.width * 0.68, canvas.height / 2);
    ctx.stroke();
    ctx.restore();
  };

  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const bounds = stageRef.current;
      let next = d.pts;
      if (d.kind === 'move') next = shiftSome(d.pts, [0, 1, 2, 3], dx, dy, bounds);
      else if (d.kind === 'edge') next = shiftSome(d.pts, [d.edge, (d.edge + 1) % 4], dx, dy, bounds);
      else {
        const origin = d.pts[d.index];
        const moved = d.pts.map((p) => ({ ...p }));
        moved[d.index] = {
          x: clamp(origin.x + dx, 0, bounds.w),
          y: clamp(origin.y + dy, 0, bounds.h),
        };
        next = convex(moved) ? moved : d.pts;
        setLoupe(true);
        drawLoupe(next[d.index]);
      }
      setPts(next);
    };
    const up = () => {
      drag.current = null;
      setLoupe(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open]);

  useEffect(() => {
    if (!loupe || drag.current?.kind !== 'corner') return;
    drawLoupe(ptsRef.current[drag.current.index]);
  }, [loupe, pts]);

  if (!open || !source || !bitmap) return null;

  const grab = () => ptsRef.current.map((p) => ({ ...p }));
  const beginCorner = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind: 'corner', index, x: e.clientX, y: e.clientY, pts: grab() };
    setLoupe(true);
  };
  const beginEdge = (edge: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind: 'edge', edge, x: e.clientX, y: e.clientY, pts: grab() };
  };
  const beginMove = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind: 'move', x: e.clientX, y: e.clientY, pts: grab() };
  };

  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const corner = drag.current?.kind === 'corner' ? pts[drag.current.index] : pts[2];
  const loupeLeft = clamp(corner.x - 64, 8, Math.max(8, stage.w - 136));
  const loupeTop = corner.y > stage.h * 0.45 ? corner.y - 156 : corner.y + 28;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3" data-image-crop="1">
      <div
        className="rounded-xl shadow-2xl border w-full max-w-5xl p-4 flex flex-col gap-3"
        style={{ background: '#111', borderColor: '#2a2a2a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-white">Crop the page</p>
          <p className="text-[11px] text-white/70">Drag each corner onto the page. The magnifier follows the corner.</p>
        </div>
        <div className="flex justify-center">
          <div className="relative" style={{ width: stage.w, height: stage.h }}>
            {imgUrl && (
              <img src={imgUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full select-none pointer-events-none" />
            )}
            <svg viewBox={`0 0 ${stage.w} ${stage.h}`} className="absolute inset-0 w-full h-full">
              <defs>
                <mask id="scan-crop-mask">
                  <rect width={stage.w} height={stage.h} fill="white" />
                  <polygon points={poly} fill="black" />
                </mask>
              </defs>
              <rect width={stage.w} height={stage.h} fill="rgba(0,0,0,0.55)" mask="url(#scan-crop-mask)" style={{ pointerEvents: 'none' }} />
              <polygon
                points={poly}
                fill="rgba(0,0,0,0.01)"
                stroke="none"
                onPointerDown={beginMove}
                style={{ cursor: 'move' }}
              />
              {pts.map((p, i) => {
                const q = pts[(i + 1) % 4];
                return (
                  <line
                    key={i}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke="transparent"
                    strokeWidth={22}
                    onPointerDown={beginEdge(i)}
                    style={{ cursor: 'move' }}
                  />
                );
              })}
              <polygon points={poly} fill="none" stroke="#fff" strokeWidth={2} style={{ pointerEvents: 'none' }} />
            </svg>
            {pts.map((p, i) => (
              <button
                key={HANDLES[i]}
                type="button"
                data-crop-handle={HANDLES[i]}
                aria-label={`${HANDLES[i]} corner`}
                onPointerDown={beginCorner(i)}
                className="absolute rounded-full"
                style={{
                  width: 22,
                  height: 22,
                  left: p.x,
                  top: p.y,
                  transform: 'translate(-50%, -50%)',
                  background: '#fff',
                  border: '3px solid #2680eb',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                  zIndex: 2,
                  cursor: 'grab',
                }}
              />
            ))}
            {loupe && (
              <canvas
                ref={loupeRef}
                data-crop-loupe="1"
                width={148}
                height={148}
                className="absolute rounded-full border-2 border-white shadow-lg pointer-events-none"
                style={{ width: 128, height: 128, left: loupeLeft, top: loupeTop, zIndex: 3 }}
              />
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary"
            data-crop-full="1"
            onClick={() => bitmap && place(bitmap, 'full')}
          >
            No crop
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-crop-rotate="1"
            onClick={() => bitmap && place(rotateCanvas(bitmap), 'inset')}
          >
            Rotate
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary flex-1"
            data-crop-apply="1"
            onClick={() => onApply(straighten(bitmap, pts, stage))}
          >
            Use this crop
          </button>
        </div>
      </div>
    </div>
  );
}
