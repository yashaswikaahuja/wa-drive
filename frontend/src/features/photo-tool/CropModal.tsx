/**
 * Crop modal — operator drags/resizes a rectangle on the source image,
 * clicks Apply, gets back a cropped ImageBitmap.
 *
 * SERVER NEVER SEES PIXELS — see /ARCHITECTURE.md §3.1.
 * All cropping happens in-browser via OffscreenCanvas.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  source: ImageBitmap | null;
  onCrop: (cropped: ImageBitmap) => void;
  onClose: () => void;
}

type DragKind = 'move' | 'tl' | 'tr' | 'bl' | 'br' | null;

const HANDLE_SIZE = 14;

export default function CropModal({ open, source, onCrop, onClose }: Props) {
  // Crop rectangle in DISPLAY coordinates (px on screen)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ kind: DragKind; startX: number; startY: number; startCrop: typeof crop } | null>(null);
  const imgUrlRef = useRef<string>('');

  // Compute display size to fit within modal (max 80vw × 70vh)
  useEffect(() => {
    if (!open || !source) return;
    const maxW = Math.min(window.innerWidth * 0.8, 1000);
    const maxH = window.innerHeight * 0.7;
    const ratio = source.width / source.height;
    let dw = maxW;
    let dh = dw / ratio;
    if (dh > maxH) { dh = maxH; dw = dh * ratio; }
    dw = Math.round(dw); dh = Math.round(dh);
    setDisplaySize({ w: dw, h: dh });
    // Default crop = 80% center
    setCrop({ x: Math.round(dw * 0.1), y: Math.round(dh * 0.1), w: Math.round(dw * 0.8), h: Math.round(dh * 0.8) });

    // Render source bitmap to a blob URL for <img> display
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

  const [imgUrl, setImgUrl] = useState<string>('');

  // Cleanup blob URL on unmount/close
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
    setDrag({ kind, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    let { x, y, w, h } = drag.startCrop;
    if (drag.kind === 'move') {
      x = Math.max(0, Math.min(displaySize.w - w, x + dx));
      y = Math.max(0, Math.min(displaySize.h - h, y + dy));
    } else if (drag.kind === 'tl') {
      const nx = Math.max(0, x + dx); const ny = Math.max(0, y + dy);
      w = w + (x - nx); h = h + (y - ny); x = nx; y = ny;
    } else if (drag.kind === 'tr') {
      const ny = Math.max(0, y + dy);
      w = Math.min(displaySize.w - x, w + dx); h = h + (y - ny); y = ny;
    } else if (drag.kind === 'bl') {
      const nx = Math.max(0, x + dx);
      w = w + (x - nx); h = Math.min(displaySize.h - y, h + dy); x = nx;
    } else if (drag.kind === 'br') {
      w = Math.min(displaySize.w - x, w + dx);
      h = Math.min(displaySize.h - y, h + dy);
    }
    if (w < 20 || h < 20) return; // min size
    setCrop({ x, y, w, h });
  };

  const endDrag = () => setDrag(null);

  const apply = async () => {
    if (!source) return;
    const scale = source.width / displaySize.w;
    const sx = Math.round(crop.x * scale);
    const sy = Math.round(crop.y * scale);
    const sw = Math.round(crop.w * scale);
    const sh = Math.round(crop.h * scale);
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
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div className="bg-gray-900 rounded-lg shadow-2xl border border-gray-800 p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">✂ Crop image — drag corners to resize, drag inside to move</h2>
          <button onClick={onClose} className="px-2 py-1 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-300">Close</button>
        </header>

        <div
          className="relative overflow-hidden bg-checker"
          style={{ width: displaySize.w, height: displaySize.h, userSelect: 'none' }}
        >
          {imgUrl && (
            <img src={imgUrl} alt="crop source" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
          )}
          {/* Dim overlay outside crop */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `linear-gradient(transparent, transparent), linear-gradient(transparent, transparent)`,
            boxShadow: `0 0 0 9999px rgba(0,0,0,0.55) inset`,
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x}px ${crop.y}px, ${crop.x}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y + crop.h}px, ${crop.x + crop.w}px ${crop.y}px, ${crop.x}px ${crop.y}px)`,
          }}/>
          {/* Crop rect */}
          <div
            onMouseDown={e => startDrag('move', e)}
            className="absolute border-2 border-blue-500"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, cursor: 'move' }}
          >
            <div onMouseDown={e => startDrag('tl', e)} style={handleStyle(0, 0, 'nw-resize')} />
            <div onMouseDown={e => startDrag('tr', e)} style={handleStyle(0, '100%', 'ne-resize')} />
            <div onMouseDown={e => startDrag('bl', e)} style={handleStyle('100%', 0, 'sw-resize')} />
            <div onMouseDown={e => startDrag('br', e)} style={handleStyle('100%', '100%', 'se-resize')} />
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">
            Crop: {Math.round(crop.w * (source.width / displaySize.w))} × {Math.round(crop.h * (source.height / displaySize.h))} px
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
