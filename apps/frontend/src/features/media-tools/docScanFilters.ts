/**
 * Document filters matching Adobe Scan: Original, Auto, Light text,
 * Grayscale, and Whiteboard. Each run starts from the unfiltered photo.
 */
import { cloneCanvas } from './documentPrintLayout';

export type DocScanFilter = 'original' | 'auto' | 'light' | 'gray' | 'whiteboard';

export const DOC_SCAN_FILTERS: { id: DocScanFilter; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Light text' },
  { id: 'gray', label: 'Grayscale' },
  { id: 'whiteboard', label: 'Whiteboard' },
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function readPixels(src: HTMLCanvasElement) {
  const out = cloneCanvas(src);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  return { out, ctx, img };
}

type CleanMode = 'auto' | 'light' | 'gray' | 'whiteboard';

/** Sheet brightness around each pixel. Wide enough to see paper past a stroke, not the whole desk. */
function blurLuma(d: Uint8ClampedArray, w: number, h: number, radius: number) {
  const src = new Float32Array(w * h);
  for (let i = 0, p = 0; i < src.length; i++, p += 4) src[i] = luma(d[p], d[p + 1], d[p + 2]);
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const box = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      const prefix = new Float32Array(inner + 1);
      for (let i = 0; i < inner; i++) {
        const idx = horizontal ? o * w + i : i * w + o;
        prefix[i + 1] = prefix[i] + from[idx];
      }
      for (let i = 0; i < inner; i++) {
        const a = Math.max(0, i - radius);
        const b = Math.min(inner - 1, i + radius);
        const idx = horizontal ? o * w + i : i * w + o;
        to[idx] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
      }
    }
  };
  box(src, tmp, true);
  box(tmp, out, false);
  return out;
}

export function applyDocFilter(src: HTMLCanvasElement, filter: DocScanFilter): HTMLCanvasElement {
  if (filter === 'original') return cloneCanvas(src);
  const read = readPixels(src);
  if (!read) return cloneCanvas(src);
  const { out, ctx, img } = read;
  const d = img.data;
  const w = out.width;
  const h = out.height;
  if (filter === 'gray') cleanSheet(d, w, h, 'gray');
  else if (filter === 'auto') cleanSheet(d, w, h, 'auto');
  else if (filter === 'light') cleanSheet(d, w, h, 'light');
  else cleanSheet(d, w, h, 'whiteboard');
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Compare each pixel with the sheet around it. Gray desk and photo
 * shadow match that sheet and turn white. Writing is darker than the
 * sheet, so it stays and is darkened. An absolute cutoff erased light print.
 */
function cleanSheet(d: Uint8ClampedArray, w: number, h: number, mode: CleanMode) {
  const radius = clamp(Math.round(Math.min(w, h) / 80), 6, 16);
  const sheet = blurLuma(d, w, h, radius);
  const near = blurLuma(d, w, h, 3);
  const paperCut = mode === 'light' ? 0.94 : mode === 'whiteboard' ? 0.68 : 0.86;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const tone = luma(r, g, b);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const bg = Math.max(24, sheet[row + x]);
      const local = near[row + x];
      const rel = tone / bg;
      // A flat patch matches its own neighborhood: desk, tint, or photo shadow.
      // A stroke is darker than the paper a few pixels away.
      const flat = Math.abs(tone - local) < 12 && local >= 72 && spread < 96;
      const photoEdge = y >= h - Math.max(10, Math.round(h * 0.022)) && spread < 130;
      if (photoEdge || flat || (rel >= paperCut && spread < (rel > 0.93 ? 72 : 40))) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        continue;
      }
      if ((mode === 'auto' || mode === 'light') && spread >= 40) {
        const s = clamp(mode === 'light' ? Math.pow(rel, 0.85) : Math.pow(rel, 1.2), 0.2, 0.92);
        d[i] = clamp(r * s, 0, 255);
        d[i + 1] = clamp(g * s, 0, 255);
        d[i + 2] = clamp(b * s, 0, 255);
        continue;
      }
      const v = mode === 'whiteboard'
        ? (rel < 0.62 ? 0 : 18)
        : mode === 'light'
          ? clamp(rel * rel * 180, 0, 130)
          : clamp(Math.pow(rel, 2.15) * 210, 0, 100);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
}
