/**
 * Full-bleed PDF viewer — pdf.js page images (iframe/blob PDFs fail on many phones).
 * Zoom applies only to the page content, not the browser chrome.
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

  useEffect(() => {
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
        // Render wide enough for desktop full stage; CSS scales down on phone
        const targetW = Math.min(Math.max(hostRef.current?.clientWidth || 720, 360), 1200);

        for (let i = 1; i <= maxPages; i++) {
          const pg = await pdf.getPage(i);
          const base = pg.getViewport({ scale: 1 });
          const scale = targetW / base.width;
          const viewport = pg.getViewport({ scale: Math.min(Math.max(scale, 1.1), 2.4) });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await pg.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          urls.push(canvas.toDataURL('image/jpeg', 0.88));
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
  }, [url]);

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
        <div className="flex-1 flex items-center justify-center text-center px-4 text-sm text-red-200 space-y-2">
          <div>
            <p>{error}</p>
            <a href={url} download className="underline text-white">Download PDF instead</a>
          </div>
        </div>
      )}
      {!loading && !error && pages.length > 0 && (
        <>
          <div className="flex-1 min-h-0 w-full overflow-auto flex items-center justify-center p-1 sm:p-3 overscroll-contain">
            <img
              src={pages[page]}
              alt={`Page ${page + 1}`}
              className="max-w-full max-h-full object-contain rounded shadow-2xl bg-white origin-center transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
              draggable={false}
            />
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
