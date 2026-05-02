import sharp from 'sharp';

// A4 at 150 DPI: 1240 x 1754 px
const A4_W = 1240;
const A4_H = 1754;
const MARGIN = 20;
const IMG_W = A4_W - MARGIN * 2;
const IMG_H = Math.floor((A4_H - MARGIN * 3) / 2); // two images + 3 margins

export async function generateAadhaarLayout(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length !== 2) throw new Error('Exactly 2 images required');

  const [top, bottom] = await Promise.all([
    sharp(buffers[0]).resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } }).jpeg().toBuffer(),
    sharp(buffers[1]).resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } }).jpeg().toBuffer(),
  ]);

  return sharp({
    create: { width: A4_W, height: A4_H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: top,    top: MARGIN,              left: MARGIN },
      { input: bottom, top: MARGIN * 2 + IMG_H,  left: MARGIN },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
