import sharp from 'sharp';
import { cropAndAlignFace } from './faceDetect.js';

// ── Layout configs ────────────────────────────────────────────────────────────
// Photo size is DERIVED from sheet + grid, not hardcoded.
// Formula: photoW = (sheetW - 2×margin - (cols-1)×gap) / cols
//          photoH = (sheetH - 2×margin - (rows-1)×gap) / rows
// This guarantees photos always fill the sheet evenly with no empty space.

const LAYOUTS = {
  // 4×6 landscape @ 300 DPI — 8 photos (4 cols × 2 rows)
  '4x6-8':  { sw: 1800, sh: 1200, cols: 4, rows: 2, margin: 50, gap: 20 },
  // 4×6 landscape @ 300 DPI — 6 photos (3 cols × 2 rows)
  '4x6-6':  { sw: 1800, sh: 1200, cols: 3, rows: 2, margin: 50, gap: 20 },
  // A4 portrait @ 300 DPI — 24 photos (4 cols × 6 rows)
  'a4':     { sw: 2480, sh: 3508, cols: 4, rows: 6, margin: 40, gap: 8 },
} as const;

type LayoutKey = keyof typeof LAYOUTS;

/** Derive photo dimensions from sheet + grid config */
function calcPhotoSize(cfg: typeof LAYOUTS[LayoutKey]) {
  const pw = Math.floor((cfg.sw - 2 * cfg.margin - (cfg.cols - 1) * cfg.gap) / cfg.cols);
  const ph = Math.floor((cfg.sh - 2 * cfg.margin - (cfg.rows - 1) * cfg.gap) / cfg.rows);
  return { pw, ph };
}

/** Prepare a single passport photo using Face++ detection with attention fallback */
async function preparePhoto(input: Buffer, pw: number, ph: number): Promise<Buffer> {
  return cropAndAlignFace(input, pw, ph, { pad: 0.9 });
}

export async function generatePassportSheet(
  photoBuffer: Buffer,
  sheet: '4x6' | 'a4' = '4x6',
  count: 6 | 8 | 24 = 8,
): Promise<Buffer> {
  const key: LayoutKey = sheet === 'a4' ? 'a4' : count === 6 ? '4x6-6' : '4x6-8';
  const cfg = LAYOUTS[key];
  const { pw, ph } = calcPhotoSize(cfg);

  const photo = await preparePhoto(photoBuffer, pw, ph);

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < cfg.rows; row++) {
    for (let col = 0; col < cfg.cols; col++) {
      composites.push({
        input: photo,
        left: cfg.margin + col * (pw + cfg.gap),
        top:  cfg.margin + row * (ph + cfg.gap),
      });
    }
  }

  return sharp({
    create: { width: cfg.sw, height: cfg.sh, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
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
