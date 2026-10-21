const CACHE_NAME = 'cc-drive-files-v1';

export async function getCachedBlob(fileId: string, fetcher: () => Promise<Blob>): Promise<Blob> {
  // Cache API can throw (private mode / non-secure / quota) — never block open/download.
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = new Request(`/cached-drive/${fileId}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached.blob();

    const blob = await fetcher();
    try {
      await cache.put(
        cacheKey,
        new Response(blob, {
          headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Cached-At': Date.now().toString() },
        }),
      );
    } catch { /* ignore put failures */ }
    return blob;
  } catch {
    return fetcher();
  }
}

export type PrintBlobOpts = {
  /** Physical page width in mm (defaults A4). Must match PDF/image page size. */
  widthMm?: number;
  /** Physical page height in mm (defaults A4). */
  heightMm?: number;
  /** Suggested download name if print fails. */
  fileName?: string;
};

/**
 * Print a blob (image or PDF). Uses a hidden iframe in the SAME document
 * because Chrome (since ~2020) blocks cross-window blob: URL navigation —
 * window.open('', '_blank') popup with .location.href = blobUrl gives
 * 'failed to load'. iframe shares parent's blob URL context so it loads.
 *
 * Pass widthMm/heightMm for non-A4 sheets (e.g. 4×6) so the iframe and
 * print surface match the PDF MediaBox — otherwise Chrome defaults to A4.
 *
 * For images/HTML we wrap with @page CSS at the exact mm size so the OS
 * dialog prefers that paper. For PDFs we load the blob directly so Chrome
 * reads MediaBox (must already be the correct size from the generator).
 */
export function printBlob(blob: Blob, opts: PrintBlobOpts = {}): void {
  const widthMm = opts.widthMm ?? 210;
  const heightMm = opts.heightMm ?? 297;
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-print-w-mm', String(widthMm));
  iframe.setAttribute('data-print-h-mm', String(heightMm));
  iframe.setAttribute('data-print-file', opts.fileName || '');
  iframe.style.cssText = `position:fixed;right:-9999px;bottom:0;width:${widthMm}mm;height:${heightMm}mm;border:0`;

  const isPdf = blob.type === 'application/pdf' || /\.pdf$/i.test(opts.fileName || '');
  const isHtml = blob.type === 'text/html' || /\.html?$/i.test(opts.fileName || '');

  if (isPdf || isHtml) {
    iframe.src = url;
  } else {
    // Image (JPEG sheet etc.): force @page so dialog matches physical paper.
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title>
<style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; background: #fff; }
img { display: block; width: ${widthMm}mm; height: ${heightMm}mm; object-fit: fill; }
</style></head><body><img src="${url}" alt="print"/></body></html>`;
    iframe.srcdoc = html;
  }

  let printed = false;
  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* already gone */ }
    URL.revokeObjectURL(url);
  };
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        const a = document.createElement('a');
        a.href = url;
        a.download = opts.fileName || (isPdf ? 'print.pdf' : 'print.jpg');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(cleanup, 15000);
    }, 400);
  };
  iframe.onerror = () => {
    cleanup();
    alert('Failed to load file for printing. Try Download instead.');
  };
  document.body.appendChild(iframe);
}
