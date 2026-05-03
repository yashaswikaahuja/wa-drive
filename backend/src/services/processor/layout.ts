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

// ── Sheet layout configs ───────────────────────────────────────────────────────
// Photo size is DERIVED from sheet + grid, not hardcoded.
// Formula: photoW = (sheetW - 2×margin - (cols-1)×gap) / cols
const LAYOUTS = {
  '4x6-8':  { sw: 1800, sh: 1200, cols: 4, rows: 2, margin: 50, gap: 20 },
  '4x6-6':  { sw: 1800, sh: 1200, cols: 3, rows: 2, margin: 50, gap: 20 },
  'a4':     { sw: 2480, sh: 3508, cols: 4, rows: 6, margin: 40, gap: 8  },
} as const;
type LayoutKey = keyof typeof LAYOUTS;

function calcPhotoSize(cfg: typeof LAYOUTS[LayoutKey]) {
  const pw = Math.floor((cfg.sw - 2 * cfg.margin - (cfg.cols - 1) * cfg.gap) / cfg.cols);
  const ph = Math.floor((cfg.sh - 2 * cfg.margin - (cfg.rows - 1) * cfg.gap) / cfg.rows);
  return { pw, ph };
}

async function preparePhoto(input: Buffer, pw: number, ph: number): Promise<Buffer> {
  return cropAndAlignFace(input, pw, ph, { pad: 0.9 });
}

export async function generatePassportSheet(
  photoBuffer: Buffer,
  sheet: '4x6' | 'a4' = '4x6',
  count: 6 | 8 | 24 = 6,
  size: PhotoSize = 'passport',
): Promise<Buffer> {
  const key: LayoutKey = sheet === 'a4' ? 'a4' : count === 6 ? '4x6-6' : '4x6-8';
  const cfg = LAYOUTS[key];
  const { pw, ph } = calcPhotoSize(cfg);

  // Use size-specific dimensions if they fit better than derived ones
  const photoSize = PHOTO_SIZES[size];
  const finalW = photoSize.w < pw ? photoSize.w : pw;
  const finalH = photoSize.h < ph ? photoSize.h : ph;

  const photo = await preparePhoto(photoBuffer, finalW, finalH);

  const composites: sharp.OverlayOptions[] = [];
  // Center the grid on the sheet
  const totalW = cfg.cols * finalW + (cfg.cols - 1) * cfg.gap;
  const totalH = cfg.rows * finalH + (cfg.rows - 1) * cfg.gap;
  const offsetX = Math.floor((cfg.sw - totalW) / 2);
  const offsetY = Math.floor((cfg.sh - totalH) / 2);

  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      composites.push({
        input: photo,
        left: offsetX + col * (finalW + cfg.gap),
        top:  offsetY + row * (finalH + cfg.gap),
      });
    }
  }

  return sharp({
    create: { width: cfg.sw, height: cfg.sh, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .withMetadata({ density: 300 })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Place a single photo centered on a 4×6 sheet with equal margins */
export async function generateSingleSheet(
  photoBuffer: Buffer,
  size: PhotoSize = 'passport',
): Promise<Buffer> {
  const SW = 1800, SH = 1200; // 4×6 landscape @ 300 DPI
  const { w, h } = PHOTO_SIZES[size];
  const photo = await preparePhoto(photoBuffer, w, h);
  const left = Math.floor((SW - w) / 2);
  const top  = Math.floor((SH - h) / 2);

  return sharp({
    create: { width: SW, height: SH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: photo, left, top }])
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
