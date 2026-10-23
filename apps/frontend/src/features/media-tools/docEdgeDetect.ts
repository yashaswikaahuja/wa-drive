/**
 * Find the document in a phone photo and straighten it (#346).
 *
 * Detection runs on a small copy of the photo:
 *  1. Sobel gradients, then a Hough transform votes for straight lines.
 *     Each edge pixel votes only near its own gradient direction.
 *  2. The strongest near-horizontal and near-vertical lines are kept,
 *     plus the four photo borders (for a page that runs off the frame).
 *  3. Every top/bottom/left/right combination forms a quad. A quad is
 *     scored by the brightness step across its edges: paper inside is
 *     brighter than the background outside. A printed rule has paper on
 *     both sides, so it scores ~0 and cannot be mistaken for the page edge.
 *  4. The best quad must have at least two real (non-border) edges and a
 *     clear step. Otherwise null, and the operator crops by hand.
 *     A quad that already fills the frame also returns null.
 *
 * Corners are normalized 0..1 in tl, tr, br, bl order.
 */

export type QuadPoint = { x: number; y: number };

const DETECT_MAX = 400;
/** Step credited to a photo-border edge: wins only when no real edge is clear. */
const BORDER_STEP = 14;

type Line = { theta: number; rho: number; votes: number; border: boolean };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function polyArea(q: QuadPoint[]) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvex(q: QuadPoint[]) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (!sign) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

function intersect(a: Line, b: Line): QuadPoint | null {
  const ca = Math.cos(a.theta);
  const sa = Math.sin(a.theta);
  const cb = Math.cos(b.theta);
  const sb = Math.sin(b.theta);
  const det = ca * sb - sa * cb;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.rho * sb - b.rho * sa) / det, y: (ca * b.rho - cb * a.rho) / det };
}

export function detectDocumentQuad(src: HTMLCanvasElement): QuadPoint[] | null {
  if (!src.width || !src.height) return null;
  const s = Math.min(1, DETECT_MAX / Math.max(src.width, src.height));
  const w = Math.max(16, Math.round(src.width * s));
  const h = Math.max(16, Math.round(src.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const n = w * h;

  // Luma, 3x3 blur.
  const raw = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) raw[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  const lum = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = clamp(y + dy, 0, h - 1) * w;
        for (let dx = -1; dx <= 1; dx++) acc += raw[yy + clamp(x + dx, 0, w - 1)];
      }
      lum[y * w + x] = acc / 9;
    }
  }

  // 1. Sobel; keep the strongest ~10% as edge pixels.
  const mag = new Float32Array(n);
  const ang = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const gy =
        lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      mag[i] = Math.hypot(gx, gy);
      ang[i] = Math.atan2(gy, gx);
    }
  }
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const cut = Math.max(40, sorted[Math.floor(sorted.length * 0.9)]);

  const T = 180;
  const diag = Math.ceil(Math.hypot(w, h));
  const R = diag * 2 + 1;
  const acc = new Float32Array(T * R);
  const cosT = new Float32Array(T);
  const sinT = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    cosT[t] = Math.cos((t * Math.PI) / T);
    sinT[t] = Math.sin((t * Math.PI) / T);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] < cut) continue;
      let deg = Math.round((ang[i] * 180) / Math.PI);
      deg = ((deg % 180) + 180) % 180;
      for (let k = -8; k <= 8; k++) {
        const t = (deg + k + T) % T;
        const r = Math.round(x * cosT[t] + y * sinT[t]) + diag;
        acc[t * R + r] += 1;
      }
    }
  }

  // 2. Peaks with non-maximum suppression.
  const minVotes = Math.min(w, h) * 0.12;
  const horiz: Line[] = [];
  const vert: Line[] = [];
  for (let k = 0; k < 40 && (horiz.length < 8 || vert.length < 8); k++) {
    let best = 0;
    let bi = -1;
    for (let i = 0; i < acc.length; i++) if (acc[i] > best) { best = acc[i]; bi = i; }
    if (bi < 0 || best < minVotes) break;
    const t = Math.floor(bi / R);
    const r = (bi % R) - diag;
    for (let dt = -6; dt <= 6; dt++) {
      const tt = (t + dt + T) % T;
      for (let dr = -8; dr <= 8; dr++) {
        const rr = r + dr + diag;
        if (rr >= 0 && rr < R) acc[tt * R + rr] = 0;
      }
    }
    // Also the wrapped twin (theta ~ 0 and ~180 are the same line, rho flipped).
    if (t < 6 || t > T - 7) {
      const tw = (T - t) % T;
      for (let dt = -6; dt <= 6; dt++) {
        const tt = (tw + dt + T) % T;
        for (let dr = -8; dr <= 8; dr++) {
          const rr = -r + dr + diag;
          if (rr >= 0 && rr < R) acc[tt * R + rr] = 0;
        }
      }
    }
    const deg = t;
    let theta = (t * Math.PI) / T;
    let rho = r;
    if (deg >= 60 && deg <= 120) {
      if (horiz.length < 8) horiz.push({ theta, rho, votes: best, border: false });
    } else if (deg <= 30 || deg >= 150) {
      if (deg >= 150) { theta -= Math.PI; rho = -rho; }
      if (vert.length < 8) vert.push({ theta, rho, votes: best, border: false });
    }
  }
  horiz.push({ theta: Math.PI / 2, rho: 0.5, votes: 0, border: true });
  horiz.push({ theta: Math.PI / 2, rho: h - 1.5, votes: 0, border: true });
  vert.push({ theta: 0, rho: 0.5, votes: 0, border: true });
  vert.push({ theta: 0, rho: w - 1.5, votes: 0, border: true });

  const yAt = (l: Line, x: number) => (l.rho - x * Math.cos(l.theta)) / Math.sin(l.theta);
  const xAt = (l: Line, y: number) => (l.rho - y * Math.sin(l.theta)) / Math.cos(l.theta);
  const lumAt = (x: number, y: number) => lum[clamp(Math.round(y), 0, h - 1) * w + clamp(Math.round(x), 0, w - 1)];
  /** How far outside an edge to look for paper (content lines have paper nearby). */
  const reach = Math.max(12, Math.round(Math.min(w, h) * 0.1));

  // 3. Brightness step across one edge (inside minus outside).
  // A page edge has background along its whole length, so the step must be
  // consistent. Text above an underline has gaps between letters and words,
  // so its step is not. Returns the median step, or -1 when inconsistent.
  const edgeStep = (a: QuadPoint, b: QuadPoint, cx: number, cy: number, border: boolean) => {
    if (border) return BORDER_STEP;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    let nx = -ey / len;
    let ny = ex / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
    const steps: number[] = [];
    let busy = 0;
    const N = 40;
    for (let k = 1; k < N; k++) {
      const f = 0.06 + (0.88 * k) / N;
      const px = a.x + ex * f;
      const py = a.y + ey * f;
      let inside = 0;
      let outside = 0;
      let off = false;
      for (let o = 2; o <= 6; o++) {
        const ox = px - nx * o;
        const oy = py - ny * o;
        if (ox < 0 || oy < 0 || ox > w - 1 || oy > h - 1) { off = true; break; }
        inside += lumAt(px + nx * o, py + ny * o);
        outside += lumAt(ox, oy);
      }
      // Paper-bright pixels just outside mean this line runs through content
      // (an underline under a heading, a table rule): text has gaps between
      // letters. A real page edge has background all along its outside.
      if (!off) {
        const ref = inside / 5;
        for (let o = 2; o <= reach; o++) {
          const ox = px - nx * o;
          const oy = py - ny * o;
          if (ox < 0 || oy < 0 || ox > w - 1 || oy > h - 1) break;
          if (lumAt(ox, oy) >= ref - 8) { busy++; break; }
        }
      }
      steps.push(off ? BORDER_STEP : (inside - outside) / 5);
    }
    if (busy / steps.length > 0.3) return -1;
    steps.sort((p, q) => p - q);
    const consistent = steps.filter((v) => v > 7).length / steps.length;
    if (consistent < 0.75) return -1;
    return steps[Math.floor(steps.length / 2)];
  };

  let bestScore = -Infinity;
  let bestQuad: QuadPoint[] | null = null;
  let bestReal = 0;
  let bestMean = 0;
  for (let i = 0; i < horiz.length; i++) {
    for (let j = 0; j < horiz.length; j++) {
      if (i === j) continue;
      const top = horiz[i];
      const bot = horiz[j];
      if (yAt(bot, w / 2) - yAt(top, w / 2) < h * 0.2) continue;
      for (let a = 0; a < vert.length; a++) {
        for (let b = 0; b < vert.length; b++) {
          if (a === b) continue;
          const left = vert[a];
          const right = vert[b];
          if (xAt(right, h / 2) - xAt(left, h / 2) < w * 0.2) continue;
          const q = [intersect(top, left), intersect(top, right), intersect(bot, right), intersect(bot, left)];
          if (q.some((p) => !p)) continue;
          const pts = q as QuadPoint[];
          if (pts.some((p) => p.x < -w * 0.03 || p.x > w * 1.03 || p.y < -h * 0.03 || p.y > h * 1.03)) continue;
          const norm = pts.map((p) => ({ x: clamp(p.x / w, 0, 1), y: clamp(p.y / h, 0, 1) }));
          if (!isConvex(norm)) continue;
          const area = polyArea(norm);
          if (area < 0.1) continue;
          const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
          const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
          const steps = [
            edgeStep(pts[0], pts[1], cx, cy, top.border),
            edgeStep(pts[1], pts[2], cx, cy, right.border),
            edgeStep(pts[2], pts[3], cx, cy, bot.border),
            edgeStep(pts[3], pts[0], cx, cy, left.border),
          ];
          const minStep = Math.min(...steps);
          if (minStep < 4) continue;
          const mean = (steps[0] + steps[1] + steps[2] + steps[3]) / 4;
          const score = (0.7 * mean + 0.3 * minStep) * (0.8 + 0.2 * area);
          if (score > bestScore) {
            bestScore = score;
            bestQuad = norm;
            bestReal = [top, right, bot, left].filter((l) => !l.border).length;
            bestMean = mean;
          }
        }
      }
    }
  }

  // 4. Confidence.
  if (!bestQuad || bestReal < 2 || bestMean < 18) return null;
  if (polyArea(bestQuad) > 0.92) return null;
  return bestQuad;
}

function solve8(rows: number[][], rhs: number[]): number[] | null {
  const size = 8;
  const m = rows.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let r = col + 1; r < size; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-8) return null;
    const tmp = m[col];
    m[col] = m[pivot];
    m[pivot] = tmp;
    const div = m[col][col];
    for (let k = col; k <= size; k++) m[col][k] /= div;
    for (let r = 0; r < size; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let k = col; k <= size; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row) => row[size]);
}

/** Map a normalized quad (tl, tr, br, bl) of the source onto a straight page. */
export function warpQuad(source: HTMLCanvasElement, quad: QuadPoint[], cap = 2000): HTMLCanvasElement {
  const srcPts = quad.map((p) => ({ x: p.x * source.width, y: p.y * source.height }));
  const len = (a: QuadPoint, b: QuadPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  let dw = Math.max(1, Math.round((len(srcPts[0], srcPts[1]) + len(srcPts[3], srcPts[2])) / 2));
  let dh = Math.max(1, Math.round((len(srcPts[0], srcPts[3]) + len(srcPts[1], srcPts[2])) / 2));
  const fit = Math.min(1, cap / Math.max(dw, dh));
  dw = Math.max(1, Math.round(dw * fit));
  dh = Math.max(1, Math.round(dh * fit));
  const from = [[0, 0], [dw, 0], [dw, dh], [0, dh]];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const u = srcPts[i].x;
    const v = srcPts[i].y;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const hm = solve8(A, b);
  const out = document.createElement('canvas');
  out.width = dw;
  out.height = dh;
  const ctx = out.getContext('2d');
  const srcCtx = source.getContext('2d', { willReadFrequently: true });
  if (!hm || !ctx || !srcCtx) return out;
  const src = srcCtx.getImageData(0, 0, source.width, source.height);
  const dst = ctx.createImageData(dw, dh);
  const sw = source.width;
  const sh = source.height;
  const s = src.data;
  const o = dst.data;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const den = hm[6] * x + hm[7] * y + 1;
      if (!Number.isFinite(den) || Math.abs(den) < 1e-6) continue;
      const u = (hm[0] * x + hm[1] * y + hm[2]) / den;
      const v = (hm[3] * x + hm[4] * y + hm[5]) / den;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const fx = u - x0;
      const fy = v - y0;
      const xa = clamp(x0, 0, sw - 1);
      const xb = clamp(x0 + 1, 0, sw - 1);
      const ya = clamp(y0, 0, sh - 1);
      const yb = clamp(y0 + 1, 0, sh - 1);
      const p00 = (ya * sw + xa) * 4;
      const p10 = (ya * sw + xb) * 4;
      const p01 = (yb * sw + xa) * 4;
      const p11 = (yb * sw + xb) * 4;
      const i = (y * dw + x) * 4;
      for (let k = 0; k < 4; k++) {
        o[i + k] =
          s[p00 + k] * (1 - fx) * (1 - fy) +
          s[p10 + k] * fx * (1 - fy) +
          s[p01 + k] * (1 - fx) * fy +
          s[p11 + k] * fx * fy;
      }
    }
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}
