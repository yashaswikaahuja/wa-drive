/**
 * Scroll offsets for a whole-page screenshot.
 * Caps the number of viewport captures so a long page stays one JPEG.
 */
function pageShotOffsets(scrollHeight: number, clientHeight: number, maxShots: number) {
  const view = Math.max(1, Math.round(Number(clientHeight) || 1));
  const height = Math.max(view, Math.round(Number(scrollHeight) || view));
  const limit = Math.max(1, Math.round(Number(maxShots) || 1));
  const maxY = Math.max(0, height - view);
  const offsets: number[] = [];
  for (let y = 0; offsets.length < limit; y += view) {
    const next = Math.min(y, maxY);
    offsets.push(next);
    if (next >= maxY) break;
  }
  return { offsets, clipped: offsets[offsets.length - 1] < maxY - 1 };
}

const pageShotRoot = typeof globalThis !== 'undefined' ? globalThis : this;
(pageShotRoot as any).CcPageShot = { pageShotOffsets };
