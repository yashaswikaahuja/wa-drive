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

function sampleStep(w: number, h: number) {
  return Math.max(1, Math.floor(Math.sqrt((w * h) / 40000)));
}

export function applyDocFilter(src: HTMLCanvasElement, filter: DocScanFilter): HTMLCanvasElement {
  if (filter === 'original') return cloneCanvas(src);
  const read = readPixels(src);
  if (!read) return cloneCanvas(src);
  const { out, ctx, img } = read;
  const d = img.data;
  const w = out.width;
  const h = out.height;
  const step = sampleStep(w, h);
  if (filter === 'gray') paintGray(d);
  else if (filter === 'auto') paintAuto(d, w, h, step);
  else if (filter === 'light') paintLight(d, w, h, step);
  else paintWhiteboard(d, w, h, step);
  ctx.putImageData(img, 0, 0);
  return out;
}

function paintGray(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
}

function paintAuto(d: Uint8ClampedArray, w: number, h: number, step: number) {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      rs.push(d[i]);
      gs.push(d[i + 1]);
      bs.push(d[i + 2]);
    }
  }
  const lo = [percentile(rs, 2), percentile(gs, 2), percentile(bs, 2)];
  const hi = [percentile(rs, 98), percentile(gs, 98), percentile(bs, 98)];
  const wide = hi[0] - lo[0] > 230 && hi[1] - lo[1] > 230 && hi[2] - lo[2] > 230;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c];
      d[i + c] = wide
        ? clamp((v - 128) * 1.08 + 134, 0, 255)
        : clamp(((v - lo[c]) * 255) / Math.max(2, hi[c] - lo[c]), 0, 255);
    }
  }
}

function paintLight(d: Uint8ClampedArray, w: number, h: number, step: number) {
  const ys: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      ys.push(luma(d[i], d[i + 1], d[i + 2]));
    }
  }
  const paper = percentile(ys, 90);
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2]);
    const ny = y >= paper ? 255 : clamp(paper - (paper - y) * 1.7, 0, 255);
    const s = y < 1 ? 0 : ny / y;
    d[i] = clamp(d[i] * s, 0, 255);
    d[i + 1] = clamp(d[i + 1] * s, 0, 255);
    d[i + 2] = clamp(d[i + 2] * s, 0, 255);
  }
}

function paintWhiteboard(d: Uint8ClampedArray, w: number, h: number, step: number) {
  const ys: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      ys.push(luma(d[i], d[i + 1], d[i + 2]));
    }
  }
  const black = percentile(ys, 12);
  const white = Math.max(black + 8, percentile(ys, 72));
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2]);
    const t = clamp((y - black) / (white - black), 0, 1);
    const s = 255 / (1 + Math.exp(-14 * (t - 0.58)));
    d[i] = d[i + 1] = d[i + 2] = s;
  }
}
