import sharp from 'sharp';
import { cropAndAlignFace } from './faceDetect.js';

// ── Photo size configs (mm → px at 300 DPI) ───────────────────────────────────
const MM_TO_PX = 300 / 25.4;
const PHOTO_SIZES = {
  passport: { w: Math.round(35 * MM_TO_PX), h: Math.round(45 * MM_TO_PX) }, // 413×531
  visa:     { w: Math.round(35 * MM_TO_PX), h: Math.round(45 * MM_TO_PX) }, // same as passport
  us:       { w: Math.round(51 * MM_TO_PX), h: Math.round(51 * MM_TO_PX) }, // 2×2 inch = 600×600
} as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

// ── Sheet dimensions @ 300 DPI ────────────────────────────────────────────────
const SHEETS = {
  '4x6': { sw: 1800, sh: 1200 },
  'a4':  { sw: 2480, sh: 3508 },
} as const;
export type SheetType = keyof typeof SHEETS;

const MARGIN = 60;
const GAP    = 40;

/**
 * Auto-calculate cols × rows for a given count.
 * Prefers the layout where derived photo width gives the largest portrait photo
 * (width < height after applying aspect ratio).
 */
function calcGrid(count: number, sw: number, _sh: number): { cols: number; rows: number } {
  if (count === 1) return { cols: 1, rows: 1 };

  let bestCols = 1, bestRows = count, bestW = 0;
  for (let cols = 1; cols <= count; cols++) {
    if (count % cols !== 0) continue;
    const rows = count / cols;
    const pw = Math.floor((sw - 2 * MARGIN - (cols - 1) * GAP) / cols);
    if (pw <= 0) continue;
    // Prefer more columns (wider photos) but only up to where photos stay portrait
    // i.e. pw < ph. Since ph = pw * aspect (>1), pw is always < ph — so just maximise pw.
    if (pw > bestW) { bestW = pw; bestCols = cols; bestRows = rows; }
  }
  return { cols: bestCols, rows: bestRows };
}

function calcPhotoSize(cols: number, rows: number, sw: number, sh: number) {
  const pw = Math.floor((sw - 2 * MARGIN - (cols - 1) * GAP) / cols);
  const ph = Math.floor((sh - 2 * MARGIN - (rows - 1) * GAP) / rows);
  return { pw, ph };
}

async function preparePhoto(input: Buffer, pw: number, ph: number): Promise<Buffer> {
  return cropAndAlignFace(input, pw, ph, { pad: 0.9 });
}

export async function generatePassportSheet(
  photoBuffer: Buffer,
  sheet: SheetType = '4x6',
  count: number = 6,
  size: PhotoSize = 'passport',
): Promise<Buffer> {
  const { sw, sh } = SHEETS[sheet];
  if (count === 1) return generateSingleSheet(photoBuffer, size, sheet);

  const { cols, rows } = calcGrid(count, sw, sh);

  // Width fills sheet columns. Height from aspect ratio.
  // Also cap so all rows fit within sheet height.
  const aspect = PHOTO_SIZES[size].h / PHOTO_SIZES[size].w;
  let pw = Math.floor((sw - 2 * MARGIN - (cols - 1) * GAP) / cols);
  let ph = Math.round(pw * aspect);

  // If rows don't fit in sheet height, scale down proportionally
  const maxPh = Math.floor((sh - 2 * MARGIN - (rows - 1) * GAP) / rows);
  if (ph > maxPh) { ph = maxPh; pw = Math.round(ph / aspect); }

  const photo = await preparePhoto(photoBuffer, pw, ph);

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      composites.push({
        input: photo,
        left: MARGIN + col * (pw + GAP),
        top:  MARGIN + row * (ph + GAP),
      });
    }
  }

  // Sheet height = exactly what's needed to fit all rows (no wasted space, no clipping)
  const finalH = MARGIN + rows * ph + (rows - 1) * GAP + MARGIN;

  return sharp({
    create: { width: sw, height: finalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** count=1: single large photo filling the sheet with equal margins */
export async function generateSingleSheet(
  photoBuffer: Buffer,
  size: PhotoSize = 'passport',
  sheet: SheetType = '4x6',
): Promise<Buffer> {
  const { sw, sh } = SHEETS[sheet];
  // Fill sheet minus margins, maintain passport aspect ratio (35:45)
  const maxW = sw - 2 * MARGIN;
  const maxH = sh - 2 * MARGIN;
  const aspect = PHOTO_SIZES[size].w / PHOTO_SIZES[size].h;
  let w = maxW, h = Math.round(maxW / aspect);
  if (h > maxH) { h = maxH; w = Math.round(maxH * aspect); }

  const photo = await preparePhoto(photoBuffer, w, h);

  return sharp({
    create: { width: sw, height: sh, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: photo, left: Math.floor((sw - w) / 2), top: Math.floor((sh - h) / 2) }])
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// A4 landscape at 150 DPI: 1754 x 1240 px (rotated for horizontal layout)
const AADHAAR_W = 1754;
const AADHAAR_H = 1240;
const AADHAAR_MARGIN = 20;
// Each card: half width minus 1.5 margins (left + middle + right)
const IMG_W = Math.floor((AADHAAR_W - AADHAAR_MARGIN * 3) / 2);
const IMG_H = AADHAAR_H - AADHAAR_MARGIN * 2;

export async function generateAadhaarLayout(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length !== 2) throw new Error('Exactly 2 images required');

  const [left, right] = await Promise.all([
    sharp(buffers[0]).resize(IMG_W, IMG_H, { fit: 'inside', withoutEnlargement: false })
      .extend({ top: 0, bottom: 0, left: 0, right: 0, background: { r: 255, g: 255, b: 255 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .jpeg().toBuffer(),
    sharp(buffers[1]).resize(IMG_W, IMG_H, { fit: 'inside', withoutEnlargement: false })
      .extend({ top: 0, bottom: 0, left: 0, right: 0, background: { r: 255, g: 255, b: 255 } })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
      .jpeg().toBuffer(),
  ]);

  return sharp({
    create: { width: AADHAAR_W, height: AADHAAR_H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: left,  top: AADHAAR_MARGIN, left: AADHAAR_MARGIN },
      { input: right, top: AADHAAR_MARGIN, left: AADHAAR_MARGIN * 2 + IMG_W },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
