/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 2a: template engine — pick a template, image fills the slots.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// A4 @ 300 DPI — internal coordinate system
const A4_W_PX = 2480;
const A4_H_PX = 3508;
const MM_TO_PX = 300 / 25.4; // 300 DPI
const mm = (n: number) => Math.round(n * MM_TO_PX);

// Aadhaar/PAN/credit-card size: 85.6 × 54mm
const CARD_W = mm(85.6);
const CARD_H = mm(54);

const DISPLAY_W = 480;
const DISPLAY_H = Math.round(DISPLAY_W * (A4_H_PX / A4_W_PX));

// ── Templates ────────────────────────────────────────────────────────────
// Each template is pure data. Slots are positions in A4 px @ 300 DPI.
// imageIndex points to which uploaded image fills this slot (0 = first image).
// fit: 'contain' (fit inside, may letterbox) | 'cover' (fill, may crop).
type Slot = { x: number; y: number; w: number; h: number; imageIndex: number; fit: 'contain' | 'cover' };
type Template = {
  id: string;
  name: string;
  description: string;
  imagesNeeded: number;
  slots: Slot[];
};

// Free A4: image fits inside printable area, centered.
const TPL_FREE: Template = {
  id: 'free',
  name: 'Free A4',
  description: 'Fit one image to A4',
  imagesNeeded: 1,
  slots: [{ x: mm(5), y: mm(5), w: A4_W_PX - 2 * mm(5), h: A4_H_PX - 2 * mm(5), imageIndex: 0, fit: 'contain' }],
};

// Aadhaar 2 copies: two cards, stacked vertically, centered. Operator cuts in middle.
const AADHAAR_X = Math.round((A4_W_PX - CARD_W) / 2); // center horizontally
const AADHAAR_Y1 = Math.round((A4_H_PX / 2 - CARD_H) / 2); // center in top half
const AADHAAR_Y2 = Math.round(A4_H_PX / 2 + (A4_H_PX / 2 - CARD_H) / 2); // center in bottom half
const TPL_AADHAAR_2: Template = {
  id: 'aadhaar-2',
  name: 'Aadhaar — 2 copies',
  description: 'Same image, 2 cards on A4',
  imagesNeeded: 1,
  slots: [
    { x: AADHAAR_X, y: AADHAAR_Y1, w: CARD_W, h: CARD_H, imageIndex: 0, fit: 'contain' },
    { x: AADHAAR_X, y: AADHAAR_Y2, w: CARD_W, h: CARD_H, imageIndex: 0, fit: 'contain' },
  ],
};

const TEMPLATES: Template[] = [TPL_FREE, TPL_AADHAAR_2];

// ── Component ────────────────────────────────────────────────────────────

export default function PhotoTool() {
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [templateId, setTemplateId] = useState<string>('free');

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
          <span className="text-xs text-gray-500">{fileName || '— print Aadhaar, passport photos, documents'}</span>
        </div>
        <div className="flex items-center gap-2">
          <FilePicker onFile={handleFile} />
          <button disabled className="px-3 py-1.5 rounded text-xs bg-gray-800 text-gray-500 cursor-not-allowed">
            Print
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Template sidebar */}
        <aside className="w-48 border-r border-gray-800 bg-gray-900 overflow-y-auto p-2 flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-2 py-1">Templates</div>
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`text-left px-3 py-2 rounded text-xs transition-colors ${
                templateId === t.id ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-600/40' : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <div className="font-medium">{t.name}</div>
              <div className="text-gray-500 text-[10px] mt-0.5">{t.description}</div>
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <main className="flex-1 flex items-center justify-center overflow-auto p-8">
          <A4Canvas image={imageBitmap} template={template} onDrop={handleFile} />
        </main>
      </div>

      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>{template.name} · {template.slots.length} slot{template.slots.length === 1 ? '' : 's'}</span>
        <span className={error ? 'text-red-400' : 'italic'}>
          {error || 'Phase 2a — templates'}
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

function A4Canvas({ image, template, onDrop }: { image: ImageBitmap | null; template: Template; onDrop: (f: File) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = A4_W_PX;
    canvas.height = A4_H_PX;
    // White paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W_PX, A4_H_PX);
    // Draw image into each slot per template
    if (image) {
      for (const slot of template.slots) {
        drawIntoSlot(ctx, image, slot);
      }
    } else {
      // Empty-state slot guides (light gray dashed rects) to show layout
      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 4;
      ctx.setLineDash([20, 10]);
      for (const slot of template.slots) {
        ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
      }
      ctx.setLineDash([]);
    }
  }, [image, template]);

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
  // Clip to slot bounds (matters for 'cover')
  ctx.save();
  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.w, slot.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}
