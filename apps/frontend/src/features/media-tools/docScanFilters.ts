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

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * Rectangles that are photographs (a face on an Aadhaar card), not print.
 * Text, a QR, and a flat color bar do not qualify.
 */
function photoRegions(d: Uint8ClampedArray, w: number, h: number): Box[] {
  const block = clamp(Math.round(Math.min(w, h) / 32), 12, 22);
  const bw = Math.max(1, Math.ceil(w / block));
  const bh = Math.max(1, Math.ceil(h / block));
  const n = bw * bh;
  const colorFrac = new Float32Array(n);
  const lumaStd = new Float32Array(n);
  const chromaStd = new Float32Array(n);
  const inkFrac = new Float32Array(n);
  const paperFrac = new Float32Array(n);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let count = 0;
      let color = 0;
      let ink = 0;
      let paper = 0;
      let sumL = 0;
      let sumL2 = 0;
      let sumC = 0;
      let sumC2 = 0;
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);
      for (let y = y0; y < y1; y += 2) {
        const row = y * w;
        for (let x = x0; x < x1; x += 2) {
          const i = (row + x) * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const tone = luma(r, g, b);
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          count++;
          sumL += tone;
          sumL2 += tone * tone;
          sumC += chroma;
          sumC2 += chroma * chroma;
          if (chroma > 18) color++;
          if (tone < 70 && chroma < 30) ink++;
          if (tone > 200 && chroma < 28) paper++;
        }
      }
      const at = by * bw + bx;
      if (!count) continue;
      const meanL = sumL / count;
      const meanC = sumC / count;
      colorFrac[at] = color / count;
      inkFrac[at] = ink / count;
      paperFrac[at] = paper / count;
      lumaStd[at] = Math.sqrt(Math.max(0, sumL2 / count - meanL * meanL));
      chromaStd[at] = Math.sqrt(Math.max(0, sumC2 / count - meanC * meanC));
    }
  }
  const seed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (colorFrac[i] > 0.4 && lumaStd[i] > 14 && chromaStd[i] > 6 && inkFrac[i] < 0.4) seed[i] = 1;
  }
  const dist = new Int16Array(n);
  dist.fill(9999);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!seed[i]) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const bx = i % bw;
    const by = (i - bx) / bw;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = bx + dx;
        const ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const j = ny * bw + nx;
        const colored = colorFrac[j] > 0.22 && inkFrac[j] < 0.45 && paperFrac[j] < 0.75;
        const cloth = dist[i] <= 3 && lumaStd[j] > 16 && paperFrac[j] < 0.45 && inkFrac[j] < 0.8 && colorFrac[j] > 0.08;
        if (!colored && !cloth) continue;
        const step = dist[i] + 1;
        if (step >= dist[j]) continue;
        dist[j] = step;
        queue.push(j);
      }
    }
  }
  const mark = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (dist[i] < 9999) mark[i] = 1;
  const seen = new Uint8Array(n);
  const boxes: Box[] = [];
  for (let start = 0; start < n; start++) {
    if (!mark[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let minX = bw;
    let minY = bh;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    let seeds = 0;
    let colorSum = 0;
    while (stack.length) {
      const i = stack.pop() as number;
      const bx = i % bw;
      const by = (i - bx) / bw;
      count++;
      colorSum += colorFrac[i];
      if (seed[i]) seeds++;
      if (bx < minX) minX = bx;
      if (by < minY) minY = by;
      if (bx > maxX) maxX = bx;
      if (by > maxY) maxY = by;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = bx + dx;
          const ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const j = ny * bw + nx;
          if (!mark[j] || seen[j]) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (seeds < 4 || count < 4 || colorSum / count < 0.22) continue;
    const x0 = minX * block;
    const y0 = minY * block;
    const x1 = Math.min(w, (maxX + 1) * block);
    const y1 = Math.min(h, (maxY + 1) * block);
    const pad = 6;
    boxes.push({
      x0: Math.max(0, x0 - pad),
      y0: Math.max(0, y0 - pad),
      x1: Math.min(w, x1 + pad),
      y1: Math.min(h, y1 + pad),
    });
  }
  const dead = boxes.map(() => false);
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < boxes.length; i++) {
      if (dead[i]) continue;
      for (let j = i + 1; j < boxes.length; j++) {
        if (dead[j]) continue;
        const a = boxes[i];
        const b = boxes[j];
        const gap = block * 3;
        if (a.x1 + gap < b.x0 || b.x1 + gap < a.x0 || a.y1 + gap < b.y0 || b.y1 + gap < a.y0) continue;
        a.x0 = Math.min(a.x0, b.x0);
        a.y0 = Math.min(a.y0, b.y0);
        a.x1 = Math.max(a.x1, b.x1);
        a.y1 = Math.max(a.y1, b.y1);
        dead[j] = true;
        joined = true;
      }
    }
  }
  return boxes.filter((box, i) => {
    if (dead[i]) return false;
    const rw = box.x1 - box.x0;
    const rh = box.y1 - box.y0;
    if (rw < 48 || rh < 48) return false;
    if (rh < rw * 0.4 && rh < 90) return false;
    return true;
  });
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
  const photos = photoRegions(d, w, h);
  if (filter === 'gray') cleanSheet(d, w, h, 'gray');
  else if (filter === 'auto') cleanSheet(d, w, h, 'auto');
  else if (filter === 'light') cleanSheet(d, w, h, 'light');
  else cleanSheet(d, w, h, 'whiteboard');
  if (photos.length) {
    const src = ctx.getImageData(0, 0, w, h).data;
    for (const box of photos) {
      for (let y = box.y0; y < box.y1; y++) {
        const row = y * w;
        for (let x = box.x0; x < box.x1; x++) {
          const i = (row + x) * 4;
          d[i] = src[i];
          d[i + 1] = src[i + 1];
          d[i + 2] = src[i + 2];
          d[i + 3] = src[i + 3];
        }
      }
    }
  }
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
