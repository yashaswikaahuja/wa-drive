/**
 * Crop modal with zoom + pan.
 *
 *   - Mouse wheel: zoom image (centered on cursor)
 *   - Drag inside crop rect: move crop rect
 *   - Drag corners: resize crop rect
 *   - Drag outside crop rect (or hold Space + drag): pan the image
 *   - +/- buttons: zoom step
 *   - Reset: restore default fit + center
 *   - Apply: cut the image region under the crop rect, return new ImageBitmap
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  source: ImageBitmap | null;
  onCrop: (cropped: ImageBitmap) => void;
  onClose: () => void;
}

type DragKind = 'move' | 'tl' | 'tr' | 'bl' | 'br' | 'pan' | null;
const HANDLE_SIZE = 14;

export default function CropModal({ open, source, onCrop, onClose }: Props) {
  // Container display size (fixed)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  // Base display size of the image (fit to container at zoom=1)
  const [baseSize, setBaseSize] = useState({ w: 0, h: 0 });
  // Image transform within container
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Crop rectangle in container coordinates
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [drag, setDrag] = useState<{ kind: DragKind; startX: number; startY: number; startCrop: typeof crop; startOffset: typeof offset } | null>(null);
  const imgUrlRef = useRef<string>('');
  const [imgUrl, setImgUrl] = useState<string>('');

  useEffect(() => {
    if (!open || !source) return;
    const maxW = Math.min(window.innerWidth * 0.8, 900);
    const maxH = window.innerHeight * 0.65;
    const ratio = source.width / source.height;
    let dw = maxW;
    let dh = dw / ratio;
    if (dh > maxH) { dh = maxH; dw = dh * ratio; }
    dw = Math.round(dw); dh = Math.round(dh);
    setContainerSize({ w: dw, h: dh });
    setBaseSize({ w: dw, h: dh });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setCrop({ x: Math.round(dw * 0.1), y: Math.round(dh * 0.1), w: Math.round(dw * 0.8), h: Math.round(dh * 0.8) });

    const oc = document.createElement('canvas');
    oc.width = source.width;
    oc.height = source.height;
    oc.getContext('2d')!.drawImage(source, 0, 0);
    oc.toBlob(b => {
      if (b) {
        if (imgUrlRef.current) URL.revokeObjectURL(imgUrlRef.current);
        imgUrlRef.current = URL.createObjectURL(b);
        setImgUrl(imgUrlRef.current);
      }
    }, 'image/png');
  }, [open, source]);

  useEffect(() => {
    if (!open && imgUrlRef.current) {
      URL.revokeObjectURL(imgUrlRef.current);
      imgUrlRef.current = '';
      setImgUrl('');
    }
  }, [open]);

  if (!open || !source) return null;

  const startDrag = (kind: DragKind, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ kind, startX: e.clientX, startY: e.clientY, startCrop: { ...crop }, startOffset: { ...offset } });
  };

  const onContainerMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).dataset.handle || (e.target as HTMLElement).dataset.croprect) return;
    // Outside the crop rect → pan the image
    startDrag('pan', e);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.kind === 'pan') {
      setOffset({ x: drag.startOffset.x + dx, y: drag.startOffset.y + dy });
      return;
    }
    let { x, y, w, h } = drag.startCrop;
    if (drag.kind === 'move') {
      x = Math.max(0, Math.min(containerSize.w - w, x + dx));
      y = Math.max(0, Math.min(containerSize.h - h, y + dy));
    } else if (drag.kind === 'tl') {
      const nx = Math.max(0, x + dx); const ny = Math.max(0, y + dy);
      w = w + (x - nx); h = h + (y - ny); x = nx; y = ny;
    } else if (drag.kind === 'tr') {
      const ny = Math.max(0, y + dy);
      w = Math.min(containerSize.w - x, w + dx); h = h + (y - ny); y = ny;
    } else if (drag.kind === 'bl') {
      const nx = Math.max(0, x + dx);
      w = w + (x - nx); h = Math.min(containerSize.h - y, h + dy); x = nx;
    } else if (drag.kind === 'br') {
      w = Math.min(containerSize.w - x, w + dx);
      h = Math.min(containerSize.h - y, h + dy);
    }
    if (w < 20 || h < 20) return;
    setCrop({ x, y, w, h });
  };

  const endDrag = () => setDrag(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.2, Math.min(8, zoom * factor));
    // Zoom around cursor: keep image point under cursor stable
    const newOffsetX = px - (px - offset.x) * (newZoom / zoom);
    const newOffsetY = py - (py - offset.y) * (newZoom / zoom);
    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const zoomStep = (factor: number) => {
    const cx = containerSize.w / 2;
    const cy = containerSize.h / 2;
    const newZoom = Math.max(0.2, Math.min(8, zoom * factor));
    const newOffsetX = cx - (cx - offset.x) * (newZoom / zoom);
    const newOffsetY = cy - (cy - offset.y) * (newZoom / zoom);
    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setCrop({ x: Math.round(containerSize.w * 0.1), y: Math.round(containerSize.h * 0.1), w: Math.round(containerSize.w * 0.8), h: Math.round(containerSize.h * 0.8) });
  };

  const apply = async () => {
    if (!source) return;
    // Container point (cx, cy) → image-displayed point: ((cx - offset.x) / zoom, (cy - offset.y) / zoom)
    // image-displayed → source: multiply by source.w / baseSize.w
    const scaleX = source.width / baseSize.w;
    const scaleY = source.height / baseSize.h;
    const sx = Math.max(0, Math.round((crop.x - offset.x) / zoom * scaleX));
    const sy = Math.max(0, Math.round((crop.y - offset.y) / zoom * scaleY));
    const sw = Math.min(source.width - sx, Math.round(crop.w / zoom * scaleX));
    const sh = Math.min(source.height - sy, Math.round(crop.h / zoom * scaleY));
    if (sw <= 0 || sh <= 0) { onClose(); return; }
    const oc = new OffscreenCanvas(sw, sh);
    const ctx = oc.getContext('2d')!;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    const cropped = oc.transferToImageBitmap();
    onCrop(cropped);
    onClose();
  };

  const handleStyle = (top: string | number, left: string | number, cursor: string): React.CSSProperties => ({
    position: 'absolute',
    width: HANDLE_SIZE, height: HANDLE_SIZE,
    background: '#3b82f6',
    border: '2px solid white',
    borderRadius: 2,
    top, left, cursor,
    transform: 'translate(-50%, -50%)',
    zIndex: 3,
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-800 p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-200">✂ Crop image</h2>
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => zoomStep(1 / 1.25)} className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-200">−</button>
            <span className="px-2 text-gray-400 min-w-[3rem] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomStep(1.25)} className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-200">+</button>
            <button onClick={reset} className="ml-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Reset</button>
            <button onClick={onClose} className="ml-2 px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300">Close</button>
          </div>
        </header>

        <div className="text-[10px] text-gray-500">
          Wheel = zoom · drag outside rect = pan image · drag inside rect = move crop · drag corners = resize
        </div>

        <div
          className="relative overflow-hidden bg-gray-950"
          style={{ width: containerSize.w, height: containerSize.h, userSelect: 'none', cursor: drag?.kind === 'pan' ? 'grabbing' : 'grab' }}
          onMouseDown={onContainerMouseDown}
          onWheel={onWheel}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt="crop source"
              draggable={false}
              style={{
                position: 'absolute',
                width: baseSize.w,
                height: baseSize.h,
                transformOrigin: '0 0',
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Dim mask outside crop */}
          <div className="absolute inset-0 pointer-events-none" style={{
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55) inset',
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x}px ${crop.y}px, ${crop.x}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y}px, ${crop.x}px ${crop.y}px)`,
          }} />
          {/* Crop rect */}
          <div
            data-croprect="1"
            onMouseDown={e => startDrag('move', e)}
            className="absolute border-2 border-blue-500"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, cursor: 'move', zIndex: 2 }}
          >
            <div data-handle="1" onMouseDown={e => startDrag('tl', e)} style={handleStyle(0, 0, 'nw-resize')} />
            <div data-handle="1" onMouseDown={e => startDrag('tr', e)} style={handleStyle(0, '100%', 'ne-resize')} />
            <div data-handle="1" onMouseDown={e => startDrag('bl', e)} style={handleStyle('100%', 0, 'sw-resize')} />
            <div data-handle="1" onMouseDown={e => startDrag('br', e)} style={handleStyle('100%', '100%', 'se-resize')} />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">
            Output: {Math.max(0, Math.round(crop.w / zoom * (source.width / baseSize.w)))} × {Math.max(0, Math.round(crop.h / zoom * (source.height / baseSize.h)))} px
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-300">Cancel</button>
            <button onClick={apply} className="px-3 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white">Apply Crop</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
