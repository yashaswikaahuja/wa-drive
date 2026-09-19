/**
 * Aspect-locked crop with pan + zoom — medicine for wrong face framing.
 * Touch + mouse. Returns a canvas at the target pixel size (cover from crop).
 */
import { useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  source: HTMLCanvasElement | null;
  /** Target aspect width/height, e.g. 35/45 or 100/120 */
  aspect: number;
  targetW: number;
  targetH: number;
  onApply: (framed: HTMLCanvasElement) => void;
  onClose: () => void;
};

export default function AspectCropModal({
  open, source, aspect, targetW, targetH, onApply, onClose,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(400);
  const [vh, setVh] = useState(500);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgUrl, setImgUrl] = useState('');
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Fit crop window to viewport keeping aspect
  useEffect(() => {
    if (!open) return;
    const maxW = Math.min(window.innerWidth * 0.9, 420);
    const maxH = window.innerHeight * 0.55;
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }
    setVw(Math.round(w));
    setVh(Math.round(h));
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [open, aspect]);

  useEffect(() => {
    if (!open || !source) return;
    const url = source.toDataURL('image/jpeg', 0.92);
    setImgUrl(url);
    return () => setImgUrl('');
  }, [open, source]);

  if (!open || !source) return null;

  // Image display size at zoom=1: cover the crop window
  const srcAspect = source.width / source.height;
  let baseW: number, baseH: number;
  if (srcAspect > aspect) {
    baseH = vh;
    baseW = baseH * srcAspect;
  } else {
    baseW = vw;
    baseH = baseW / srcAspect;
  }
  const dispW = baseW * zoom;
  const dispH = baseH * zoom;
  // Center + pan
  const left = (vw - dispW) / 2 + pan.x;
  const top = (vh - dispH) / 2 + pan.y;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + (e.clientX - drag.current.x),
      y: drag.current.panY + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(1, z * (e.deltaY > 0 ? 0.92 : 1.08))));
  };

  const apply = () => {
    // Map crop window back to source pixels
    const scaleX = source.width / dispW;
    const scaleY = source.height / dispH;
    const sx = Math.max(0, -left * scaleX);
    const sy = Math.max(0, -top * scaleY);
    const sw = Math.min(source.width - sx, vw * scaleX);
    const sh = Math.min(source.height - sy, vh * scaleY);
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);
    onApply(out);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="card w-full max-w-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Frame the face</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Drag to pan · pinch/wheel to zoom · keep head & shoulders in the box
            </p>
          </div>
          <button type="button" className="text-xs text-[var(--muted-foreground)]" onClick={onClose}>✕</button>
        </div>

        <div
          ref={viewportRef}
          className="relative mx-auto overflow-hidden rounded-lg touch-none bg-black cursor-grab active:cursor-grabbing"
          style={{ width: vw, height: vh, boxShadow: '0 0 0 2px hsl(27 95% 55%)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none pointer-events-none"
              style={{ width: dispW, height: dispH, left, top }}
            />
          )}
          {/* Guide: eyes roughly upper third */}
          <div className="absolute left-0 right-0 border-t border-dashed border-white/30 pointer-events-none" style={{ top: '35%' }} />
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs px-3" onClick={() => setZoom((z) => Math.max(1, z * 0.9))}>−</button>
          <input
            type="range" min={1} max={4} step={0.05} value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            className="flex-1"
          />
          <button type="button" className="btn-secondary text-xs px-3" onClick={() => setZoom((z) => Math.min(4, z * 1.1))}>+</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary flex-1" onClick={apply}>Apply frame</button>
        </div>
      </div>
    </div>
  );
}
