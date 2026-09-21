/**
 * Full-stage PDF viewer (same compliance as photo viewer).
 * Renders pages with pdf.js; ResizeObserver so we never stamp a tiny page
 * into a large desktop stage.
 */
import { useEffect, useRef, useState } from 'react';
import { SpinnerGap, CaretLeft, CaretRight } from '@phosphor-icons/react';

type Props = {
  url: string;
  zoom?: number;
  className?: string;
};

export default function PdfViewer({ url, zoom = 1, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hostW, setHostW] = useState(0);

  // Track real stage width — first paint is often 0/tiny
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width || 0;
      if (w >= 80) setHostW(Math.floor(w));
    });
    ro.observe(el);
    setHostW(Math.floor(el.clientWidth) || 0);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!url || hostW < 80) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);
    setPage(0);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const data = await fetch(url).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
        const pdf = await pdfjs.getDocument({ data }).promise;
        const urls: string[] = [];
        const maxPages = Math.min(pdf.numPages, 40);
        // Fill the stage width (minus small padding); crisp on desktop retina
        const targetW = Math.min(Math.max(hostW - 8, 320), 1400);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let i = 1; i <= maxPages; i++) {
          const pg = await pdf.getPage(i);
          const base = pg.getViewport({ scale: 1 });
          const cssScale = targetW / base.width;
          const viewport = pg.getViewport({ scale: cssScale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await pg.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          // Store as PNG for sharp text on docs (stamps/Hindi)
          urls.push(canvas.toDataURL('image/png'));
        }
        if (!cancelled) {
          setPages(urls);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not open PDF on this device');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, hostW]);

  return (
    <div
      ref={hostRef}
      className={`relative w-full h-full flex flex-col min-h-0 ${className}`}
      style={{ touchAction: 'pan-y' }}
    >
      {loading && (
        <div className="flex-1 flex items-center justify-center gap-2 text-white/80 text-sm">
          <SpinnerGap size={22} className="animate-spin" /> Opening PDF…
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-center px-4 text-sm text-red-200">
          <div className="space-y-2">
            <p>{error}</p>
            <a href={url} download className="underline text-white">Download PDF instead</a>
          </div>
        </div>
      )}
      {!loading && !error && pages.length > 0 && (
        <>
          <div className="flex-1 min-h-0 w-full overflow-auto overscroll-contain">
            {/* Block layout (not flex-shrink) so the page always spans the stage width */}
            <div
              className="w-full p-2 sm:p-4 box-border"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
            >
              <img
                src={pages[page]}
                alt={`Page ${page + 1}`}
                className="w-full h-auto max-w-none rounded-md shadow-[0_0_80px_rgba(0,0,0,0.65)] bg-white block"
                draggable={false}
              />
            </div>
          </div>
          {pages.length > 1 && (
            <div className="shrink-0 flex items-center justify-center gap-3 py-2 text-white text-xs">
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-white/95 text-black flex items-center justify-center disabled:opacity-40"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <CaretLeft size={18} weight="bold" />
              </button>
              <span className="bg-white/95 text-black px-2.5 py-1 rounded-full font-medium">
                Page {page + 1} / {pages.length}
              </span>
              <button
                type="button"
                className="w-9 h-9 rounded-full bg-white/95 text-black flex items-center justify-center disabled:opacity-40"
                disabled={page >= pages.length - 1}
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
              >
                <CaretRight size={18} weight="bold" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
