/**
 * CyberControl Photo Tool
 *
 * SERVER NEVER SEES PIXELS. All rendering happens here in the browser.
 * See /ARCHITECTURE.md §3.1 and §3.2.
 *
 * This is the entry point. Phases roll out incrementally:
 *   Phase 0: route + nav wired (this commit)
 *   Phase 1: A4 canvas + image upload
 *   Phase 2: template engine
 *   Phase 3: print pipeline
 *   Phase 4+: more templates, WhatsApp deep-link, history
 */

export default function PhotoTool() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-gray-950 text-gray-300">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🖨</div>
        <h1 className="text-2xl font-semibold mb-2">Photo Tool</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Print Aadhaar copies, passport photos, and documents in seconds.
        </p>
        <p className="text-xs text-gray-600 mt-6 italic">
          Coming soon — wiring up Phase 0
        </p>
      </div>
    </div>
  );
}
