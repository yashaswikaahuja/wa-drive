/** Canvas helpers for passport image editor. */

export function loadImageFromFile(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

/** Composite a cutout (PNG with alpha) onto a solid background. Transparent → keep alpha. */
export async function compositeOnColor(
  cutout: HTMLImageElement | HTMLCanvasElement,
  hex: string | null,
): Promise<HTMLCanvasElement> {
  const w = 'naturalWidth' in cutout ? cutout.naturalWidth || cutout.width : cutout.width;
  const h = 'naturalHeight' in cutout ? cutout.naturalHeight || cutout.height : cutout.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (hex) {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(cutout as CanvasImageSource, 0, 0);
  return c;
}

export type ToneAdjust = {
  brightness: number; // -100..100
  contrast: number;   // -100..100
  smooth: number;     // 0..100 light face polish (blur + blend)
};

/** Apply brightness/contrast + light smooth polish. */
export function applyTone(source: HTMLCanvasElement, tone: ToneAdjust): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext('2d')!;
  const b = tone.brightness;
  const ct = tone.contrast;
  const contrastF = (259 * (ct + 255)) / (255 * (259 - ct));
  const intercept = 128 * (1 - contrastF) + b * 1.2;
  ctx.filter = `brightness(${100 + b}%) contrast(${100 + ct}%)`;
  if (tone.smooth > 0) {
    // Soft blur pass blended for gentle skin polish (café-safe, not beauty-filter)
    const blurPx = Math.max(0.4, (tone.smooth / 100) * 2.2);
    ctx.filter += ` blur(${blurPx}px)`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = `brightness(${100 + b}%) contrast(${100 + ct}%)`;
    ctx.globalAlpha = 1 - tone.smooth / 180; // keep detail
    ctx.drawImage(source, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(source, 0, 0);
  }
  // Apply contrast via pixel path when filter unsupported / for export fidelity
  if (Math.abs(ct) > 0 && false) {
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp(contrastF * d[i] + intercept);
      d[i + 1] = clamp(contrastF * d[i + 1] + intercept);
      d[i + 2] = clamp(contrastF * d[i + 2] + intercept);
    }
    ctx.putImageData(id, 0, 0);
  }
  return c;
}

function clamp(n: number) { return Math.max(0, Math.min(255, n)); }

export function rotateCanvas(source: HTMLCanvasElement, deg: 90 | 180 | 270 | -90): HTMLCanvasElement {
  const rad = (deg * Math.PI) / 180;
  const c = document.createElement('canvas');
  const swap = Math.abs(deg) === 90 || Math.abs(deg) === 270;
  c.width = swap ? source.height : source.width;
  c.height = swap ? source.width : source.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return c;
}

export function flipCanvas(source: HTMLCanvasElement, horizontal: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(horizontal ? c.width : 0, horizontal ? 0 : c.height);
  ctx.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  ctx.drawImage(source, 0, 0);
  return c;
}

/** Cover-fit crop into target aspect, then scale to exact pixels. */
export function cropCoverToSize(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  panX = 0.5,
  panY = 0.4,
): HTMLCanvasElement {
  const tw = targetW;
  const th = targetH;
  const srcAspect = source.width / source.height;
  const dstAspect = tw / th;
  let sw: number, sh: number, sx: number, sy: number;
  if (srcAspect > dstAspect) {
    sh = source.height;
    sw = sh * dstAspect;
    sx = (source.width - sw) * panX;
    sy = 0;
  } else {
    sw = source.width;
    sh = sw / dstAspect;
    sx = 0;
    sy = (source.height - sh) * panY;
  }
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, tw, th);
  return c;
}

/** Binary-search JPEG quality to hit maxKb (and optional minKb). */
export async function encodeJpegToKb(
  canvas: HTMLCanvasElement,
  maxKb: number,
  minKb?: number,
): Promise<{ blob: Blob; kb: number; quality: number }> {
  let lo = 0.35, hi = 0.95, best: Blob | null = null, bestQ = 0.85;
  for (let i = 0; i < 10; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, 'image/jpeg', q);
    const kb = blob.size / 1024;
    best = blob; bestQ = q;
    if (kb > maxKb) hi = q;
    else if (minKb && kb < minKb) lo = q;
    else { best = blob; bestQ = q; break; }
  }
  // If still over max, try lower
  while (best && best.size / 1024 > maxKb && bestQ > 0.2) {
    bestQ -= 0.05;
    best = await canvasToBlob(canvas, 'image/jpeg', bestQ);
  }
  return { blob: best!, kb: best!.size / 1024, quality: bestQ };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality);
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
