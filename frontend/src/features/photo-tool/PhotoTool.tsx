/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 2b: 5 built-in templates loaded from templates.ts.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { TEMPLATES, TPL_FREE, A4_W_PX, A4_H_PX } from './templates';
import type { Slot, Template } from './templates';
import { printBlob } from '../../shared/fileCache';

const DISPLAY_W = 480;
const DISPLAY_H = Math.round(DISPLAY_W * (A4_H_PX / A4_W_PX));

export default function PhotoTool() {
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('free');
  const [grayscale, setGrayscale] = useState<boolean>(false);

  const template = TEMPLATES.find(t => t.id === templateId) || TPL_FREE;

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
    } catch (e: any) {
      setError('Could not read image: ' + (e.message || 'unknown'));
    }
  }, []);

  const handlePrint = useCallback(() => {
    const canvas = document.getElementById('cc-photo-canvas') as HTMLCanvasElement | null;
    if (!canvas) { setError('Canvas not ready'); return; }
    // Wrap PNG in a minimal HTML doc with @page A4 + zero margins, so the
    // browser print dialog produces a real 210x297mm page (not "Fit to page"
    // with default printer margins). The img is sized to fill the page exactly.
    const dataUrl = canvas.toDataURL('image/png');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; }
img { display: block; width: 210mm; height: 297mm; }
</style></head><body><img src="${dataUrl}"/></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    printBlob(blob);
  }, []);

  useEffect(() => {
    return () => { if (imageBitmap) imageBitmap.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            onClick={() => setGrayscale(g => !g)}
            className={`px-3 py-1.5 rounded text-xs ${
              grayscale ? 'bg-gray-700 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
            }`}
            title="Toggle grayscale (saves toner on B&W printers)"
          >
            B&W
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
          <A4Canvas image={imageBitmap} template={template} grayscale={grayscale} onDrop={handleFile} />
        </main>
      </div>

      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>{template.name} · {template.slots.length} slot{template.slots.length === 1 ? '' : 's'}</span>
        <span className={error ? 'text-red-400' : 'italic'}>
          {error || 'Phase 2b — 5 templates'}
        </span>
      </footer>
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

function A4Canvas({ image, template, grayscale, onDrop }: { image: ImageBitmap | null; template: Template; grayscale: boolean; onDrop: (f: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = A4_W_PX;
    canvas.height = A4_H_PX;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W_PX, A4_H_PX);
    if (image) {
      ctx.filter = grayscale ? 'grayscale(1) contrast(1.1)' : 'none';
      for (const slot of template.slots) {
        drawIntoSlot(ctx, image, slot);
      }
      ctx.filter = 'none';
    } else {
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 10]);
      for (const slot of template.slots) {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
      ctx.setLineDash([]);
    }
  }, [image, template, grayscale]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onDrop(file);
  };

  return (
    <div
      className={`relative shadow-2xl rounded-sm transition-shadow ${dragOver ? 'ring-2 ring-blue-500' : ''}`}
      style={{ width: DISPLAY_W, height: DISPLAY_H }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        id="cc-photo-canvas"
        style={{ width: DISPLAY_W, height: DISPLAY_H, display: 'block' }}
      />
      {!image && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none select-none">
          Drop an image, or click "Choose Image"
        </div>
      )}
    </div>
  );
}

// Fit + draw image into a slot, preserving aspect ratio.
function drawIntoSlot(ctx: CanvasRenderingContext2D, img: ImageBitmap, slot: Slot) {
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
  const dx = slot.x + (slot.w - drawW) / 2;
  const dy = slot.y + (slot.h - drawH) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.w, slot.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}
