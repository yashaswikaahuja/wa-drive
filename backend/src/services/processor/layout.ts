import sharp from 'sharp';

// ── Passport photo spec (2×2 inch at 300 DPI) ────────────────────────────────
// 600×600 px per photo slot
// Head must occupy 70–80% of frame height → we crop to a 1:1 region centered
// on the face using Sharp's "attention" gravity (saliency-based, finds faces/eyes)
// then pad to exact slot size with white background.

const PHOTO_PX = 600; // 2 inch × 300 DPI

// Sheet configs at 300 DPI
const SHEET_CONFIGS = {
  '4x6': { w: 1800, h: 1200, cols: 3, rows: 2, margin: 50 },
  'a4':  { w: 2480, h: 3508, cols: 4, rows: 6, margin: 60 },
} as const;

/**
 * Prepare a single passport photo from any input image:
 * 1. Smart-crop to square using "attention" gravity (finds face/eyes automatically)
 * 2. Flatten transparency → white background
 * 3. Resize to exact PHOTO_PX × PHOTO_PX with white padding (contain)
 */
async function preparePassportPhoto(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const { width = 0, height = 0 } = meta;

  // Crop to the largest square centered on the most salient region (face)
  const squareSize = Math.min(width, height);

  return sharp(input)
    // Step 1: smart square crop — "attention" uses saliency to find face/eyes
    .resize(squareSize, squareSize, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    // Step 2: flatten transparency (PNG with removed background → white)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    // Step 3: resize to exact passport slot with white padding to preserve aspect
    .resize(PHOTO_PX, PHOTO_PX, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
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

  const composites: sharp.OverlayOptions[] = [];
  const totalW = c.cols * PHOTO_PX + (c.cols + 1) * c.margin;
  const totalH = c.rows * PHOTO_PX + (c.rows + 1) * c.margin;
  const offsetX = Math.floor((c.w - totalW) / 2);
  const offsetY = Math.floor((c.h - totalH) / 2);

  for (let row = 0; row < c.rows; row++) {
    for (let col = 0; col < c.cols; col++) {
      composites.push({
        input: photo,
        top:  offsetY + c.margin + row * (PHOTO_PX + c.margin),
        left: offsetX + c.margin + col * (PHOTO_PX + c.margin),
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
