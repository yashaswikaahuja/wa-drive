import sharp from 'sharp';

// ── 4×6 sheet @ 300 DPI ──────────────────────────────────────────────────────
// Sheet:  1800 × 1200 px  (6 in × 4 in)
// Photos: 8 total — 2 cols × 4 rows
// Photo:  413 × 531 px   (35mm × 45mm @ 300 DPI — standard passport size)
// Outer margin: 50 px on all sides
// Gap between photos: computed to fill remaining space evenly
//
// Math:
//   usableW = 1800 - 2×50 = 1700
//   usableH = 1200 - 2×50 = 1100
//   gapX = (usableW - 2×413) / 1 = 874 px  ← gap between 2 cols
//   gapY = (usableH - 4×531) / 3 = (1100 - 2124) / 3 → negative!
//
// 4 rows of 531px = 2124px > 1100px usable height on a 4-inch sheet.
// Solution: use landscape orientation (rotate sheet) OR reduce photo height.
// Standard approach: 4×6 landscape = 1800w × 1200h, 2 cols × 4 rows doesn't fit.
//
// CORRECT layout for 4×6 (landscape):
//   2 cols × 4 rows requires portrait sheet (1200w × 1800h) — i.e., 4×6 portrait
//   OR use 4 cols × 2 rows on landscape.
//
// We use: 4×6 PORTRAIT sheet (1200 × 1800 px), 2 cols × 4 rows = 8 photos
// Photo size: 413 × 531 px (35×45mm @ 300 DPI)
// Outer margin: 50 px
// usableW = 1200 - 2×50 = 1100 → gapX = (1100 - 2×413) / 1 = 274 px
// usableH = 1800 - 2×50 = 1700 → gapY = (1700 - 4×531) / 3 = (1700-2124)/3 → still negative
//
// Root issue: 4 rows of 45mm photos don't fit on a 4-inch (101.6mm) sheet.
// Real passport print sheets use 4×6 LANDSCAPE with 4 cols × 2 rows = 8 photos.
//
// FINAL CORRECT LAYOUT:
//   Sheet: 1800 × 1200 px (4×6 landscape @ 300 DPI)
//   Grid:  4 cols × 2 rows = 8 photos
//   Photo: 413 × 531 px (35×45mm)
//   Outer margin: 50 px
//   usableW = 1800 - 2×50 = 1700 → gapX = (1700 - 4×413) / 3 = (1700-1652)/3 = 16 px
//   usableH = 1200 - 2×50 = 1100 → gapY = (1100 - 2×531) / 1 = 38 px
//   Total: 4×2 = 8 photos ✓, gaps ≥ 16 px ✓

const SHEET_W = 1800;   // 6 in × 300 DPI
const SHEET_H = 1200;   // 4 in × 300 DPI
const PHOTO_W = 413;    // 35mm × 300/25.4
const PHOTO_H = 531;    // 45mm × 300/25.4
const COLS = 4;
const ROWS = 2;
const MARGIN = 50;      // outer border on all sides

// Computed gaps (distribute remaining space evenly between photos)
const GAP_X = Math.floor((SHEET_W - 2 * MARGIN - COLS * PHOTO_W) / (COLS - 1)); // ~16 px
const GAP_Y = Math.floor((SHEET_H - 2 * MARGIN - ROWS * PHOTO_H) / (ROWS - 1)); // ~38 px

// A4 sheet: 2480 × 3508 px — 4 cols × 6 rows = 24 photos
const A4_W = 2480;
const A4_H = 3508;
const A4_COLS = 4;
const A4_ROWS = 6;
const A4_MARGIN = 60;
const A4_GAP_X = Math.floor((A4_W - 2 * A4_MARGIN - A4_COLS * PHOTO_W) / (A4_COLS - 1));
const A4_GAP_Y = Math.floor((A4_H - 2 * A4_MARGIN - A4_ROWS * PHOTO_H) / (A4_ROWS - 1));

/**
 * Prepare a single passport photo:
 * 1. Extract upper 80% of image (face area in portraits)
 * 2. Smart square crop using attention strategy (finds face/eyes)
 * 3. Flatten transparency → white
 * 4. Resize to PHOTO_W × PHOTO_H with white padding (no distortion)
 */
async function preparePassportPhoto(input: Buffer): Promise<Buffer> {
  const { width = 600, height = 800 } = await sharp(input).metadata();

  // Extract top 80% to bias toward face — avoids lower body in full-body shots
  const cropH = Math.round(height * 0.80);
  const cropped = await sharp(input)
    .extract({ left: 0, top: 0, width, height: cropH })
    .toBuffer();

  // Smart square crop using attention (saliency finds eyes/face)
  const squareSize = Math.min(width, cropH);
  const square = await sharp(cropped)
    .resize(squareSize, squareSize, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .toBuffer();

  // Flatten + resize to exact passport dimensions with white padding
  return sharp(square)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(PHOTO_W, PHOTO_H, {
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
  const photo = await preparePassportPhoto(photoBuffer);

  const is4x6 = sheet === '4x6';
  const sw = is4x6 ? SHEET_W : A4_W;
  const sh = is4x6 ? SHEET_H : A4_H;
  const cols = is4x6 ? COLS : A4_COLS;
  const rows = is4x6 ? ROWS : A4_ROWS;
  const margin = is4x6 ? MARGIN : A4_MARGIN;
  const gapX = is4x6 ? GAP_X : A4_GAP_X;
  const gapY = is4x6 ? GAP_Y : A4_GAP_Y;

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      composites.push({
        input: photo,
        left: margin + col * (PHOTO_W + gapX),
        top:  margin + row * (PHOTO_H + gapY),
      });
    }
  }

  return sharp({
    create: { width: sw, height: sh, channels: 3, background: { r: 255, g: 255, b: 255 } },
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
