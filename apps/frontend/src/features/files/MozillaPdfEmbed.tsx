/**
 * Mozilla PDF.js viewer with Back/Delete integrated into its toolbar.
 */
import { useEffect, useRef, useState } from 'react';

type Props = {
  fileUrl: string;
  className?: string;
  onBack?: () => void;
  onDelete?: () => void;
  onPrevFile?: () => void;
  onNextFile?: () => void;
};

export default function MozillaPdfEmbed({
  fileUrl, className = '', onBack, onDelete, onPrevFile, onNextFile,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onBackRef = useRef(onBack);
  const onDeleteRef = useRef(onDelete);
  const onPrevRef = useRef(onPrevFile);
  const onNextRef = useRef(onNextFile);
  onBackRef.current = onBack;
  onDeleteRef.current = onDelete;
  onPrevRef.current = onPrevFile;
  onNextRef.current = onNextFile;

  useEffect(() => {
    let cancelled = false;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sendOpen = async () => {
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

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const type = e.data?.type;
      if (type === 'cyber-pdf-ready') {
        void sendOpen();
      } else if (type === 'cyber-pdf-back') {
        onBackRef.current?.();
      } else if (type === 'cyber-pdf-delete') {
        onDeleteRef.current?.();
      } else if (type === 'cyber-pdf-prev-file') {
        onPrevRef.current?.();
      } else if (type === 'cyber-pdf-next-file') {
        onNextRef.current?.();
      } else if (type === 'cyber-pdf-error') {
        setError(e.data?.message || 'PDF viewer error');
      }
    };

    window.addEventListener('message', onMessage);
    const onLoad = () => {
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
