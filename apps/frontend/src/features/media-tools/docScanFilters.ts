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

/**
 * Phone photos of paper peak well under 255. Walk down from that peak
 * while the bins stay thick, so shade on the same page still counts
 * and the darker desk or floor does not.
 */
function whiteLevel(d: Uint8ClampedArray, w: number, h: number): number {
  const bins = new Int32Array(64);
  const step = 3;
  for (let y = 0; y < h; y += step) {
    const row = y * w;
    for (let x = 0; x < w; x += step) {
      const i = (row + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > 18) continue;
      bins[Math.min(63, luma(r, g, b) >> 2)]++;
    }
  }
  let modeBin = 50;
  let modeCount = 0;
  for (let b = 45; b < 64; b++) {
    if (bins[b] > modeCount) {
      modeCount = bins[b];
      modeBin = b;
    }
  }
  if (modeCount < 40) return 230;
  const thick = modeCount * 0.35;
  let low = modeBin;
  for (let b = modeBin; b >= 45; b--) {
    if (bins[b] < thick) break;
    low = b;
  }
  return clamp(low * 4, 190, 230);
}

/** Square binary morphology. Erode keeps a pixel only when the whole window is paper. */
function morph(src: Uint8Array, w: number, h: number, radius: number, erode: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pass = (from: Uint8Array, to: Uint8Array, horizontal: boolean) => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      const prefix = new Int32Array(inner + 1);
      for (let i = 0; i < inner; i++) {
        const idx = horizontal ? o * w + i : i * w + o;
        prefix[i + 1] = prefix[i] + from[idx];
      }
      for (let i = 0; i < inner; i++) {
        const a = Math.max(0, i - radius);
        const b = Math.min(inner - 1, i + radius);
        const sum = prefix[b + 1] - prefix[a];
        const idx = horizontal ? o * w + i : i * w + o;
        to[idx] = erode ? (sum === b - a + 1 ? 1 : 0) : sum > 0 ? 1 : 0;
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

/** Drop bright specks. A real page is a large connected sheet of white. */
function keepLarge(src: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const minArea = Math.max(480, Math.round(Math.min(w, h) * 1.2));
  const pix = new Int32Array(w * h);
  for (let start = 0; start < src.length; start++) {
    if (!src[start] || seen[start]) continue;
    let n = 0;
    let head = 0;
    pix[n++] = start;
    seen[start] = 1;
    while (head < n) {
      const i = pix[head++];
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const row = ny * w;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const j = row + nx;
          if (!src[j] || seen[j]) continue;
          seen[j] = 1;
          pix[n++] = j;
        }
      }
    }
    if (n < minArea) continue;
    for (let k = 0; k < n; k++) out[pix[k]] = 1;
  }
  return out;
}

type PageMask = { paper: Uint8Array; ink: Uint8Array };

/**
 * Paper is the large sheet of this photo's own white. Ink is the darker
 * writing within a few pixels of that sheet. The portrait, the floor,
 * and the gray desk are neither, so the filter leaves them alone.
 */
function nearWhite(d: Uint8ClampedArray, w: number, h: number): PageMask {
  const cut = whiteLevel(d, w, h);
  const seed = new Uint8Array(w * h);
  const tone = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const t = luma(r, g, b);
      tone[row + x] = t;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 18) continue;
      if (t >= cut) seed[row + x] = 1;
    }
  }
  const opened = morph(seed, w, h, 1, true);
  const paper = keepLarge(opened, w, h);
  const reach = clamp(Math.round(Math.min(w, h) / 90), 5, 8);
  const near = morph(paper, w, h, reach, false);
  const ink = new Uint8Array(w * h);
  const inkAt = cut - 30;
  for (let i = 0; i < ink.length; i++) {
    if (!near[i] || paper[i]) continue;
    if (tone[i] <= inkAt) ink[i] = 1;
  }
  return { paper, ink };
}

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
  const mask = nearWhite(d, w, h);
  if (filter === 'gray') cleanSheet(d, w, h, 'gray', mask);
  else if (filter === 'auto') cleanSheet(d, w, h, 'auto', mask);
  else if (filter === 'light') cleanSheet(d, w, h, 'light', mask);
  else cleanSheet(d, w, h, 'whiteboard', mask);
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Whiten only the page's own white pixels. Darken only the writing
 * next to that white. Everything else stays as photographed.
 */
function cleanSheet(d: Uint8ClampedArray, w: number, h: number, mode: CleanMode, mask: PageMask) {
  const radius = clamp(Math.round(Math.min(w, h) / 80), 6, 16);
  const sheet = blurLuma(d, w, h, radius);
  const paper = mask.paper;
  const ink = mask.ink;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const at = row + x;
      const i = at * 4;
      if (paper[at]) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        continue;
      }
      if (!ink[at]) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const rel = luma(r, g, b) / Math.max(24, sheet[at]);
      if ((mode === 'auto' || mode === 'light') && spread >= 24) {
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
