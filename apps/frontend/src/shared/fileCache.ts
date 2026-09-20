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

/**
 * Print a blob (image or PDF). Uses a hidden iframe in the SAME document
 * because Chrome (since ~2020) blocks cross-window blob: URL navigation —
 * window.open('', '_blank') popup with .location.href = blobUrl gives
 * 'failed to load'. iframe shares parent's blob URL context so it loads.
 *
 * For images: iframe renders, then window.print() opens print dialog.
 * For PDFs: same — Chrome's built-in PDF viewer in iframe handles print.
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:-9999px;bottom:0;width:210mm;height:297mm;border:0';
  iframe.src = url;
  let printed = false;
  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch (e) {}
    URL.revokeObjectURL(url);
  };
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        // Fallback: trigger download if print can't open
        const a = document.createElement('a');
        a.href = url; a.download = 'file';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      // Keep iframe long enough for print dialog to capture content
      setTimeout(cleanup, 10000);
    }, 250);
  };
  iframe.onerror = () => {
    cleanup();
    alert('Failed to load file for printing. Try Download instead.');
  };
  document.body.appendChild(iframe);
}
