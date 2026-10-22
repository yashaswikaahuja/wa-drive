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
  if (filter === 'gray') paintGray(d, w, h, step);
  else if (filter === 'auto') paintAuto(d, w, h, step);
  else if (filter === 'light') paintLight(d, w, h, step);
  else paintWhiteboard(d, w, h, step);
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Paper tone of the scan, so the page can be lifted to pure white. */
function paperLevel(d: Uint8ClampedArray, w: number, h: number, step: number) {
  const ys: number[] = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      ys.push(luma(d[i], d[i + 1], d[i + 2]));
    }
  }
  return Math.max(8, percentile(ys, 68));
}

/**
 * Lift the sheet to crisp white and darken the writing.
 * `gain` is how hard ink is pushed. `snap` is how close to the paper
 * a pixel must be before it becomes white.
 */
function cleanSheet(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  step: number,
  gain: number,
  snap: number,
  mode: 'color' | 'gray' | 'ink',
) {
  const paper = paperLevel(d, w, h, step);
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2]);
    const rel = (paper - y) / paper;
    if (rel <= snap) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      continue;
    }
    let ny = clamp(255 - (paper - y) * gain, 0, 255);
    if (ny > 232) ny = 255;
    if (mode === 'gray' || mode === 'ink') {
      if (mode === 'ink') ny = ny > 170 ? 255 : clamp(ny * 0.45, 0, 255);
      d[i] = d[i + 1] = d[i + 2] = ny;
      continue;
    }
    const s = y < 1 ? 0 : ny / y;
    let r = clamp(d[i] * s, 0, 255);
    let g = clamp(d[i + 1] * s, 0, 255);
    let b = clamp(d[i + 2] * s, 0, 255);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread < 36) {
      const v = clamp(luma(r, g, b) * 0.72, 0, 255);
      r = g = b = v;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

function paintGray(d: Uint8ClampedArray, w: number, h: number, step: number) {
  cleanSheet(d, w, h, step, 1.85, 0.1, 'gray');
}

function paintAuto(d: Uint8ClampedArray, w: number, h: number, step: number) {
  cleanSheet(d, w, h, step, 1.9, 0.1, 'color');
}

function paintLight(d: Uint8ClampedArray, w: number, h: number, step: number) {
  cleanSheet(d, w, h, step, 2.6, 0.05, 'color');
}

function paintWhiteboard(d: Uint8ClampedArray, w: number, h: number, step: number) {
  cleanSheet(d, w, h, step, 3.2, 0.14, 'ink');
}
