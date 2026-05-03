import sharp from 'sharp';
import { cropAndAlignFace } from './faceDetect.js';

const MM = (mm: number) => Math.round(mm * 300 / 25.4);

export const PHOTO_SPECS = {
  'standard': { w: MM(35), h: MM(45), label: '35×45mm (Passport/PAN/Aadhaar)' },
  'small':    { w: MM(25), h: MM(30), label: '25×30mm (School/College)' },
  'stamp':    { w: MM(20), h: MM(25), label: '20×25mm (Stamp size)' },
} as const;
export type PhotoSpec = keyof typeof PHOTO_SPECS;

export const SHEET_PRESETS = {
  '4x6-8':  { sw: 1800, sh: 1200, cols: 4, rows: 2, label: '4×6 · 8 photos (Standard)' },
  '4x6-12': { sw: 1800, sh: 1200, cols: 4, rows: 3, label: '4×6 · 12 photos (Small)' },
  '4x6-4':  { sw: 1200, sh: 1800, cols: 2, rows: 2, label: '4×6 · 4 photos (Large)' },
  'a4-24':  { sw: 2480, sh: 3508, cols: 4, rows: 6, label: 'A4 · 24 photos (Bulk)' },
} as const;
export type SheetPreset = keyof typeof SHEET_PRESETS;

// No outer margin — photos fill edge to edge like real photo studios
const MARGIN = 0;
const GAP    = 6;  // tiny gap for cutting guide only

async function preparePhoto(input: Buffer, pw: number, ph: number): Promise<Buffer> {
  return cropAndAlignFace(input, pw, ph, { pad: 0.9 });
}

/**
 * Add name/date/signature line at the bottom of a photo using SVG overlay.
 * Text is white on a semi-transparent dark strip for readability on any background.
 */
async function addTextOverlay(
  photoBuffer: Buffer,
  pw: number,
  ph: number,
  text: { name?: string; date?: string; signature?: boolean },
): Promise<Buffer> {
  const lines: string[] = [];
  if (text.name) lines.push(text.name);
  if (text.date) lines.push(text.date);

  const lineH = Math.round(ph * 0.07);   // 7% of photo height per line
  const fontSize = Math.round(lineH * 0.55);
  const stripH = lines.length * lineH + (text.signature ? lineH * 1.5 : 0);
  const stripY = ph - stripH;

  let svgContent = `<rect x="0" y="${stripY}" width="${pw}" height="${stripH}" fill="rgba(0,0,0,0.45)"/>`;

  lines.forEach((line, i) => {
    const y = stripY + lineH * (i + 0.75);
    svgContent += `<text x="${pw / 2}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" fill="white" text-anchor="middle">${line}</text>`;
  });

  if (text.signature) {
    const sigY = ph - lineH * 0.8;
    const sigLineY = ph - lineH * 0.3;
    svgContent += `<text x="${pw / 2}" y="${sigY}" font-family="Arial,sans-serif" font-size="${Math.round(fontSize * 0.7)}" fill="#aaa" text-anchor="middle">Sign here</text>`;
    svgContent += `<line x1="${pw * 0.15}" y1="${sigLineY}" x2="${pw * 0.85}" y2="${sigLineY}" stroke="white" stroke-width="1"/>`;
  }

  const svg = Buffer.from(`<svg width="${pw}" height="${ph}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`);

  return sharp(photoBuffer)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function generatePassportSheet(
  photoBuffer: Buffer,
  preset: SheetPreset = '4x6-8',
  spec: PhotoSpec = 'standard',
  text?: { name?: string; date?: string; signature?: boolean },
): Promise<Buffer> {
  const { sw, sh, cols, rows } = SHEET_PRESETS[preset];
  const { w: specW, h: specH } = PHOTO_SPECS[spec];
  const aspect = specH / specW;

  const pw = Math.floor((sw - (cols - 1) * GAP) / cols);
  const maxPh = Math.floor((sh - (rows - 1) * GAP) / rows);
  const ph = Math.min(Math.round(pw * aspect), maxPh);

  let photo = await preparePhoto(photoBuffer, pw, ph);
  if (text && (text.name || text.date || text.signature)) {
    photo = await addTextOverlay(photo, pw, ph, text);
  }

  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      composites.push({
        input: photo,
        left: col * (pw + GAP),
        top:  row * (ph + GAP),
      });
    }
  }

  // Sheet height = exact content height (no wasted space)
  const finalH = rows * ph + (rows - 1) * GAP;

  return sharp({
    create: { width: sw, height: finalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .withMetadata({ density: 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function generateSingleSheet(
  photoBuffer: Buffer,
  spec: PhotoSpec = 'standard',
): Promise<Buffer> {
  const SW = 1800, SH = 1200;
  const { w: specW, h: specH } = PHOTO_SPECS[spec];
  const aspect = specH / specW;
  let w = SW, h = Math.round(SW * aspect);
  if (h > SH) { h = SH; w = Math.round(SH / aspect); }

  const photo = await preparePhoto(photoBuffer, w, h);
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([{ input: photo, left: 0, top: 0 }])
    .withMetadata({ density: 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// ── Aadhaar layout ────────────────────────────────────────────────────────────
const AADHAAR_W = 1754, AADHAAR_H = 1240, AADHAAR_MARGIN = 20;
const IMG_W = Math.floor((AADHAAR_W - AADHAAR_MARGIN * 3) / 2);
const IMG_H = AADHAAR_H - AADHAAR_MARGIN * 2;

export async function generateAadhaarLayout(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length !== 2) throw new Error('Exactly 2 images required');
  const [left, right] = await Promise.all([
    sharp(buffers[0]).resize(IMG_W, IMG_H, { fit: 'inside' }).flatten({ background: { r: 255, g: 255, b: 255 } }).resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } }).jpeg().toBuffer(),
    sharp(buffers[1]).resize(IMG_W, IMG_H, { fit: 'inside' }).flatten({ background: { r: 255, g: 255, b: 255 } }).resize(IMG_W, IMG_H, { fit: 'contain', background: { r: 255, g: 255, b: 255 } }).jpeg().toBuffer(),
  ]);
  return sharp({ create: { width: AADHAAR_W, height: AADHAAR_H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: left, top: AADHAAR_MARGIN, left: AADHAAR_MARGIN }, { input: right, top: AADHAAR_MARGIN, left: AADHAAR_MARGIN * 2 + IMG_W }])
    .jpeg({ quality: 90 }).toBuffer();
}
