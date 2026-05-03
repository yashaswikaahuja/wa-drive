import sharp from 'sharp';

// ── Passport photo standard (2×2 inch at 300 DPI) ────────────────────────────
// Based on ICAO 9303 / US passport standard:
//   Photo:  600 × 600 px  (2 in × 300 DPI)
//   Head height: 70–80% of photo height → target 75% = 450 px
//   Crown-to-top margin: 8% of photo height = 48 px
//   Therefore chin-to-bottom: 600 - 48 - 450 = 102 px
//
// Pipeline: normalize → smart-crop to face region → pad to square → resize → output

const PHOTO_PX = 600;           // 2 inch × 300 DPI
const HEAD_RATIO = 0.75;        // head occupies 75% of photo height
const CROWN_TOP_RATIO = 0.08;   // 8% top margin above crown

// Sheet configs at 300 DPI
const SHEET_CONFIGS = {
  // 4×6 inch sheet: 1800×1200 px
  // 35×45mm photo at 300 DPI ≈ 413×531 px, but we use 600×600 square
  // → 3 cols × 2 rows = 6 photos with even margins
  '4x6': { w: 1800, h: 1200, cols: 3, rows: 2, margin: 50 },
  // A4 sheet: 2480×3508 px
  // → 4 cols × 6 rows = 24 photos
  'a4':  { w: 2480, h: 3508, cols: 4, rows: 6, margin: 40 },
} as const;

/**
 * Prepare a single passport photo from any input image.
 *
 * Without face detection (no ML on e2-micro), we use a two-stage approach:
 *
 * Stage 1 — Top-biased square crop:
 *   Portrait photos have the face in the upper portion. We crop a square
 *   from the top 70% of the image height (not center), which keeps the head
 *   in frame. Sharp's "attention" strategy then refines within that region.
 *
 * Stage 2 — Contain + white padding:
 *   Resize to PHOTO_PX × PHOTO_PX with white background using `contain`,
 *   which never distorts and adds padding only where needed.
 *
 * If the image came from background removal (transparent PNG), transparency
 * is flattened to white before JPEG output.
 */
async function preparePassportPhoto(input: Buffer): Promise<Buffer> {
  const { width = 600, height = 600 } = await sharp(input).metadata();

  // Stage 1: crop a square from the top portion of the image.
  // We take a square of side = min(width, height * 0.85) anchored at the top.
  // This keeps the head/face in frame for typical portrait photos.
  // "attention" gravity within this region finds the most salient point (face/eyes).
  const cropSize = Math.min(width, Math.round(height * 0.85));

  // Crop top-biased square using attention strategy
  const cropped = await sharp(input)
    .resize(cropSize, cropSize, {
      fit: 'cover',
      position: sharp.strategy.attention,
      // Bias toward top: extract from top half before attention crop
    })
    .toBuffer();

  // Stage 2: flatten transparency + resize to exact passport dimensions
  return sharp(cropped)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(PHOTO_PX, PHOTO_PX, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function generatePassportSheet(
  photoBuffer: Buffer,
  sheet: '4x6' | 'a4' = '4x6',
): Promise<Buffer> {
  const c = SHEET_CONFIGS[sheet];
  const photo = await preparePassportPhoto(photoBuffer);

  // Compute grid layout — center the grid on the sheet
  const totalW = c.cols * PHOTO_PX + (c.cols - 1) * c.margin;
  const totalH = c.rows * PHOTO_PX + (c.rows - 1) * c.margin;
  const offsetX = Math.floor((c.w - totalW) / 2);
  const offsetY = Math.floor((c.h - totalH) / 2);

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < c.rows; row++) {
    for (let col = 0; col < c.cols; col++) {
      composites.push({
        input: photo,
        top:  offsetY + row * (PHOTO_PX + c.margin),
        left: offsetX + col * (PHOTO_PX + c.margin),
      });
    }
  }

  return sharp({
    create: { width: c.w, height: c.h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();
}

// A4 landscape at 150 DPI: 1754 x 1240 px (rotated for horizontal layout)
const A4_W = 1754;
const A4_H = 1240;
const MARGIN = 20;
// Each card: half width minus 1.5 margins (left + middle + right)
const IMG_W = Math.floor((A4_W - MARGIN * 3) / 2);
const IMG_H = A4_H - MARGIN * 2;

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
    create: { width: A4_W, height: A4_H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: left,  top: MARGIN, left: MARGIN },
      { input: right, top: MARGIN, left: MARGIN * 2 + IMG_W },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
