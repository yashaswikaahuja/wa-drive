const CACHE_NAME = 'cc-drive-files-v1';

export async function getCachedBlob(fileId: string, fetcher: () => Promise<Blob>): Promise<Blob> {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = new Request(`/cached-drive/${fileId}`);
  
  // Try cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached.blob();
  }
  
  // Fetch and cache
  const blob = await fetcher();
  const response = new Response(blob, {
    headers: { 'Content-Type': blob.type, 'X-Cached-At': Date.now().toString() }
  });
  await cache.put(cacheKey, response);
  return blob;
}
