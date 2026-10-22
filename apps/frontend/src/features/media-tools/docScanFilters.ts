/**
 * Document filters matching Adobe Scan: Original, Auto, Light text,
 * Grayscale, and Whiteboard. Each run starts from the unfiltered photo.
 *
 * Auto whitens the document's own paper and darkens the writing on it.
 * The page is one straight rectangle of that paper, so a concrete floor
 * or a gray desk outside it is left as photographed, and so is a portrait.
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

type PageBox = { x0: number; y0: number; x1: number; y1: number; mode: number };

function boxBlur(src: Float32Array, w: number, h: number, radius: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
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
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

/** Brightest nearby paper. A thin stroke sees the sheet beside it; a flat stain does not. */
function maxFilter(src: Float32Array, w: number, h: number, radius: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const line = new Float32Array(Math.max(w, h));
  const dest = new Float32Array(Math.max(w, h));
  const sweep = (n: number) => {
    const k = radius * 2 + 1;
    const dq = new Int32Array(n);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < n; i++) {
      while (tail > head && line[dq[tail - 1]] <= line[i]) tail--;
      dq[tail++] = i;
      if (dq[head] <= i - k) head++;
      if (i >= k - 1) dest[i - radius] = line[dq[head]];
    }
    for (let i = 0; i < radius && i < n; i++) {
      let m = line[0];
      const b = Math.min(n - 1, i + radius);
      for (let j = 0; j <= b; j++) if (line[j] > m) m = line[j];
      dest[i] = m;
    }
    const right = n - radius;
    for (let i = right; i < n; i++) {
      let m = line[Math.max(0, i - radius)];
      for (let j = Math.max(0, i - radius); j < n; j++) if (line[j] > m) m = line[j];
      dest[i] = m;
    }
  };
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) line[x] = src[row + x];
    sweep(w);
    for (let x = 0; x < w; x++) tmp[row + x] = dest[x];
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) line[y] = tmp[y * w + x];
    sweep(h);
    for (let y = 0; y < h; y++) out[y * w + x] = dest[y];
  }
  return out;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const at = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[at];
}

/**
 * Straight bounds of this photo's white sheet.
 * Smooth bright paper votes; texture (concrete) and a darker desk do not.
 * One percentile per side, so the edge is a line and cannot stair-step.
 */
function pageBox(luma: Float32Array, spread: Float32Array, std: Float32Array, w: number, h: number): PageBox | null {
  const bins = new Int32Array(64);
  for (let y = 0; y < h; y += 2) {
    const row = y * w;
    for (let x = 0; x < w; x += 2) {
      const i = row + x;
      if (spread[i] > 14 || std[i] > 6 || luma[i] < 168) continue;
      bins[Math.min(63, luma[i] >> 2)]++;
    }
  }
  let modeBin = 52;
  let modeCount = 0;
  for (let b = 42; b < 64; b++) {
    if (bins[b] > modeCount) {
      modeCount = bins[b];
      modeBin = b;
    }
  }
  const mode = modeCount < 24 ? 208 : modeBin * 4 + 2;
  const cut = mode - 22;
  const rowCount = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (spread[i] <= 16 && std[i] <= 8 && luma[i] >= cut) n++;
    }
    rowCount[y] = n;
  }
  let maxRow = 0;
  for (let y = 0; y < h; y++) if (rowCount[y] > maxRow) maxRow = rowCount[y];
  if (maxRow < Math.max(28, w * 0.05)) return null;
  const rowGate = Math.max(22, maxRow * 0.32);
  const rowOn = new Uint8Array(h);
  for (let y = 0; y < h; y++) if (rowCount[y] >= rowGate) rowOn[y] = 1;
  const rows = bridge(rowOn, Math.max(8, Math.round(h * 0.012)));
  if (rows[1] - rows[0] < h * 0.1) return null;

  const firstX: number[] = [];
  const lastX: number[] = [];
  for (let y = rows[0]; y <= rows[1]; y++) {
    const row = y * w;
    let left = -1;
    let right = -1;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      if (spread[i] <= 16 && std[i] <= 8 && luma[i] >= cut) {
        if (left < 0) left = x;
        right = x;
      }
    }
    if (left >= 0) {
      firstX.push(left);
      lastX.push(right);
    }
  }
  if (firstX.length < 12) return null;
  let x0 = percentile(firstX, 0.14);
  let x1 = percentile(lastX, 0.86);
  if (x1 - x0 < w * 0.12) return null;

  const firstY: number[] = [];
  const lastY: number[] = [];
  for (let x = x0; x <= x1; x += 2) {
    let top = -1;
    let bot = -1;
    for (let y = rows[0]; y <= rows[1]; y++) {
      const i = y * w + x;
      if (spread[i] <= 16 && std[i] <= 8 && luma[i] >= cut) {
        if (top < 0) top = y;
        bot = y;
      }
    }
    if (top >= 0) {
      firstY.push(top);
      lastY.push(bot);
    }
  }
  if (firstY.length < 8) return null;
  let y0 = percentile(firstY, 0.14);
  let y1 = percentile(lastY, 0.86);
  const padX = 2;
  const padY = 2;
  x0 = clamp(x0 + padX, 0, w - 1);
  x1 = clamp(x1 - padX, 0, w - 1);
  y0 = clamp(y0 + padY, 0, h - 1);
  y1 = clamp(y1 - padY, 0, h - 1);
  if (x1 - x0 < 24 || y1 - y0 < 24) return null;
  return { x0, y0, x1, y1, mode };
}

/** Fill short gaps so a line of text does not split the page. */
function bridge(on: Uint8Array, gap: number): [number, number] {
  const n = on.length;
  const filled = on.slice();
  let i = 0;
  while (i < n) {
    if (filled[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && !filled[i]) i++;
    if (start > 0 && i < n && i - start <= gap) {
      for (let k = start; k < i; k++) filled[k] = 1;
    }
  }
  let bestA = 0;
  let bestB = -1;
  let runA = -1;
  for (let y = 0; y <= n; y++) {
    if (y < n && filled[y]) {
      if (runA < 0) runA = y;
    } else if (runA >= 0) {
      if (y - runA > bestB - bestA + 1) {
        bestA = runA;
        bestB = y - 1;
      }
      runA = -1;
    }
  }
  return [bestA, bestB];
}

/** Follow the same sheet into its shade. A rough darker floor stops it. */
function extendSheet(
  tone: Float32Array,
  spread: Float32Array,
  std: Float32Array,
  w: number,
  h: number,
  box: PageBox,
) {
  const continues = (horizontal: boolean, at: number) => {
    const vals: number[] = [];
    const stds: number[] = [];
    let n = 0;
    const limit = horizontal ? box.x1 : box.y1;
    const start = horizontal ? box.x0 : box.y0;
    for (let p = start; p <= limit; p += 3) {
      const i = horizontal ? at * w + p : p * w + at;
      n++;
      if (spread[i] > 28) continue;
      vals.push(tone[i]);
      stds.push(std[i]);
    }
    if (vals.length < n * 0.42) return false;
    const med = percentile(vals, 0.55);
    const medStd = percentile(stds, 0.5);
    if (med < 130 || med < box.mode - 70) return false;
    if (medStd > 30 && med < box.mode - 10) return false;
    return true;
  };
  let guard = 0;
  while (box.y1 < h - 2 && continues(true, box.y1 + 1) && guard++ < h) box.y1++;
  if (box.y1 < h - 2) {
    const failAt = box.y1 + 1;
    const vals: number[] = [];
    for (let x = box.x0; x <= box.x1; x += 3) {
      const i = failAt * w + x;
      if (i < 0 || i >= tone.length || spread[i] > 28) continue;
      vals.push(tone[i]);
    }
    const med = vals.length ? percentile(vals, 0.55) : 0;
    if (box.x1 - box.x0 > w * 0.95 && box.y1 > h * 0.5 && med > 165) box.y1 = h - 1;
  }
  guard = 0;
  while (box.y0 > 1 && continues(true, box.y0 - 1) && guard++ < h) box.y0--;
  guard = 0;
  while (box.y0 > 1 && guard < 42) {
    const y = box.y0 - 1;
    const vals: number[] = [];
    const stds: number[] = [];
    for (let x = box.x0; x <= box.x1; x += 3) {
      const i = y * w + x;
      if (spread[i] > 28) continue;
      vals.push(tone[i]);
      stds.push(std[i]);
    }
    if (vals.length < 8) break;
    const med = percentile(vals, 0.55);
    const medStd = percentile(stds, 0.5);
    if (med < box.mode - 34 || medStd > 26) break;
    box.y0 = y;
    guard++;
  }
  guard = 0;
  while (box.x1 < w - 2 && continues(false, box.x1 + 1) && guard++ < w) box.x1++;
  guard = 0;
  while (box.x0 > 1 && continues(false, box.x0 - 1) && guard++ < w) box.x0--;
}

/**
 * Cut a darker desk off at a straight brightness step.
 * A table rule has the same paper on both sides, so the page stays whole.
 */
function clipDesk(tone: Float32Array, w: number, box: PageBox) {
  const median = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 < x0 || y1 < y0) return -1;
    const vals: number[] = [];
    for (let y = y0; y <= y1; y += 6) {
      const row = y * w;
      for (let x = x0; x <= x1; x += 4) vals.push(tone[row + x]);
    }
    return vals.length ? percentile(vals, 0.5) : -1;
  };
  const yA = Math.round(box.y0 + (box.y1 - box.y0) * 0.12);
  const yB = Math.round(box.y1 - (box.y1 - box.y0) * 0.12);
  const lefts: number[] = [];
  const jumpLimit = Math.round(box.x0 + (box.x1 - box.x0) * 0.3);
  for (let y = yA; y <= yB; y += 4) {
    const row = y * w;
    for (let x = box.x0 + 6; x < jumpLimit; x++) {
      let left = 0;
      let right = 0;
      let n = 0;
      for (let k = 2; k <= 10; k += 2) {
        left += tone[row + Math.max(0, x - k)];
        right += tone[row + Math.min(w - 1, x + k)];
        n++;
      }
      const l = left / n;
      const r = right / n;
      if (r - l > 14 && l < box.mode - 14 && r > box.mode - 18) {
        lefts.push(x);
        break;
      }
    }
  }
  const need = Math.max(8, Math.round((yB - yA) / 4 * 0.4));
  const edgeOf = (xs: number[]) => {
    const bins = new Int32Array(Math.max(1, Math.ceil(w / 8)));
    for (const x of xs) bins[Math.min(bins.length - 1, Math.floor(x / 8))]++;
    let best = 0;
    let bestAt = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > best) {
        best = bins[i];
        bestAt = i;
      }
    }
    return { edge: bestAt * 8 + 4, share: xs.length ? best / xs.length : 0 };
  };
  const leftEdge = edgeOf(lefts);
  if (lefts.length >= need && leftEdge.share >= 0.22) {
    const edge = leftEdge.edge;
    const desk = median(box.x0, yA, edge - 8, yB);
    const paper = median(edge + 8, yA, Math.min(box.x1, edge + 48), yB);
    if (desk >= 0 && paper > desk + 10) box.x0 = Math.min(box.x1 - 40, edge + 3);
  }
  const rights: number[] = [];
  const rightStart = Math.round(box.x1 - (box.x1 - box.x0) * 0.32);
  for (let y = yA; y <= yB; y += 4) {
    const row = y * w;
    for (let x = box.x1 - 6; x > rightStart; x--) {
      let left = 0;
      let right = 0;
      let n = 0;
      for (let k = 2; k <= 10; k += 2) {
        left += tone[row + Math.max(0, x - k)];
        right += tone[row + Math.min(w - 1, x + k)];
        n++;
      }
      const l = left / n;
      const r = right / n;
      if (l - r > 14 && r < box.mode - 14 && l > box.mode - 18) {
        rights.push(x);
        break;
      }
    }
  }
  const rightEdge = edgeOf(rights);
  if (rights.length >= need && rightEdge.share >= 0.22) {
    const edge = rightEdge.edge;
    const desk = median(edge + 8, yA, box.x1, yB);
    const paper = median(Math.max(box.x0, edge - 48), yA, edge - 8, yB);
    if (desk >= 0 && paper > desk + 10) box.x1 = Math.max(box.x0 + 40, edge - 3);
  }
}

/** Portrait pixels, grown a short way into the photo's own backdrop, not onto the card. */
function photoMask(
  tone: Float32Array,
  spread: Float32Array,
  std: Float32Array,
  w: number,
  h: number,
  box: PageBox,
) {
  const nPix = w * h;
  const seen = new Uint8Array(nPix);
  const members = new Int32Array(nPix);
  const seed = new Float32Array(nPix);
  for (let y = box.y0; y <= box.y1; y += 2) {
    const row = y * w;
    for (let x = box.x0; x <= box.x1; x += 2) {
      const start = row + x;
      if (seen[start] || spread[start] < 22) continue;
      let n = 0;
      let head = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      members[n++] = start;
      seen[start] = 1;
      while (head < n) {
        const i = members[head++];
        const cx = i % w;
        const cy = (i - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -2; dy <= 2; dy += 2) {
          const ny = cy + dy;
          if (ny < box.y0 || ny > box.y1) continue;
          const nrow = ny * w;
          for (let dx = -2; dx <= 2; dx += 2) {
            const nx = cx + dx;
            if (nx < box.x0 || nx > box.x1) continue;
            const j = nrow + nx;
            if (seen[j] || spread[j] < 16) continue;
            seen[j] = 1;
            members[n++] = j;
          }
        }
      }
      if (n < 220 || maxX - minX < 44 || maxY - minY < 44) continue;
      for (let k = 0; k < n; k++) seed[members[k]] = 1;
    }
  }
  const dilated = maxFilter(seed, w, h, 16);
  const photo = new Uint8Array(nPix);
  for (let i = 0; i < nPix; i++) {
    if (seed[i]) {
      photo[i] = 1;
      continue;
    }
    if (dilated[i] < 1) continue;
    if (spread[i] <= 12 && std[i] <= 6 && tone[i] >= box.mode - 8) continue;
    photo[i] = 1;
  }
  return photo;
}

export function applyDocFilter(src: HTMLCanvasElement, filter: DocScanFilter): HTMLCanvasElement {
  if (filter === 'original') return cloneCanvas(src);
  const read = readPixels(src);
  if (!read) return cloneCanvas(src);
  const { out, ctx, img } = read;
  const d = img.data;
  const w = out.width;
  const h = out.height;
  const nPix = w * h;
  const tone = new Float32Array(nPix);
  const spread = new Float32Array(nPix);
  for (let i = 0, p = 0; i < nPix; i++, p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    tone[i] = luma(r, g, b);
    spread[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const std = localStd(tone, w, h, 3);
  const box = pageBox(tone, spread, std, w, h);
  if (!box) return out;
  extendSheet(tone, spread, std, w, h, box);
  clipDesk(tone, w, box);
  const photo = photoMask(tone, spread, std, w, h, box);
  const sheet = boxBlur(tone, w, h, 8);
  const mode: CleanMode = filter === 'gray' ? 'gray' : filter === 'light' ? 'light' : filter === 'whiteboard' ? 'whiteboard' : 'auto';
  cleanSheet(d, w, mode, box, tone, spread, sheet, photo);
  ctx.putImageData(img, 0, 0);
  return out;
}

function localStd(src: Float32Array, w: number, h: number, radius: number) {
  const mean = boxBlur(src, w, h, radius);
  const sq = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) sq[i] = src[i] * src[i];
  const meanSq = boxBlur(sq, w, h, radius);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = meanSq[i] - mean[i] * mean[i];
    out[i] = Math.sqrt(v > 0 ? v : 0);
  }
  return out;
}

/**
 * Inside the page, paper close to the local sheet becomes white.
 * Writing is scaled darker, so the letter shape stays. A portrait stays.
 */
function cleanSheet(
  d: Uint8ClampedArray,
  w: number,
  mode: CleanMode,
  box: PageBox,
  tone: Float32Array,
  spread: Float32Array,
  sheet: Float32Array,
  photo: Uint8Array,
) {
  const whiteRel = mode === 'light' ? 0.96 : mode === 'whiteboard' ? 0.9 : 0.93;
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * w;
    for (let x = box.x0; x <= box.x1; x++) {
      const at = row + x;
      if (photo[at]) continue;
      if (spread[at] > 22) continue;
      const t = tone[at];
      const bg = Math.max(24, sheet[at]);
      const rel = t / bg;
      const i = at * 4;
      if (rel >= whiteRel && t >= box.mode - 58 && t >= 145) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        continue;
      }
      if (rel > 0.9 || bg < box.mode - 34 || t > bg - 10) continue;
      const gain = mode === 'whiteboard'
        ? (rel < 0.72 ? 0.05 : 0.22)
        : mode === 'light'
          ? clamp(0.55 + rel * 0.4, 0.42, 0.88)
          : mode === 'gray'
            ? clamp(Math.pow(rel, 1.3), 0.12, 0.6)
            : clamp(Math.pow(rel, 1.4), 0.15, 0.55);
      if (mode === 'gray') {
        const v = clamp(t * gain, 0, 255);
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        d[i] = clamp(d[i] * gain, 0, 255);
        d[i + 1] = clamp(d[i + 1] * gain, 0, 255);
        d[i + 2] = clamp(d[i + 2] * gain, 0, 255);
      }
    }
  }
}
