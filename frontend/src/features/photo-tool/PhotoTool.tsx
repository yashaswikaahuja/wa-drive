/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 1c: file upload (drag/drop + picker) + image draws on canvas
 * with fit-to-printable-area + EXIF orientation respected.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// A4 @ 300 DPI — internal coordinate system
const A4_W_PX = 2480;
const A4_H_PX = 3508;

// 5mm safe margin inside printable area (most printers can't print to edge)
const MARGIN_MM = 5;
const MM_TO_PX = 300 / 25.4; // 300 DPI
const MARGIN_PX = Math.round(MARGIN_MM * MM_TO_PX); // ~59px

const DISPLAY_W = 480;
const DISPLAY_H = Math.round(DISPLAY_W * (A4_H_PX / A4_W_PX));

export default function PhotoTool() {
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleFile = useCallback(async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file');
      return;
    }
    try {
      // createImageBitmap respects EXIF orientation when imageOrientation: 'from-image'.
      // Phone-captured images are often rotated via EXIF only — without this they look sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      setImageBitmap(prev => { if (prev) prev.close(); return bitmap; });
      setFileName(file.name);
    } catch (e: any) {
      setError('Could not read image: ' + (e.message || 'unknown'));
    }
  }, []);

  // Cleanup bitmap on unmount to free GPU memory
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

      <main className="flex-1 flex items-center justify-center overflow-auto p-8">
        <A4Canvas image={imageBitmap} onDrop={handleFile} />
      </main>

      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>A4 · 210×297mm · 300 DPI</span>
        <span className={error ? 'text-red-400' : 'italic'}>
          {error || 'Phase 1c — image upload'}
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

function A4Canvas({ image, onDrop }: { image: ImageBitmap | null; onDrop: (f: File) => void }) {
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
    // Image fit-to-printable-area, centered
    if (image) {
      const printW = A4_W_PX - 2 * MARGIN_PX;
      const printH = A4_H_PX - 2 * MARGIN_PX;
      const scale = Math.min(printW / image.width, printH / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      const dx = (A4_W_PX - drawW) / 2;
      const dy = (A4_H_PX - drawH) / 2;
      ctx.drawImage(image, dx, dy, drawW, drawH);
    }
  }, [image]);

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
      {/* Safe-area inset overlay */}
      <div
        className="absolute border border-dashed border-gray-300 pointer-events-none"
        style={{ inset: `${(MARGIN_MM / 210) * DISPLAY_W}px ${(MARGIN_MM / 210) * DISPLAY_W}px` }}
      />
      {!image && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none select-none">
          Drop an image here, or click "Choose Image"
        </div>
      )}
    </div>
  );
}
