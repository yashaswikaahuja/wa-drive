/**
 * Mozilla PDF.js viewer with Back/Delete/file-nav integrated into its toolbar.
 * Expects same-origin /pdfjs/web/viewer.html (Hub public/pdfjs assets).
 *
 * `mode="editor"` hides File Manager chrome and exposes the PDF.js editors
 * (text, draw, highlight, image) plus a File Manager stamp.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type PdfEditorMode = 'none' | 'text' | 'draw' | 'highlight' | 'image';

export type StampPlace = {
  /** 1-based page number. */
  page?: number;
  /** Top-left and size, as fractions of the page (0–1). */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MozillaPdfHandle = {
  setEditorMode: (mode: PdfEditorMode) => void;
  /** Place an image on the PDF. With `place`, it is sized and can be dragged. */
  stampFile: (file: File, place?: StampPlace) => Promise<void>;
  /** Annotated PDF bytes currently shown in the viewer. */
  exportPdf: () => Promise<Blob>;
  /** 1-based page the operator is looking at. */
  currentPage: () => Promise<number>;
  /** Show a 1-based page. */
  goToPage: (page: number) => void;
};

export type MozillaPdfEmbedProps = {
  fileUrl: string;
  className?: string;
  /** `editor` hides File Manager back/delete/file-switch chrome. */
  mode?: 'files' | 'editor';
  onBack?: () => void;
  onDelete?: () => void;
  onPrevFile?: () => void;
  onNextFile?: () => void;
  /** Operator asked for a File Manager image from inside the viewer. */
  onPickDriveImage?: () => void;
  /** The PDF is open and the editor can take an image. */
  onReady?: () => void;
};

const MozillaPdfEmbed = forwardRef<MozillaPdfHandle, MozillaPdfEmbedProps>(function MozillaPdfEmbed({
  fileUrl,
  className = '',
  mode = 'files',
  onBack,
  onDelete,
  onPrevFile,
  onNextFile,
  onPickDriveImage,
  onReady,
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onBackRef = useRef(onBack);
  const onDeleteRef = useRef(onDelete);
  const onPrevRef = useRef(onPrevFile);
  const onNextRef = useRef(onNextFile);
  const onPickRef = useRef(onPickDriveImage);
  const onReadyRef = useRef(onReady);
  onBackRef.current = onBack;
  onDeleteRef.current = onDelete;
  onPrevRef.current = onPrevFile;
  onNextRef.current = onNextFile;
  onPickRef.current = onPickDriveImage;
  onReadyRef.current = onReady;

  const pendingExport = useRef(
    new Map<string, { resolve: (blob: Blob) => void; reject: (err: Error) => void }>(),
  );
  const pendingStamp = useRef(
    new Map<string, { resolve: () => void; reject: (err: Error) => void }>(),
  );
  const pendingPage = useRef(
    new Map<string, { resolve: (page: number) => void; reject: (err: Error) => void }>(),
  );
  const exportSeq = useRef(0);
  const stampSeq = useRef(0);
  const pageSeq = useRef(0);

  const postToViewer = (msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  };

  useImperativeHandle(ref, () => ({
    setEditorMode(modeName) {
      postToViewer({ type: 'cyber-editor-mode', mode: modeName });
    },
    stampFile(file, place) {
      const p = new Promise<void>((resolve, reject) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) {
          reject(new Error('PDF viewer is not open'));
          return;
        }
        const id = `stamp-${++stampSeq.current}`;
        const timer = window.setTimeout(() => {
          if (!pendingStamp.current.has(id)) return;
          pendingStamp.current.delete(id);
          reject(new Error('Image was not placed'));
        }, 15000);
        pendingStamp.current.set(id, {
          resolve: () => {
            window.clearTimeout(timer);
            resolve();
          },
          reject: (err) => {
            window.clearTimeout(timer);
            reject(err);
          },
        });
        win.postMessage({ type: 'cyber-stamp-file', id, file, place: place ?? null }, window.location.origin);
      });
      // Callers that do not await still get a handled rejection.
      p.catch(() => {});
      return p;
    },
    exportPdf() {
      return new Promise((resolve, reject) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) {
          reject(new Error('PDF viewer is not open'));
          return;
        }
        const id = `exp-${++exportSeq.current}`;
        const timer = window.setTimeout(() => {
          if (!pendingExport.current.has(id)) return;
          pendingExport.current.delete(id);
          reject(new Error('PDF viewer did not answer'));
        }, 15000);
        pendingExport.current.set(id, {
          resolve: (blob) => {
            window.clearTimeout(timer);
            resolve(blob);
          },
          reject: (err) => {
            window.clearTimeout(timer);
            reject(err);
          },
        });
        win.postMessage({ type: 'cyber-export-pdf', id }, window.location.origin);
      });
    },
    currentPage() {
      return new Promise((resolve, reject) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) {
          reject(new Error('PDF viewer is not open'));
          return;
        }
        const id = `page-${++pageSeq.current}`;
        const timer = window.setTimeout(() => {
          if (!pendingPage.current.has(id)) return;
          pendingPage.current.delete(id);
          reject(new Error('PDF viewer did not answer'));
        }, 4000);
        pendingPage.current.set(id, {
          resolve: (page) => {
            window.clearTimeout(timer);
            resolve(page);
          },
          reject: (err) => {
            window.clearTimeout(timer);
            reject(err);
          },
        });
        win.postMessage({ type: 'cyber-current-page', id }, window.location.origin);
      });
    },
    goToPage(page) {
      postToViewer({ type: 'cyber-go-page', page });
    },
  }), []);

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
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not open PDF';
          setError(message);
        }
      }
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.source !== iframe.contentWindow) return;
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
      } else if (type === 'cyber-pick-drive-image') {
        onPickRef.current?.();
      } else if (type === 'cyber-pdf-opened') {
        onReadyRef.current?.();
      } else if (type === 'cyber-stamp-placed') {
        const pending = pendingStamp.current.get(e.data?.id);
        if (!pending) return;
        pendingStamp.current.delete(e.data.id);
        pending.resolve();
      } else if (type === 'cyber-stamp-error') {
        const pending = pendingStamp.current.get(e.data?.id);
        if (!pending) return;
        pendingStamp.current.delete(e.data.id);
        pending.reject(new Error(e.data?.message || 'Could not place the image'));
      } else if (type === 'cyber-pdf-bytes') {
        const pending = pendingExport.current.get(e.data?.id);
        if (!pending || !e.data?.data) return;
        pendingExport.current.delete(e.data.id);
        pending.resolve(new Blob([e.data.data as ArrayBuffer], { type: 'application/pdf' }));
      } else if (type === 'cyber-pdf-export-error') {
        const pending = pendingExport.current.get(e.data?.id);
        if (!pending) return;
        pendingExport.current.delete(e.data.id);
        pending.reject(new Error(e.data?.message || 'Could not save the PDF'));
      } else if (type === 'cyber-page-number') {
        const pending = pendingPage.current.get(e.data?.id);
        if (!pending) return;
        pendingPage.current.delete(e.data.id);
        pending.resolve(Number(e.data?.page) || 1);
      } else if (type === 'cyber-page-number-error') {
        const pending = pendingPage.current.get(e.data?.id);
        if (!pending) return;
        pendingPage.current.delete(e.data.id);
        pending.reject(new Error(e.data?.message || 'Could not read the page'));
      } else if (type === 'cyber-pdf-error') {
        setError(e.data?.message || 'PDF viewer error');
      }
    };

    window.addEventListener('message', onMessage);
    const onLoad = () => {
      try {
        iframe.contentWindow?.postMessage({ type: 'cyber-ping' }, window.location.origin);
      } catch {
        /* ignore */
      }
    };
    iframe.addEventListener('load', onLoad);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', onLoad);
      pendingExport.current.forEach((pending) => pending.reject(new Error('PDF viewer closed')));
      pendingExport.current.clear();
      pendingStamp.current.forEach((pending) => pending.reject(new Error('PDF viewer closed')));
      pendingStamp.current.clear();
      pendingPage.current.forEach((pending) => pending.reject(new Error('PDF viewer closed')));
      pendingPage.current.clear();
    };
  }, [fileUrl]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <iframe
        ref={iframeRef}
        title="PDF document"
        src={
          mode === 'editor'
            ? '/pdfjs/web/viewer.html?cyber=editor#zoom=page-width&pagemode=none'
            : '/pdfjs/web/viewer.html#zoom=page-width'
        }
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
});

export default MozillaPdfEmbed;
