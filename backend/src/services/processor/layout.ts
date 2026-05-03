import sharp from 'sharp';

// Sheet configs at 300 DPI
const SHEET_CONFIGS = {
  '4x6': { w: 1800, h: 1200, cols: 3, rows: 2, photoW: 525, photoH: 675, margin: 50 },
  'a4':  { w: 2480, h: 3508, cols: 4, rows: 6, photoW: 525, photoH: 675, margin: 60 },
} as const;

export async function generatePassportSheet(
  photoBuffer: Buffer,
  sheet: '4x6' | 'a4' = '4x6',
): Promise<Buffer> {
  const c = SHEET_CONFIGS[sheet];

  // Resize photo to exact slot size
  const photo = await sharp(photoBuffer)
    .resize(c.photoW, c.photoH, { fit: 'cover' })
    .jpeg({ quality: 95 })
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];
  const totalW = c.cols * c.photoW + (c.cols + 1) * c.margin;
  const totalH = c.rows * c.photoH + (c.rows + 1) * c.margin;
  const offsetX = Math.floor((c.w - totalW) / 2);
  const offsetY = Math.floor((c.h - totalH) / 2);

  for (let row = 0; row < c.rows; row++) {
    for (let col = 0; col < c.cols; col++) {
      composites.push({
        input: photo,
        top: offsetY + c.margin + row * (c.photoH + c.margin),
        left: offsetX + c.margin + col * (c.photoW + c.margin),
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
