/**
 * Crop box on the photo. Six dots: four corners, plus the middle of the left and right edges.
 * Drag a dot to trim. Drag inside the box to move it.
 */
import { useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number };
type Kind = 'move' | 'tl' | 'tr' | 'ml' | 'mr' | 'bl' | 'br';

const HANDLES: { id: Exclude<Kind, 'move'>; x: number; y: number; cursor: string }[] = [
  { id: 'tl', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'tr', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'ml', x: 0, y: 0.5, cursor: 'ew-resize' },
  { id: 'mr', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'bl', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'br', x: 1, y: 1, cursor: 'nwse-resize' },
];

const MIN = 28;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function resize(kind: Kind, start: Rect, dx: number, dy: number, bounds: { w: number; h: number }): Rect {
  let { x, y, w, h } = start;
  if (kind === 'move') {
    return {
      x: clamp(x + dx, 0, bounds.w - w),
      y: clamp(y + dy, 0, bounds.h - h),
      w,
      h,
    };
  }
  if (kind === 'tl' || kind === 'ml' || kind === 'bl') {
    const nx = clamp(x + dx, 0, x + w - MIN);
    w = w + (x - nx);
    x = nx;
  }
  if (kind === 'tr' || kind === 'mr' || kind === 'br') {
    w = clamp(w + dx, MIN, bounds.w - x);
  }
  if (kind === 'tl' || kind === 'tr') {
    const ny = clamp(y + dy, 0, y + h - MIN);
    h = h + (y - ny);
    y = ny;
  }
  if (kind === 'bl' || kind === 'br') {
    h = clamp(h + dy, MIN, bounds.h - y);
  }
  return { x, y, w, h };
}

type Props = {
  open: boolean;
  source: HTMLCanvasElement | null;
  onApply: (framed: HTMLCanvasElement) => void;
  onClose: () => void;
};

export default function DotCropModal({ open, source, onApply, onClose }: Props) {
  const [stage, setStage] = useState({ w: 320, h: 240 });
  const [crop, setCrop] = useState<Rect>({ x: 16, y: 16, w: 288, h: 208 });
  const [imgUrl, setImgUrl] = useState('');
  const drag = useRef<{ kind: Kind; x: number; y: number; crop: Rect } | null>(null);
  const stageRef = useRef(stage);
  const cropRef = useRef(crop);
  stageRef.current = stage;
  cropRef.current = crop;

  useEffect(() => {
    if (!open || !source) return;
    const maxW = Math.min(window.innerWidth - 64, 880);
    const maxH = Math.min(window.innerHeight * 0.66, 560);
    const ratio = source.width / Math.max(1, source.height);
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    w = Math.max(160, Math.round(w));
    h = Math.max(120, Math.round(h));
    const inset = Math.round(Math.min(w, h) * 0.12);
    setStage({ w, h });
    setCrop({ x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 });
    setImgUrl(source.toDataURL('image/jpeg', 0.92));
  }, [open, source]);

  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setCrop(resize(d.kind, d.crop, e.clientX - d.x, e.clientY - d.y, stageRef.current));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open]);

  if (!open || !source) return null;

  const start = (kind: Kind) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { kind, x: e.clientX, y: e.clientY, crop: { ...cropRef.current } };
  };

  const apply = () => {
    const scaleX = source.width / stage.w;
    const scaleY = source.height / stage.h;
    const sx = clamp(Math.round(crop.x * scaleX), 0, source.width - 1);
    const sy = clamp(Math.round(crop.y * scaleY), 0, source.height - 1);
    const sw = clamp(Math.round(crop.w * scaleX), 1, source.width - sx);
    const sh = clamp(Math.round(crop.h * scaleY), 1, source.height - sy);
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    onApply(out);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3" data-image-crop="1">
      <div
        className="rounded-xl shadow-2xl border w-full max-w-5xl p-4 flex flex-col gap-3"
        style={{ background: 'hsl(var(--pt-card, 40 33% 98%))', borderColor: 'hsl(var(--pt-border, 30 12% 82%))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pt-ink, 20 14% 12%))' }}>Crop the photo</p>
          <p className="text-[11px] pt-muted">Drag a dot to trim. Drag inside the box to move it.</p>
        </div>
        <div className="flex justify-center">
          <div
            className="relative touch-none"
            style={{ width: stage.w, height: stage.h }}
          >
            {imgUrl && (
              <img src={imgUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full select-none pointer-events-none" />
            )}
            <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{ height: crop.y, background: 'rgba(0,0,0,0.55)' }} />
            <div className="absolute left-0 right-0 bottom-0 pointer-events-none" style={{ height: Math.max(0, stage.h - crop.y - crop.h), background: 'rgba(0,0,0,0.55)' }} />
            <div className="absolute pointer-events-none" style={{ top: crop.y, height: crop.h, left: 0, width: crop.x, background: 'rgba(0,0,0,0.55)' }} />
            <div className="absolute pointer-events-none" style={{ top: crop.y, height: crop.h, left: crop.x + crop.w, right: 0, background: 'rgba(0,0,0,0.55)' }} />
            <div
              data-crop-box="1"
              onPointerDown={start('move')}
              className="absolute border-2 border-white cursor-move"
              style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
            >
              <div className="absolute pointer-events-none border-white/50" style={{ left: '33.33%', top: 0, bottom: 0, borderLeftWidth: 1 }} />
              <div className="absolute pointer-events-none border-white/50" style={{ left: '66.66%', top: 0, bottom: 0, borderLeftWidth: 1 }} />
              <div className="absolute pointer-events-none border-white/50" style={{ top: '33.33%', left: 0, right: 0, borderTopWidth: 1 }} />
              <div className="absolute pointer-events-none border-white/50" style={{ top: '66.66%', left: 0, right: 0, borderTopWidth: 1 }} />
              {HANDLES.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  data-crop-handle={h.id}
                  aria-label={`Crop ${h.id}`}
                  onPointerDown={start(h.id)}
                  className="absolute rounded-full border-2 border-white shadow"
                  style={{
                    width: 16,
                    height: 16,
                    left: `${h.x * 100}%`,
                    top: `${h.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: h.cursor,
                    background: 'hsl(27 95% 55%)',
                    zIndex: 2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary flex-1" onClick={apply} data-crop-apply="1">Use this crop</button>
        </div>
      </div>
    </div>
  );
}
