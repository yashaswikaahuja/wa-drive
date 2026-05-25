/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 1b: real <canvas> mounted with A4 @ 300 DPI internal coords.
 */

import { useEffect, useRef } from 'react';

// A4 @ 300 DPI — internal coordinate system (always this size, regardless of display zoom)
const A4_W_PX = 2480;
const A4_H_PX = 3508;

// Display size — what the operator sees on screen. Internal coords scale to fit.
const DISPLAY_W = 480;
const DISPLAY_H = Math.round(DISPLAY_W * (A4_H_PX / A4_W_PX));

export default function PhotoTool() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-950 text-gray-300">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <span className="text-lg">🖨</span>
          <h1 className="text-sm font-semibold text-gray-200">Photo Tool</h1>
          <span className="text-xs text-gray-500">— print Aadhaar, passport photos, documents</span>
        </div>
        <div className="flex items-center gap-2">
          <button disabled className="px-3 py-1.5 rounded text-xs bg-gray-800 text-gray-500 cursor-not-allowed">
            Print
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center overflow-auto p-8">
        <A4Canvas />
      </main>

      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>A4 · 210×297mm · 300 DPI · {A4_W_PX}×{A4_H_PX}px internal</span>
        <span className="italic">Phase 1b — canvas mounted</span>
      </footer>
    </div>
  );
}

function A4Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Internal coordinate system is fixed at 300 DPI; display size is set via CSS.
    canvas.width = A4_W_PX;
    canvas.height = A4_H_PX;
    // White paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W_PX, A4_H_PX);
  }, []);

  return (
    <div className="relative shadow-2xl rounded-sm" style={{ width: DISPLAY_W, height: DISPLAY_H }}>
      <canvas
        ref={canvasRef}
        style={{ width: DISPLAY_W, height: DISPLAY_H, display: 'block' }}
      />
      {/* Safe-area inset (5mm margin) — non-printing zone, overlay only */}
      <div
        className="absolute border border-dashed border-gray-300 pointer-events-none"
        style={{ inset: `${(5 / 210) * DISPLAY_W}px ${(5 / 210) * DISPLAY_W}px` }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
        Drop an image here (Phase 1c)
      </div>
    </div>
  );
}
