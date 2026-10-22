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

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const i = clamp(Math.round((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[i];
}

function readPixels(src: HTMLCanvasElement) {
  const out = cloneCanvas(src);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  return { out, ctx, img };
}

type CleanMode = 'auto' | 'light' | 'gray' | 'whiteboard';

/** Local paper brightness, spread so text and the QR do not set the background. */
function localPaper(d: Uint8ClampedArray, w: number, h: number) {
  const block = clamp(Math.round(Math.min(w, h) / 16), 12, 48);
  const bw = Math.max(1, Math.ceil(w / block));
  const bh = Math.max(1, Math.ceil(h / block));
  const grid = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const vals: number[] = [];
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);
      const step = Math.max(1, Math.floor(block / 6));
      for (let y = y0; y < y1; y += step) {
        const row = y * w;
        for (let x = x0; x < x1; x += step) {
          const i = (row + x) * 4;
          vals.push(luma(d[i], d[i + 1], d[i + 2]));
        }
      }
      grid[by * bw + bx] = percentile(vals, 88);
    }
  }
  const spread = new Float32Array(grid.length);
  const rad = 3;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let m = 0;
      for (let dy = -rad; dy <= rad; dy++) {
        const ny = clamp(by + dy, 0, bh - 1);
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = clamp(bx + dx, 0, bw - 1);
          m = Math.max(m, grid[ny * bw + nx]);
        }
      }
      spread[by * bw + bx] = m;
    }
  }
  return { paper: spread, block, bw, bh };
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
 * The gray around a photographed page is paper too. Compare each pixel
 * with the local sheet, turn that sheet white, and darken the writing.
 */
function cleanSheet(d: Uint8ClampedArray, w: number, h: number, mode: CleanMode) {
  const { paper, block, bw, bh } = localPaper(d, w, h);
  const near = mode === 'light' ? 0.92 : mode === 'whiteboard' ? 0.58 : 0.72;
  const pale = mode === 'light' ? 208 : mode === 'whiteboard' ? 96 : 118;
  for (let y = 0; y < h; y++) {
    const by = Math.min(bh - 1, Math.floor(y / block));
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const bx = Math.min(bw - 1, Math.floor(x / block));
      const bg = Math.max(16, paper[by * bw + bx]);
      const i = (row + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const tone = luma(r, g, b);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const isPaper = spread < 30 && (tone >= pale || tone >= bg * near);
      if (isPaper) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        continue;
      }
      if (mode === 'auto' && spread >= 30) {
        const target = clamp(tone * 0.7, 0, 170);
        const s = tone < 1 ? 0 : target / tone;
        d[i] = clamp(r * s, 0, 255);
        d[i + 1] = clamp(g * s, 0, 255);
        d[i + 2] = clamp(b * s, 0, 255);
        continue;
      }
      const v = mode === 'whiteboard'
        ? (tone < 80 ? 0 : 16)
        : mode === 'light'
          ? clamp(tone * 0.45, 0, 100)
          : clamp((tone / 118) * 48, 0, 64);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
}
