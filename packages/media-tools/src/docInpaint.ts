/**
 * Fill painted-over areas of a photo with the colours around them
 * (Adobe Scan style "Cleanup": stains, pen marks, fingers, staples).
 *
 * Push-pull fill: the known pixels are averaged down an image pyramid until
 * every hole is covered, then the holes are filled back up from the coarser
 * levels. It gives a smooth fill that follows the paper's shading, and only
 * the box around the mask is processed, so a stroke is cheap on big photos.
 */

/** mask: one byte per source pixel, >0 = fill this pixel. */
export function fillFromSurroundings(src: HTMLCanvasElement, mask: Uint8Array): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return src;
  octx.drawImage(src, 0, 0);

  // Bounding box of the mask, padded so there is paper around it to sample.
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return out;
  const pad = Math.max(12, Math.round(Math.max(x1 - x0, y1 - y0) * 0.35));
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  const img = octx.getImageData(x0, y0, bw, bh);
  const d = img.data;
  const n = bw * bh;

  // Grow the mask by 2px so the dark fringe of a mark is replaced too.
  const hole = new Uint8Array(n);
  const R = 2;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!mask[(y + y0) * W + (x + x0)]) continue;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= bh) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < bw) hole[yy * bw + xx] = 1;
        }
      }
    }
  }

  // Level 0: premultiplied colour + weight.
  type Level = { w: number; h: number; c: Float32Array; a: Float32Array };
  const base: Level = { w: bw, h: bh, c: new Float32Array(n * 3), a: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    if (hole[i]) continue;
    base.a[i] = 1;
    base.c[i * 3] = d[i * 4];
    base.c[i * 3 + 1] = d[i * 4 + 1];
    base.c[i * 3 + 2] = d[i * 4 + 2];
  }

  // Push: average down until nothing is missing.
  const levels: Level[] = [base];
  for (;;) {
    const L = levels[levels.length - 1];
    let missing = false;
    for (let i = 0; i < L.w * L.h; i++) if (L.a[i] < 1e-6) { missing = true; break; }
    if (!missing || (L.w === 1 && L.h === 1)) break;
    const w = Math.max(1, Math.ceil(L.w / 2));
    const h = Math.max(1, Math.ceil(L.h / 2));
    const c = new Float32Array(w * h * 3);
    const a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sa = 0;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        for (let dy = 0; dy < 2; dy++) {
          const yy = y * 2 + dy;
          if (yy >= L.h) continue;
          for (let dx = 0; dx < 2; dx++) {
            const xx = x * 2 + dx;
            if (xx >= L.w) continue;
            const j = yy * L.w + xx;
            sa += L.a[j];
            sr += L.c[j * 3];
            sg += L.c[j * 3 + 1];
            sb += L.c[j * 3 + 2];
          }
        }
        const k = y * w + x;
        if (sa > 0) {
          // Keep colour premultiplied, weight capped at 1.
          const s = Math.min(1, sa) / sa;
          a[k] = Math.min(1, sa);
          c[k * 3] = sr * s;
          c[k * 3 + 1] = sg * s;
          c[k * 3 + 2] = sb * s;
        }
      }
    }
    levels.push({ w, h, c, a });
  }

  // Pull: fill each level's gaps from the (already complete) coarser level.
  for (let li = levels.length - 2; li >= 0; li--) {
    const F = levels[li];
    const C = levels[li + 1];
    for (let y = 0; y < F.h; y++) {
      for (let x = 0; x < F.w; x++) {
        const k = y * F.w + x;
        const a = F.a[k];
        if (a >= 1) continue;
        // Bilinear sample of the coarse level (un-premultiplied).
        const fx = Math.min(C.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const fy = Math.min(C.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const ax = Math.floor(fx);
        const ay = Math.floor(fy);
        const bx = Math.min(C.w - 1, ax + 1);
        const by = Math.min(C.h - 1, ay + 1);
        const tx = fx - ax;
        const ty = fy - ay;
        const wts = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
        const idx = [ay * C.w + ax, ay * C.w + bx, by * C.w + ax, by * C.w + bx];
        let r = 0;
        let g = 0;
        let b = 0;
        let ws = 0;
        for (let q = 0; q < 4; q++) {
          const j = idx[q];
          const ca = C.a[j];
          if (ca <= 0) continue;
          r += (wts[q] * C.c[j * 3]) / ca;
          g += (wts[q] * C.c[j * 3 + 1]) / ca;
          b += (wts[q] * C.c[j * 3 + 2]) / ca;
          ws += wts[q];
        }
        if (ws <= 0) continue;
        r /= ws;
        g /= ws;
        b /= ws;
        // Blend: partly-known pixels keep their own share.
        F.c[k * 3] += (1 - a) * r;
        F.c[k * 3 + 1] += (1 - a) * g;
        F.c[k * 3 + 2] += (1 - a) * b;
        F.a[k] = 1;
      }
    }
  }

  // Light grain so the fill does not look like a flat sticker on photo paper.
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  for (let i = 0; i < n; i++) {
    if (!hole[i]) continue;
    const grain = rand() * 3;
    d[i * 4] = Math.max(0, Math.min(255, base.c[i * 3] + grain));
    d[i * 4 + 1] = Math.max(0, Math.min(255, base.c[i * 3 + 1] + grain));
    d[i * 4 + 2] = Math.max(0, Math.min(255, base.c[i * 3 + 2] + grain));
    d[i * 4 + 3] = 255;
  }
  octx.putImageData(img, x0, y0);
  return out;
}
