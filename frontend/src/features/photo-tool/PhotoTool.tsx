/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * Phase 1a: layout shell with visible A4 paper (no interactivity yet).
 */

const A4_RATIO = 297 / 210; // height / width — portrait

export default function PhotoTool() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-950 text-gray-300">
      {/* Top bar */}
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

      {/* Main canvas area */}
      <main className="flex-1 flex items-center justify-center overflow-auto p-8">
        <A4Paper />
      </main>

      {/* Footer */}
      <footer className="px-4 py-1.5 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex justify-between">
        <span>A4 · 210×297mm · 300 DPI</span>
        <span className="italic">Phase 1a — layout shell</span>
      </footer>
    </div>
  );
}

function A4Paper() {
  // A4 visible at fixed display size (will become responsive later)
  const widthPx = 480;
  const heightPx = Math.round(widthPx * A4_RATIO);
  return (
    <div
      className="bg-white shadow-2xl rounded-sm relative"
      style={{ width: widthPx, height: heightPx }}
    >
      {/* Safe-area inset (5mm margin) — non-printing zone */}
      <div
        className="absolute border border-dashed border-gray-300 pointer-events-none"
        style={{ inset: `${(5 / 210) * widthPx}px ${(5 / 210) * widthPx}px` }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
        Drop an image here (coming in Phase 1b)
      </div>
    </div>
  );
}
