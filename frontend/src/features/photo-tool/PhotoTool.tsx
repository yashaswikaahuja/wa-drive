/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 2b: 5 built-in templates loaded from templates.ts.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { TEMPLATES, TPL_FREE } from './templates';
import type { Slot, Template } from './templates';
import { printBlob } from '../../shared/fileCache';
import api from '../../shared/api';
import DrivePicker from './DrivePicker';
import CropModal from './CropModal';

const DISPLAY_MAX = 720;

function displaySize(paperW: number, paperH: number) {
  const ratio = paperW / paperH;
  if (ratio >= 1) {
    // landscape or square — fit width
    return { w: DISPLAY_MAX, h: Math.round(DISPLAY_MAX / ratio) };
  }
  // portrait — fit height
  return { w: Math.round(DISPLAY_MAX * ratio), h: DISPLAY_MAX };
}

export default function PhotoTool() {
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('free-a4p');
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [drivePickerOpen, setDrivePickerOpen] = useState<boolean>(false);
  const [cropModalOpen, setCropModalOpen] = useState<boolean>(false);
  // Per-slot transforms: zoom + pan offset within each slot.
  // Keyed by slot index in the active template.
  const [transforms, setTransforms] = useState<Record<number, { zoom: number; offsetX: number; offsetY: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  const template = TEMPLATES.find(t => t.id === templateId) || TPL_FREE;

  // Reset transforms when template changes (slot indices may differ)
  useEffect(() => {
    setTransforms({});
    setSelectedSlot(null);
  }, [templateId]);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setImageBitmap(prev => { if (prev) prev.close(); return bitmap; });
      setFileName(file.name);
      setRotation(0);
      setTransforms({});
      setSelectedSlot(null);
    } catch (e: any) {
      setError('Could not read image: ' + (e.message || 'unknown'));
    }
  }, []);

  // Load the most recently received Drive file — operator's most common need:
  // "customer just sent it on WhatsApp, give me that one."
  const loadLatest = useCallback(async () => {
    setError('');
    try {
      const res = await api.get('/drive/files/ws');
      const files = Array.isArray(res.data) ? res.data : [];
      if (files.length === 0) { setError('No files in Drive yet'); return; }
      const latest = files[0]; // backend returns newest first
      const dl = await api.get(`/drive/download/${latest.id}`, { responseType: 'blob' });
      const blob = new Blob([dl.data], { type: dl.headers['content-type'] || 'image/jpeg' });
      const file = new File([blob], latest.fileName || 'latest', { type: blob.type });
      await handleFile(file);
    } catch (e: any) {
      setError('Could not load latest: ' + (e.response?.data?.error || e.message || 'unknown'));
    }
  }, [handleFile]);

  const handlePrint = useCallback(() => {
    const canvas = document.getElementById('cc-photo-canvas') as HTMLCanvasElement | null;
    if (!canvas) { setError('Canvas not ready'); return; }
    const dataUrl = canvas.toDataURL('image/png');
    // @page size matches the active template's paper (A4 portrait/landscape, 4x6, etc).
    // Express paper size in mm so any printer respects it.
    const paperWmm = (template.paper.w / 300) * 25.4;
    const paperHmm = (template.paper.h / 300) * 25.4;
    const orientation = template.paper.w >= template.paper.h ? 'landscape' : 'portrait';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
@page { size: ${paperWmm}mm ${paperHmm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
img { display: block; width: ${paperWmm}mm; height: ${paperHmm}mm; }
</style></head><body><img src="${dataUrl}"/></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    printBlob(blob);
    void orientation;
  }, [template]);

  useEffect(() => {
    return () => { if (imageBitmap) imageBitmap.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clipboard paste — operator hits Ctrl+V anywhere on page.
  // Captures image from clipboard (screenshot, copy-from-website, etc.).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleFile]);

  // URL params: ?fileId=X&template=Y — preload from a Drive file
  // (used by WhatsApp deep-link, future external integrations).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tplParam = params.get('template');
    if (tplParam && TEMPLATES.some(t => t.id === tplParam)) {
      setTemplateId(tplParam);
    }
    const fileId = params.get('fileId');
    if (fileId) {
      api.get(`/drive/download/${fileId}`, { responseType: 'blob' })
        .then(res => {
          const blob = new Blob([res.data], { type: res.headers['content-type'] || 'image/jpeg' });
          const file = new File([blob], 'drive-file', { type: blob.type });
          handleFile(file);
        })
        .catch(e => setError('Could not load Drive file: ' + (e.message || 'unknown')));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts — operators expect speed.
  // Ctrl+P print · R rotate · B B&W · 1-9 pick template by index · Esc close picker
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (imageBitmap) handlePrint();
        return;
      }
      if (e.key === 'Escape') {
        if (drivePickerOpen) setDrivePickerOpen(false);
        if (cropModalOpen) setCropModalOpen(false);
        if (selectedSlot !== null) setSelectedSlot(null);
        return;
      }
      if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        if (imageBitmap) setCropModalOpen(true);
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        if (imageBitmap) setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270);
        return;
      }
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        setGrayscale(g => !g);
        return;
      }
      if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        loadLatest();
        return;
      }
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < TEMPLATES.length) setTemplateId(TEMPLATES[idx].id);
        return;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageBitmap, drivePickerOpen, cropModalOpen, selectedSlot]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-950 text-gray-300">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <span className="text-lg">🖨</span>
          <h1 className="text-sm font-semibold text-gray-200">Photo Tool</h1>
          <span className="text-xs text-gray-500 truncate max-w-md">
            {fileName || '— print Aadhaar, passport photos, documents'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCropModalOpen(true)}
            disabled={!imageBitmap}
            className={`px-3 py-1.5 rounded text-xs ${
              imageBitmap ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
            title="Crop image (C)"
          >
            ✂ Crop
          </button>
          <button
            onClick={() => setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
            disabled={!imageBitmap}
            className={`px-3 py-1.5 rounded text-xs ${
              imageBitmap ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
            title="Rotate 90° clockwise"
          >
            ↻ Rotate
          </button>
          <button
            onClick={() => setGrayscale(g => !g)}
            className={`px-3 py-1.5 rounded text-xs ${
              grayscale ? 'bg-gray-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
            }`}
            title="Toggle grayscale (saves toner on B&W printers)"
          >
            B&W
          </button>
          <button
            onClick={loadLatest}
            className="px-3 py-1.5 rounded text-xs bg-yellow-600 hover:bg-yellow-500 text-white"
            title="Load latest Drive file (L)"
          >
            📥 Latest
          </button>
          <button
            onClick={() => setDrivePickerOpen(true)}
            className="px-3 py-1.5 rounded text-xs bg-gray-800 hover:bg-gray-700 text-gray-200"
            title="Pick a customer file from Drive"
          >
            📁 Drive
          </button>
          <FilePicker onFile={handleFile} />
          <button
            onClick={handlePrint}
            disabled={!imageBitmap}
            className={`px-3 py-1.5 rounded text-xs ${
              imageBitmap
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            🖨 Print
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-52 border-r border-gray-800 bg-gray-900 overflow-y-auto p-2 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">Templates</div>
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                templateId === t.id
                  ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-600/40'
                  : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{t.description}</div>
            </button>
          ))}
        </aside>

        <main className="flex-1 flex items-center justify-center overflow-auto p-8">
          <A4Canvas
            image={imageBitmap}
            template={template}
            grayscale={grayscale}
            rotation={rotation}
            transforms={transforms}
            selectedSlot={selectedSlot}
            onSelectSlot={setSelectedSlot}
            onTransformSlot={(idx, fn) => setTransforms(t => {
              const cur = t[idx] || { zoom: 1, offsetX: 0, offsetY: 0 };
              return { ...t, [idx]: fn(cur) };
            })}
            onDrop={handleFile}
          />
        </main>
      </div>

      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>{template.name} · {template.paper.name} · {template.slots.length} slot{template.slots.length === 1 ? '' : 's'}</span>
        <span className={error ? 'text-red-400' : 'italic'}>
          {error || (selectedSlot !== null
            ? 'Slot ' + (selectedSlot + 1) + ' selected — drag to pan · scroll to zoom · Esc to deselect'
            : 'L latest · C crop · R rotate · B B&W · click slot to adjust · Ctrl+P print · 1-9 templates')}
        </span>
      </footer>

      <DrivePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        onPick={handleFile}
      />

      <CropModal
        open={cropModalOpen}
        source={imageBitmap}
        onClose={() => setCropModalOpen(false)}
        onCrop={(cropped) => {
          setImageBitmap(prev => { if (prev) prev.close(); return cropped; });
          setRotation(0);
        }}
      />
    </div>
  );
}

function FilePicker({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="px-3 py-1.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white"
      >
        Choose Image
      </button>
    </>
  );
}

type SlotXf = { zoom: number; offsetX: number; offsetY: number };
type XfMap = Record<number, SlotXf>;

function A4Canvas({ image, template, grayscale, rotation, transforms, selectedSlot, onSelectSlot, onTransformSlot, onDrop }: {
  image: ImageBitmap | null;
  template: Template;
  grayscale: boolean;
  rotation: 0 | 90 | 180 | 270;
  transforms: XfMap;
  selectedSlot: number | null;
  onSelectSlot: (idx: number | null) => void;
  onTransformSlot: (idx: number, fn: (cur: SlotXf) => SlotXf) => void;
  onDrop: (f: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragRef = useRef<{ slotIdx: number; startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const paperW = template.paper.w;
  const paperH = template.paper.h;
  const disp = displaySize(paperW, paperH);
  const scale = paperW / disp.w; // display→canvas scale

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = paperW;
    canvas.height = paperH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, paperW, paperH);
    if (image) {
      let rendered = image;
      let temp: ImageBitmap | null = null;
      if (rotation !== 0) {
        const swapped = rotation === 90 || rotation === 270;
        const w = swapped ? image.height : image.width;
        const h = swapped ? image.width : image.height;
        const oc = new OffscreenCanvas(w, h);
        const octx = oc.getContext('2d')!;
        octx.translate(w / 2, h / 2);
        octx.rotate((rotation * Math.PI) / 180);
        octx.drawImage(image, -image.width / 2, -image.height / 2);
        temp = oc.transferToImageBitmap();
        rendered = temp;
      }
      ctx.filter = grayscale ? 'grayscale(1) contrast(1.1)' : 'none';
      for (let i = 0; i < template.slots.length; i++) {
        const slot = template.slots[i];
        const xf = transforms[i] || { zoom: 1, offsetX: 0, offsetY: 0 };
        drawIntoSlot(ctx, rendered, slot, xf);
      }
      ctx.filter = 'none';
      if (temp) temp.close();
    } else {
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 10]);
      for (const slot of template.slots) {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
      ctx.setLineDash([]);
    }
    // Selection border on top
    if (selectedSlot !== null && template.slots[selectedSlot]) {
      const s = template.slots[selectedSlot];
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 8;
      ctx.setLineDash([]);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
  }, [image, template, grayscale, rotation, transforms, selectedSlot, paperW, paperH]);

  // Translate display coords to canvas (paper) coords
  const eventToCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  };
  const slotAt = (x: number, y: number) => {
    for (let i = template.slots.length - 1; i >= 0; i--) {
      const s = template.slots[i];
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return i;
    }
    return null;
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (!image) return;
    const { x, y } = eventToCanvas(e);
    const idx = slotAt(x, y);
    onSelectSlot(idx);
    if (idx !== null) {
      const cur = transforms[idx] || { zoom: 1, offsetX: 0, offsetY: 0 };
      dragRef.current = { slotIdx: idx, startX: e.clientX, startY: e.clientY, startOffset: { x: cur.offsetX, y: cur.offsetY } };
    }
  };
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startX) * scale;
    const dy = (e.clientY - dragRef.current.startY) * scale;
    const idx = dragRef.current.slotIdx;
    onTransformSlot(idx, () => ({
      zoom: (transforms[idx]?.zoom ?? 1),
      offsetX: dragRef.current!.startOffset.x + dx,
      offsetY: dragRef.current!.startOffset.y + dy,
    }));
  };
  const onCanvasMouseUp = () => { dragRef.current = null; };
  const onCanvasWheel = (e: React.WheelEvent) => {
    if (selectedSlot === null) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    onTransformSlot(selectedSlot, cur => ({
      ...cur,
      zoom: Math.max(0.2, Math.min(8, cur.zoom * factor)),
    }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  };

  return (
    <div
      className={`relative shadow-2xl rounded-sm transition-shadow ${dragOver ? 'ring-2 ring-blue-500' : ''}`}
      style={{ width: disp.w, height: disp.h }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        id="cc-photo-canvas"
        style={{ width: disp.w, height: disp.h, display: 'block', cursor: image ? (selectedSlot !== null ? 'move' : 'pointer') : 'default' }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onWheel={onCanvasWheel}
      />
      {!image && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none select-none text-center px-4">
          Drop an image · paste with Ctrl+V · or click "Choose Image"
        </div>
      )}
    </div>
  );
}

// Fit + draw image into a slot, preserving aspect ratio.
// Optional transform: zoom + offset (operator pan/zoom within the slot).
function drawIntoSlot(ctx: CanvasRenderingContext2D, img: ImageBitmap, slot: Slot, xf: SlotXf = { zoom: 1, offsetX: 0, offsetY: 0 }) {
  const slotRatio = slot.w / slot.h;
  const imgRatio = img.width / img.height;
  let drawW: number, drawH: number;
  if (slot.fit === 'contain') {
    if (imgRatio > slotRatio) {
      drawW = slot.w;
      drawH = slot.w / imgRatio;
    } else {
      drawH = slot.h;
      drawW = slot.h * imgRatio;
    }
  } else { // cover
    if (imgRatio > slotRatio) {
      drawH = slot.h;
      drawW = slot.h * imgRatio;
    } else {
      drawW = slot.w;
      drawH = slot.w / imgRatio;
    }
  }
  drawW *= xf.zoom;
  drawH *= xf.zoom;
  const dx = slot.x + (slot.w - drawW) / 2 + xf.offsetX;
  const dy = slot.y + (slot.h - drawH) / 2 + xf.offsetY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.w, slot.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}
