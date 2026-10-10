/**
 * Renders page-1 of a PDF as a thumbnail via pdf.js (lazy).
 */
import { useEffect, useState } from 'react';
import { FilePdf, SpinnerGap } from '@phosphor-icons/react';
import { API_URL } from '../../shared/api';
import { useAuthStore } from '../auth/store';

const thumbCache = new Map<string, string>();

function authUrl(fileId: string) {
  const token = useAuthStore.getState().accessToken || '';
  return `${API_URL}/drive/download/${fileId}?token=${encodeURIComponent(token)}`;
}

export default function PdfThumb({
  fileId,
  driveThumbUrl,
  className = '',
}: {
  fileId: string;
  /** Optional Drive thumbnail fallback while pdf.js loads */
  driveThumbUrl?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(() => thumbCache.get(fileId) || null);
  const [failed, setFailed] = useState(false);
  const [driveBroken, setDriveBroken] = useState(false);

  useEffect(() => {
    if (thumbCache.has(fileId)) {
      setSrc(thumbCache.get(fileId)!);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        // CDN worker avoids Vite bundling quirks across pdfjs versions
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const buf = await fetch(authUrl(fileId)).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.45 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        thumbCache.set(fileId, dataUrl);
        if (!cancelled) setSrc(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [fileId]);

  if (src) {
    return <img src={src} alt="" className={`w-full h-full object-cover ${className}`} />;
  }

  // While rendering, try Drive thumbnail if available
  if (!failed && driveThumbUrl && !driveBroken) {
    return (
      <img
        src={driveThumbUrl}
        alt=""
        className={`w-full h-full object-cover ${className}`}
        onError={() => setDriveBroken(true)}
      />
    );
  }

  if (!failed && !src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#2a1515]">
        <SpinnerGap size={22} className="animate-spin text-red-300/80" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-[#2a1515]">
      <FilePdf size={36} className="text-red-400" weight="fill" />
    </div>
  );
}
