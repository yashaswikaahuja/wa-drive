/**
 * Per-channel R/G/B adjustment for the print editor, with the feel of older
 * Photoshop's Color Balance midtone sliders: each value is -100..100 and
 * shifts that channel warmer/cooler. Runs on top of the scan filter.
 *
 * The curve is a gentle gamma per channel (not a flat add), so midtones move
 * most while pure black and pure white stay put — nudging +Red warms the paper
 * without clipping ink to red or blowing out highlights.
 */
import { cloneCanvas } from './documentPrintLayout';

export type RgbAdjust = { r: number; g: number; b: number };

export const RGB_ZERO: RgbAdjust = { r: 0, g: 0, b: 0 };

export function isRgbZero(v?: RgbAdjust | null): boolean {
  return !v || (v.r === 0 && v.g === 0 && v.b === 0);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** 256-entry lookup for one channel: positive brightens midtones, negative darkens. */
function channelLut(amount: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const a = clamp(amount, -100, 100) / 100;
  // gamma < 1 brightens midtones (push toward the colour), > 1 darkens.
  const gamma = a >= 0 ? 1 / (1 + a) : 1 - a;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(clamp(Math.pow(i / 255, gamma) * 255, 0, 255));
  }
  return lut;
}

/** Return a new canvas with the R/G/B midtone shift applied. */
export function applyRgbAdjust(src: HTMLCanvasElement, adj?: RgbAdjust | null): HTMLCanvasElement {
  if (isRgbZero(adj)) return cloneCanvas(src);
  const out = cloneCanvas(src);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const lutR = channelLut(adj!.r);
  const lutG = channelLut(adj!.g);
  const lutB = channelLut(adj!.b);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lutR[d[i]];
    d[i + 1] = lutG[d[i + 1]];
    d[i + 2] = lutB[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
