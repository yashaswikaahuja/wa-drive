/**
 * Document filters matching Adobe Scan: Original, Auto, Light text,
 * Grayscale, and Whiteboard. Each run starts from the unfiltered photo.
 *
 * Auto estimates the page's slow illumination and lifts the paper toward
 * white with one capped gain. Writing, including faint ink and anti-aliased
 * edges, keeps its ratio to that paper. Nothing is forced to pure white.
 * The page is one straight rectangle, so a desk or a concrete floor outside
 * it stays as photographed, and so does a portrait.
 */
import { cloneCanvas } from './documentPrintLayout';
import { paperMap } from './docPaperMap';

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
    if (med < 95 || med < box.mode - 90) return false;
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
  // The heading is a dark line on the sheet, so its local deviation is high
  // and the shade walk stops under it. Keep climbing while the middle of
  // the row is still paper, writing, or the printed border.
  const climbCap = Math.round(h * 0.22);
  guard = 0;
  while (box.y0 > 1 && guard < climbCap && pageRow(tone, spread, std, w, box, box.y0 - 1)) {
    box.y0--;
    guard++;
  }
  guard = 0;
  while (box.x1 < w - 2 && continues(false, box.x1 + 1) && guard++ < w) box.x1++;
  guard = 0;
  while (box.x0 > 1 && continues(false, box.x0 - 1) && guard++ < w) box.x0--;
}

/** Center of one row: bright paper, writing, or the printed border ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â not the desk. */
function pageRow(
  tone: Float32Array,
  spread: Float32Array,
  std: Float32Array,
  w: number,
  box: PageBox,
  y: number,
) {
  const span = box.x1 - box.x0;
  const a = box.x0 + Math.round(span * 0.18);
  const b = Math.max(a, box.x0 + Math.round(span * 0.82));
  let n = 0;
  let ink = 0;
  let bright = 0;
  const vals: number[] = [];
  const stds: number[] = [];
  for (let x = a; x <= b; x += 2) {
    const i = y * w + x;
    n++;
    const t = tone[i];
    const sp = spread[i];
    if (sp <= 36) {
      vals.push(t);
      stds.push(std[i]);
    }
    if (t < box.mode - 55 && sp < 55) ink++;
    if (t >= box.mode - 16 && sp <= 20 && std[i] <= 16) bright++;
  }
  if (n < 8) return false;
  const med = vals.length ? percentile(vals, 0.5) : 0;
  const medStd = stds.length ? percentile(stds, 0.5) : 99;
  const inkF = ink / n;
  const brightF = bright / n;
  const roughBlank = medStd > 30 && inkF < 0.07 && med < box.mode - 10;
  const grayDesk = inkF < 0.03 && brightF < 0.22 && med < box.mode - 18;
  if (roughBlank || grayDesk) return false;
  if (brightF > 0.42 || med >= box.mode - 20) return true;
  if (inkF > 0.03 && brightF > 0.12) return true;
  if (inkF > 0.2 && med < box.mode - 50) return true;
  if (inkF > 0.15 && med >= box.mode - 42) return true;
  if (inkF > 0.22 && med > 100) return true;
  return false;
}

type Band = { n: number; ink: number; bright: number; med: number; medStd: number };

/** A smooth strip darker than the sheet, with almost no writing. */
function deskBand(box: PageBox, band: Band) {
  if (band.n < 6) return false;
  if (band.ink > 0.055) return false;
  if (band.bright > 0.28) return false;
  if (band.medStd > 22) return false;
  return band.med < box.mode - 16;
}

/**
 * Pull a gray margin back off the page. The shade walk treats that margin
 * as more paper. Stop at the printed border or at bright paper, and do
 * nothing if the page edge is not found inside the cap.
 */
function shrinkMargins(
  tone: Float32Array,
  spread: Float32Array,
  std: Float32Array,
  w: number,
  h: number,
  box: PageBox,
) {
  const bandOf = (x0: number, y0: number, x1: number, y1: number, stepX: number, stepY: number): Band => {
    let n = 0;
    let ink = 0;
    let bright = 0;
    const vals: number[] = [];
    const stds: number[] = [];
    for (let y = y0; y <= y1; y += stepY) {
      const row = y * w;
      for (let x = x0; x <= x1; x += stepX) {
        const i = row + x;
        n++;
        const t = tone[i];
        const sp = spread[i];
        if (sp <= 36) {
          vals.push(t);
          stds.push(std[i]);
        }
        if (t < box.mode - 55 && sp < 55) ink++;
        if (t >= box.mode - 16 && sp <= 20 && std[i] <= 16) bright++;
      }
    }
    return {
      n,
      ink: n ? ink / n : 0,
      bright: n ? bright / n : 0,
      med: vals.length ? percentile(vals, 0.5) : 255,
      medStd: stds.length ? percentile(stds, 0.5) : 0,
    };
  };
  const yA = Math.round(box.y0 + (box.y1 - box.y0) * 0.12);
  const yB = Math.round(box.y0 + (box.y1 - box.y0) * 0.62);
  const xCap = Math.max(8, Math.round((box.x1 - box.x0) * 0.26));
  let x = box.x0;
  const xStop = Math.min(box.x1 - 40, box.x0 + xCap);
  while (x < xStop && deskBand(box, bandOf(x, yA, x, yB, 1, 3))) x++;
  if (x > box.x0 && x < xStop) box.x0 = x;
  x = box.x1;
  const xStopR = Math.max(box.x0 + 40, box.x1 - xCap);
  while (x > xStopR && deskBand(box, bandOf(x, yA, x, yB, 1, 3))) x--;
  if (x < box.x1 && x > xStopR) box.x1 = x;

  const span = box.x1 - box.x0;
  const cx0 = box.x0 + Math.round(span * 0.2);
  const cx1 = Math.max(cx0, box.x0 + Math.round(span * 0.8));
  const yCap = Math.max(8, Math.round(h * 0.28));
  let y = box.y0;
  const yStop = Math.min(box.y1 - 40, box.y0 + yCap);
  while (y < yStop && deskBand(box, bandOf(cx0, y, cx1, y, 3, 1))) y++;
  if (y > box.y0 && y < yStop) box.y0 = y;
  const fullWidth = box.x1 - box.x0 > w * 0.94 && box.y1 > h * 0.9;
  if (fullWidth) return;
  y = box.y1;
  const yStopB = Math.max(box.y0 + 40, box.y1 - yCap);
  while (y > yStopB && deskBand(box, bandOf(cx0, y, cx1, y, 3, 1))) y--;
  if (y < box.y1 && y > yStopB) box.y1 = y;
}

/**
 * The colorful seed can miss a dark, gray part of the photo (a shirt, hair
 * at the edge). Push each side out while that edge line is still mostly
 * photo, and stop at the first line that is mostly plain card.
 */
function growToPhotoEdge(
  tone: Float32Array,
  spread: Float32Array,
  w: number,
  box: PageBox,
  r: [number, number, number, number],
): [number, number, number, number] {
  let [x0, y0, x1, y1] = r;
  const isCard = (i: number) => spread[i] <= 16 && tone[i] >= box.mode - 45;
  const rowIsPhoto = (y: number) => {
    let n = 0;
    let card = 0;
    for (let x = x0; x <= x1; x += 2) {
      n++;
      if (isCard(y * w + x)) card++;
    }
    return n > 0 && card / n < 0.5;
  };
  const colIsPhoto = (x: number) => {
    let n = 0;
    let card = 0;
    for (let y = y0; y <= y1; y += 2) {
      n++;
      if (isCard(y * w + x)) card++;
    }
    return n > 0 && card / n < 0.5;
  };
  const capY = Math.round((y1 - y0) * 0.3);
  const capX = Math.round((x1 - x0) * 0.3);
  for (let k = 0; k < capY && y1 < box.y1 && rowIsPhoto(y1 + 1); k++) y1++;
  for (let k = 0; k < capY && y0 > box.y0 && rowIsPhoto(y0 - 1); k++) y0--;
  for (let k = 0; k < capX && x1 < box.x1 && colIsPhoto(x1 + 1); k++) x1++;
  for (let k = 0; k < capX && x0 > box.x0 && colIsPhoto(x0 - 1); k++) x0--;
  return [x0, y0, x1, y1];
}

/** Margin kept around a detected photo's rectangle, in px. */
const PHOTO_RIM_PX = 1;

/** ID-photo rectangles on the card, each with a thin rim. */
function photoMask(
  tone: Float32Array,
  spread: Float32Array,
  w: number,
  h: number,
  box: PageBox,
) {
  const nPix = w * h;
  const seen = new Uint8Array(nPix);
  const members = new Int32Array(nPix);
  const rects: [number, number, number, number][] = [];
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
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (n < 220 || bw < 44 || bh < 44) continue;
      const aspect = bw / bh;
      if (aspect < 0.55 || aspect > 1.8) continue;
      const area = (bw + 1) * (bh + 1);
      const fill = (n * 4) / area;
      if (fill < 0.34) continue;
      // An ID photo is a small part of the page. A larger colorful region is a
      // tinted sheet or a printed banner, and protecting it leaves a gray block.
      if (bw > (box.x1 - box.x0) * 0.4 || bh > (box.y1 - box.y0) * 0.4) continue;
      const r = growToPhotoEdge(tone, spread, w, box, [minX, minY, maxX, maxY]);
      // A real photo covers its rectangle. Plain card inside it means this is
      // a printed graphic on the sheet, which should be cleaned like the page.
      let cells = 0;
      let card = 0;
      let white = 0;
      for (let yy = r[1]; yy <= r[3]; yy += 2) {
        for (let xx = r[0]; xx <= r[2]; xx += 2) {
          const q = yy * w + xx;
          cells++;
          if (spread[q] <= 16 && tone[q] >= box.mode - 45) card++;
          if (spread[q] <= 12 && tone[q] >= box.mode - 15) white++;
        }
      }
      if (card > cells * 0.25 || white > cells * 0.05) continue;
      rects.push(r);
    }
  }
  // An ID photo is a rectangle. Protect the whole rectangle so its pale
  // backdrop is not half whitened, plus a thin rim. A wider grown margin
  // left a visible gray frame of uncleaned card around the photo.
  const photo = new Uint8Array(nPix);
  for (const [rx0, ry0, rx1, ry1] of rects) {
    const ya = Math.max(0, ry0 - PHOTO_RIM_PX);
    const yb = Math.min(h - 1, ry1 + PHOTO_RIM_PX);
    const xa = Math.max(0, rx0 - PHOTO_RIM_PX);
    const xb = Math.min(w - 1, rx1 + PHOTO_RIM_PX);
    for (let y = ya; y <= yb; y++) photo.fill(1, y * w + xa, y * w + xb + 1);
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
  const chan: [Float32Array, Float32Array, Float32Array] = [
    new Float32Array(nPix),
    new Float32Array(nPix),
    new Float32Array(nPix),
  ];
  for (let i = 0, p = 0; i < nPix; i++, p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    chan[0][i] = r;
    chan[1][i] = g;
    chan[2][i] = b;
    tone[i] = luma(r, g, b);
    spread[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const std = localStd(tone, w, h, 3);
  const box = pageBox(tone, spread, std, w, h);
  if (!box) return out;
  extendSheet(tone, spread, std, w, h, box);
  shrinkMargins(tone, spread, std, w, h, box);
  const backdrop = growToBackdrop(tone, w, h, box);
  const photo = photoMask(tone, spread, w, h, box);
  // Per-channel slow paper color. Correcting each of R/G/B against its own
  // field removes the paper's color cast (a cool-gray sheet lands on neutral
  // white), not only its brightness. High-chroma ink is left out of the
  // estimate so it cannot tint the paper and halo the print beside it.
  const paper = paperMap(chan, tone, spread, w, h, box, photo);
  const mode: CleanMode = filter === 'gray' ? 'gray' : filter === 'light' ? 'light' : filter === 'whiteboard' ? 'whiteboard' : 'auto';
  const stroke = Math.max(4, Math.round(Math.min(box.x1 - box.x0, box.y1 - box.y0) / 110));
  cleanSheet(d, w, mode, box, tone, paper, photo, backdrop, boxBlur(tone, w, h, 1), boxBlur(tone, w, h, stroke));
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * A sheet on a dark cloth or sofa: the shade walk stops at a shadowed half
 * or a colored header, leaving a hard seam where correction ends. When the
 * photo border is much darker than the paper, keep pushing each side out
 * while most of the line is still brighter than that backdrop.
 * Returns the luma that separates sheet from backdrop, or 0 when there is
 * no clear dark backdrop (nothing is grown then).
 */
function growToBackdrop(tone: Float32Array, w: number, h: number, box: PageBox) {
  const fx = Math.max(2, Math.round(w * 0.03));
  const fy = Math.max(2, Math.round(h * 0.03));
  const frame: number[] = [];
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      if (x >= fx && x < w - fx && y >= fy && y < h - fy) continue;
      if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) continue;
      frame.push(tone[y * w + x]);
    }
  }
  if (frame.length < 40) return 0;
  const back = percentile(frame, 0.5);
  // The border is paper too (a sheet shot edge to edge, or a scan): the
  // box missed a dimmer strip, so take the whole image, or that strip stays
  // gray behind a hard line. The paper map fills it like any other paper.
  if (back >= box.mode - 45 && percentile(frame, 0.15) >= box.mode - 70) {
    box.x0 = 0;
    box.y0 = 0;
    box.x1 = w - 1;
    box.y1 = h - 1;
    return 0;
  }
  if (box.mode - back < 90) return 0;
  const cut = back + (box.mode - back) * 0.35;
  const sheet = (horizontal: boolean, at: number) => {
    let n = 0;
    let on = 0;
    const a = horizontal ? box.x0 : box.y0;
    const b = horizontal ? box.x1 : box.y1;
    for (let p = a; p <= b; p += 3) {
      n++;
      if (tone[horizontal ? at * w + p : p * w + at] > cut) on++;
    }
    return n > 0 && on >= n * 0.55;
  };
  // A dark printed band (a blue header strip, a thick rule) fails one line
  // but the sheet continues past it, so look a short way ahead.
  const step = (horizontal: boolean, from: number, dir: number, end: number) => {
    const gap = Math.round((horizontal ? h : w) * 0.06);
    for (let k = 1; k <= gap; k++) {
      const at = from + dir * k;
      if (dir < 0 ? at < end : at > end) break;
      if (sheet(horizontal, at)) return at;
    }
    return from;
  };
  // Twice: widening one side lengthens the lines the other sides test.
  for (let pass = 0; pass < 2; pass++) {
    for (let at = step(true, box.y0, -1, 0); at !== box.y0; at = step(true, box.y0, -1, 0)) box.y0 = at;
    for (let at = step(true, box.y1, 1, h - 1); at !== box.y1; at = step(true, box.y1, 1, h - 1)) box.y1 = at;
    for (let at = step(false, box.x0, -1, 0); at !== box.x0; at = step(false, box.x0, -1, 0)) box.x0 = at;
    for (let at = step(false, box.x1, 1, w - 1); at !== box.x1; at = step(false, box.x1, 1, w - 1)) box.x1 = at;
  }
  return cut;
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
 * Divide each page pixel by its own paper color, per channel. A cool-gray
 * sheet lands on neutral white because each of R/G/B is lifted by its own
 * gain, not one shared luma gain. A letter keeps its ratio to that paper, so
 * an anti-aliased rim stays gray instead of snapping white, and nothing is
 * forced to pure white. Colored ink takes the same paper correction and keeps
 * only its residual, so a stamp or rule no longer looks dirty beside clean
 * paper. Whiteboard then darkens ink cores only and leaves those rims alone.
 */
function cleanSheet(
  d: Uint8ClampedArray,
  w: number,
  mode: CleanMode,
  box: PageBox,
  tone: Float32Array,
  paper: [Float32Array, Float32Array, Float32Array],
  photo: Uint8Array,
  backdrop: number,
  blur: Float32Array,
  wide: Float32Array,
) {
  const target = mode === 'light' ? 236 : 252;
  const maxGain = mode === 'light' ? 1.28 : 1.65;
  const [pr, pg, pb] = paper;
  // Layer 2, the writing. After the paper is even, set levels against it:
  // anything within a few percent of paper becomes paper (grain, faint
  // shadow), ink is pulled down to a solid dark, and a light unsharp mask
  // firms up soft letter edges. Whiteboard has its own ink step.
  const ink = mode !== 'whiteboard';
  const black = mode === 'light' ? 0.12 : 0.24;
  const white = mode === 'light' ? 0.95 : 0.9;
  const gamma = mode === 'light' ? 1 : 1.2;
  const sharpen = mode === 'light' ? 0.5 : 0.9;
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y * w;
    for (let x = box.x0; x <= box.x1; x++) {
      const at = row + x;
      const isPhoto = photo[at] === 1;
      // A photo takes the same light correction as the paper around it (so a
      // shaded picture does not stay a dark block) but no ink processing.
      if (isPhoto && mode === 'gray') continue;
      const bgL = 0.299 * pr[at] + 0.587 * pg[at] + 0.114 * pb[at];
      // No skip gate: the paper map is already filled in under dense text and
      // logos, so every page pixel is corrected and no gray block is left.
      if (bgL < 40) continue;
      // Per-channel gain: target / this channel's paper color, each capped so
      // a dark divisor cannot explode. The ratio between the three gains is
      // what removes the paper's color cast.
      // On a dark backdrop the box corners hold some cloth; it and the darkest
      // ink keep their level instead of being lifted with the paper.
      let lift = 1;
      if (backdrop > 0) {
        const u = clamp((tone[at] - backdrop + 20) / 50, 0, 1);
        lift = u * u * (3 - 2 * u);
      }
      const gr = 1 + (clamp(target / Math.max(pr[at], 48), 1, maxGain) - 1) * lift;
      const gg = 1 + (clamp(target / Math.max(pg[at], 48), 1, maxGain) - 1) * lift;
      const gb = 1 + (clamp(target / Math.max(pb[at], 48), 1, maxGain) - 1) * lift;
      let scale = 1;
      if (mode === 'whiteboard' && !isPhoto) {
        const rel = tone[at] / Math.max(bgL, 48);
        if (rel < 0.82) {
          const u = clamp((rel - 0.58) / 0.24, 0, 1);
          const s = u * u * (3 - 2 * u);
          scale = 0.42 + 0.58 * s;
        }
      }
      const i = at * 4;
      let nr = clamp(Math.round(d[i] * gr * scale), 0, 255);
      let ng = clamp(Math.round(d[i + 1] * gg * scale), 0, 255);
      let nb = clamp(Math.round(d[i + 2] * gb * scale), 0, 255);
      if (ink && !isPhoto) {
        const lc = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        const gl = 0.299 * gr + 0.587 * gg + 0.114 * gb;
        const ls = lc + sharpen * (tone[at] - blur[at]) * gl;
        // Levels against what this spot's paper actually became: in a deep
        // shadow the gain cap leaves paper below target, and measuring
        // against target would read that paper as ink and blotch it.
        const ref = clamp(bgL * gl * scale, 40, target);
        const u = clamp((ls / ref - black) / (white - black), 0, 1);
        const want = Math.pow(u, gamma) * target;
        let s = want / Math.max(lc, 1);
        // Strong color (a stamp, a red title) darkens less so it does not go muddy.
        // Color relative to this spot's own paper, so a warm shadow or a
        // yellowed sheet is not mistaken for colored ink.
        const qr = d[i] / Math.max(pr[at], 1);
        const qg = d[i + 1] / Math.max(pg[at], 1);
        const qb = d[i + 2] / Math.max(pb[at], 1);
        const qm = Math.max(qr, qg, qb);
        const sp = qm > 0 ? ((qm - Math.min(qr, qg, qb)) / qm) * Math.min(lc * 1.4, 255) : 0;
        if (s < 1) s = 1 - (1 - s) * (1 - 0.6 * clamp(sp / 90, 0, 1));
        if (s < 1) {
          // Only thin strokes are ink. A wide dark area (a shirt in an
          // unmasked photo, a filled box) keeps its level instead of going black.
          const depth = bgL - tone[at];
          const ratio = depth > 8 ? (bgL - wide[at]) / depth : 0;
          const t = clamp((ratio - 0.55) / 0.35, 0, 1);
          s = 1 - (1 - s) * (1 - t * t * (3 - 2 * t));
        }
        if (s >= 1) {
          // Brighten toward white, not by scaling: scaling would also scale
          // any leftover cast and turn warm paper yellow. Skip the backdrop.
          const k = lift * clamp((want - lc) / Math.max(255 - lc, 1), 0, 1) * (1 - clamp((sp - 45) / 50, 0, 1));
          nr = Math.round(nr + (255 - nr) * k);
          ng = Math.round(ng + (255 - ng) * k);
          nb = Math.round(nb + (255 - nb) * k);
        } else {
          // Ink always darkens; dark cloth caught in a corner only gets darker.
          nr = clamp(Math.round(nr * s), 0, 255);
          ng = clamp(Math.round(ng * s), 0, 255);
          nb = clamp(Math.round(nb * s), 0, 255);
        }
        if (sp >= 25 && s < 1) {
          // Colored text, stamps, tricolor bands: a phone photo dulls them,
          // so push chroma back out around the pixel's own luma.
          const boost = 1 + (mode === 'light' ? 0.25 : 0.5) * clamp((sp - 25) / 50, 0, 1) * lift;
          const l = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          nr = clamp(Math.round(l + (nr - l) * boost), 0, 255);
          ng = clamp(Math.round(l + (ng - l) * boost), 0, 255);
          nb = clamp(Math.round(l + (nb - l) * boost), 0, 255);
        }
      }
      if (mode === 'gray') {
        const v = clamp(Math.round(0.299 * nr + 0.587 * ng + 0.114 * nb), 0, 255);
        d[i] = d[i + 1] = d[i + 2] = v;
      } else {
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    }
  }
}
