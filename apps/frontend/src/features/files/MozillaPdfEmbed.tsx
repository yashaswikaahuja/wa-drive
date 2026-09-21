/**
 * Mozilla PDF.js official viewer — phone + desktop.
 * Opens via postMessage ArrayBuffer (avoids blob/cross-origin file URL checks).
 */
import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Same-origin blob: URL — we fetch bytes and hand them to the viewer */
  fileUrl: string;
  className?: string;
};

export default function MozillaPdfEmbed({ fileUrl, className = '' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'cyber-pdf-ready') return;
      try {
        const buf = await fetch(fileUrl).then((r) => {
          if (!r.ok) throw new Error(`Failed to read PDF (${r.status})`);
          return r.arrayBuffer();
        });
        if (cancelled) return;
        iframe.contentWindow?.postMessage(
          { type: 'cyber-open-pdf', data: buf },
          window.location.origin,
        );
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not open PDF');
      }
    };

    window.addEventListener('message', onMessage);

    // If iframe already loaded before listener, also try on load
    const onLoad = () => {
      // viewer bridge posts cyber-pdf-ready; if already ready, nudge
      try {
        iframe.contentWindow?.postMessage({ type: 'cyber-ping' }, window.location.origin);
      } catch { /* ignore */ }
    };
    iframe.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
    };
  }, [fileUrl]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <iframe
        ref={iframeRef}
        title="PDF document"
        src="/pdfjs/web/viewer.html#zoom=page-width"
        className="w-full h-full border-0 bg-[#525659]"
        allow="fullscreen"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-200 text-sm p-4 text-center">
          {error}
        </div>
      )}
    </div>
  );
}
