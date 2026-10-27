/**
 * Bare-paper map: what the sheet would look like at every pixel with all the
 * writing, stamps, and objects removed. It follows reflections, shadows, and
 * yellowing, so dividing the photo by it evens the page out, and a cleanup
 * brush can copy from it.
 *
 * 1. Split the page into blocks. In each, the paper is the bright,
 *    low-chroma part, so take the mean color of the brightest ~20% of those
 *    pixels. Text between the letters still shows paper, so dense text does
 *    not drag the estimate down.
 * 2. Reject blocks that are not paper: too few plain pixels, a strong color
 *    cast, or much darker than the paper around them (a logo, a dark
 *    heading, a strip of table).
 * 3. Fill rejected blocks from the good ones around them, smooth, and
 *    interpolate back up to full size.
 */

export type PaperBox = { x0: number; y0: number; x1: number; y1: number; mode: number };

/** Per-channel paper color, each `w*h`. Valid inside `box`; outside it holds the nearest edge value. */
export function paperMap(
  chan: [Float32Array, Float32Array, Float32Array],
  tone: Float32Array,
  spread: Float32Array,
  w: number,
  h: number,
  box: PaperBox,
  skip: Uint8Array,
): [Float32Array, Float32Array, Float32Array] {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const B = Math.max(8, Math.min(40, Math.round(Math.min(bw, bh) / 36)));
  const gx = Math.max(1, Math.ceil(bw / B));
  const gy = Math.max(1, Math.ceil(bh / B));
  const cells = gx * gy;
  const gr = new Float32Array(cells);
  const gg = new Float32Array(cells);
  const gb = new Float32Array(cells);
  const gl = new Float32Array(cells);
  const ok = new Uint8Array(cells);
  const hist = new Int32Array(256);

  for (let cy = 0; cy < gy; cy++) {
    for (let cx = 0; cx < gx; cx++) {
      const xa = box.x0 + cx * B;
      const ya = box.y0 + cy * B;
      const xb = Math.min(box.x1, xa + B - 1);
      const yb = Math.min(box.y1, ya + B - 1);
      hist.fill(0);
      let n = 0;
      for (let y = ya; y <= yb; y++) {
        const row = y * w;
        for (let x = xa; x <= xb; x++) {
          const i = row + x;
          if (skip[i] || spread[i] > 40) continue;
          hist[tone[i] | 0]++;
          n++;
        }
      }
      const area = (xb - xa + 1) * (yb - ya + 1);
      if (n < area * 0.25) continue;
      // Luma at the 80th percentile: the floor of the bright paper share.
      let need = Math.ceil(n * 0.2);
      let t = 255;
      while (t > 0 && need > 0) need -= hist[t--];
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sl = 0;
      let ss = 0;
      let k = 0;
      for (let y = ya; y <= yb; y++) {
        const row = y * w;
        for (let x = xa; x <= xb; x++) {
          const i = row + x;
          if (skip[i] || spread[i] > 40 || tone[i] < t) continue;
          sr += chan[0][i];
          sg += chan[1][i];
          sb += chan[2][i];
          sl += tone[i];
          ss += spread[i];
          k++;
        }
      }
      if (!k) continue;
      const c = cy * gx + cx;
      gl[c] = sl / k;
      // A strong cast in the brightest share is wood or cloth, not paper.
      if (ss / k > 30 || gl[c] < box.mode - 95) continue;
      gr[c] = sr / k;
      gg[c] = sg / k;
      gb[c] = sb / k;
      ok[c] = 1;
    }
  }

  // Much darker than the paper around it: a dark logo, a heading bar, or a
  // strip of table. Real shading changes slowly, so it survives this.
  const keep = ok.slice();
  const near: number[] = [];
  for (let cy = 0; cy < gy; cy++) {
    for (let cx = 0; cx < gx; cx++) {
      const c = cy * gx + cx;
      if (!ok[c]) continue;
      near.length = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if ((dx || dy) && x >= 0 && y >= 0 && x < gx && y < gy && ok[y * gx + x]) near.push(gl[y * gx + x]);
        }
      }
      if (near.length < 4) continue;
      near.sort((a, b) => a - b);
      const med = near[near.length >> 1];
      if (gl[c] < med - 28) keep[c] = 0;
    }
  }

  let known = 0;
  for (let c = 0; c < cells; c++) known += keep[c];
  if (!known) {
    const v = box.mode;
    return [new Float32Array(w * h).fill(v), new Float32Array(w * h).fill(v), new Float32Array(w * h).fill(v)];
  }
  const grids = [gr, gg, gb];
  fillGrid(grids, keep, gx, gy);
  for (const g of grids) {
    smoothGrid(g, gx, gy);
    smoothGrid(g, gx, gy);
  }
  return [upsample(gr, gx, gy, B, w, h, box), upsample(gg, gx, gy, B, w, h, box), upsample(gb, gx, gy, B, w, h, box)];
}

/** Grow known cells into unknown ones, one ring at a time, from their known neighbours. */
function fillGrid(grids: Float32Array[], known: Uint8Array, gx: number, gy: number) {
  const have = known.slice();
  let changed = true;
  while (changed) {
    changed = false;
    const next = have.slice();
    for (let cy = 0; cy < gy; cy++) {
      for (let cx = 0; cx < gx; cx++) {
        const c = cy * gx + cx;
        if (have[c]) continue;
        let n = 0;
        const sum = [0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
            const j = y * gx + x;
            if (!have[j]) continue;
            for (let g = 0; g < 3; g++) sum[g] += grids[g][j];
            n++;
          }
        }
        if (!n) continue;
        for (let g = 0; g < 3; g++) grids[g][c] = sum[g] / n;
        next[c] = 1;
        changed = true;
      }
    }
    have.set(next);
  }
}

function smoothGrid(g: Float32Array, gx: number, gy: number) {
  const src = g.slice();
  for (let cy = 0; cy < gy; cy++) {
    for (let cx = 0; cx < gx; cx++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= gx || y >= gy) continue;
          s += src[y * gx + x];
          n++;
        }
      }
      g[cy * gx + cx] = s / n;
    }
  }
}

/** Bilinear between block centers. */
function upsample(g: Float32Array, gx: number, gy: number, B: number, w: number, h: number, box: PaperBox) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(gy - 1, (Math.max(box.y0, Math.min(box.y1, y)) - box.y0 + 0.5) / B - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gy - 1, y0 + 1);
    const ty = fy - y0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(gx - 1, (Math.max(box.x0, Math.min(box.x1, x)) - box.x0 + 0.5) / B - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gx - 1, x0 + 1);
      const tx = fx - x0;
      const a = g[y0 * gx + x0] + (g[y0 * gx + x1] - g[y0 * gx + x0]) * tx;
      const b = g[y1 * gx + x0] + (g[y1 * gx + x1] - g[y1 * gx + x0]) * tx;
      out[row + x] = a + (b - a) * ty;
    }
  }
  return out;
}
