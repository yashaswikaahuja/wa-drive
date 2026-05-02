import sharp from 'sharp';

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
    sharp(buffers[0]).resize(IMG_W, IMG_H, { fit: 'cover', position: 'centre' }).jpeg().toBuffer(),
    sharp(buffers[1]).resize(IMG_W, IMG_H, { fit: 'cover', position: 'centre' }).jpeg().toBuffer(),
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
