import sharp from 'sharp';
import FormData from 'form-data';
import https from 'https';
import crypto from 'crypto';

const FACEPP_HOST = 'api-us.faceplusplus.com';
const FACEPP_PATH = '/facepp/v3/detect';

export interface FaceRect { top: number; left: number; width: number; height: number; }

// ── In-memory cache: md5(buffer) → FaceRect | null ───────────────────────────
// Avoids repeated Face++ API calls for the same image (e.g. generating multiple sheets)
const faceCache = new Map<string, FaceRect | null>();

function bufferHash(buf: Buffer): string {
  return crypto.createHash('md5').update(buf).digest('hex');
}

// ── Last uploaded image store (for /debug/last-image endpoint) ────────────────
let lastImageBuffer: Buffer | null = null;
export function setLastImage(buf: Buffer) { lastImageBuffer = buf; }
export function getLastImage() { return lastImageBuffer; }

/** Call Face++ detect API, return largest face rect or null. Results are cached. */
export async function detectFace(imageBuffer: Buffer): Promise<FaceRect | null> {
  const hash = bufferHash(imageBuffer);
  if (faceCache.has(hash)) {
    console.log(`[FacePP] Cache hit (${hash.slice(0, 8)})`);
    return faceCache.get(hash)!;
  }

  const key    = process.env['FACEPP_API_KEY'];
  const secret = process.env['FACEPP_API_SECRET'];
  if (!key || !secret) { console.warn('[FacePP] API keys not set — skipping'); return null; }

  console.log(`[FacePP] Calling detect API (${imageBuffer.length} bytes)`);

  const result = await new Promise<FaceRect | null>((resolve) => {
    const form = new FormData();
    form.append('api_key', key);
    form.append('api_secret', secret);
    form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    form.append('return_attributes', 'none');

    const req = https.request(
      { hostname: FACEPP_HOST, path: FACEPP_PATH, method: 'POST', headers: form.getHeaders() },
      (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as {
              faces?: Array<{ face_rectangle: FaceRect }>;
              error_message?: string;
            };
            console.log(`[FacePP] faces=${json.faces?.length ?? 0}${json.error_message ? ' err=' + json.error_message : ''}`);
            if (json.error_message || !json.faces?.length) { resolve(null); return; }
            const face = json.faces.reduce((best, f) =>
              f.face_rectangle.width * f.face_rectangle.height > best.width * best.height
                ? f.face_rectangle : best,
              json.faces[0].face_rectangle,
            );
            console.log(`[FacePP] rect top=${face.top} left=${face.left} w=${face.width} h=${face.height}`);
            resolve(face);
          } catch { resolve(null); }
        });
      },
    );
    req.on('error', (e) => { console.error('[FacePP] error:', e.message); resolve(null); });
    form.pipe(req);
  });

  faceCache.set(hash, result);
  return result;
}

/**
 * Crop and align face. Options:
 *   pad   — padding multiplier (default 0.9). Higher = more space around face.
 *   debug — if true, draws face rect and crop box as SVG overlay on the output.
 */
export async function cropAndAlignFace(
  input: Buffer,
  targetW: number,
  targetH: number,
  options: { pad?: number; debug?: boolean } = {},
): Promise<Buffer> {
  const { pad = 0.9, debug = false } = options;
  const { width = 600, height = 800 } = await sharp(input).metadata();

  let cropBox: { left: number; top: number; width: number; height: number } | null = null;
  let faceRect: FaceRect | null = null;

  try {
    faceRect = await detectFace(input);
    if (faceRect) {
      const padTop    = Math.round(faceRect.height * 1.3);   // full hair + forehead space
      const padBottom = Math.round(faceRect.height * 1.8);   // chin + neck + shoulders
      const padSide   = Math.round(faceRect.width  * 0.7);   // side breathing room

      const left   = Math.max(0, faceRect.left - padSide);
      const top    = Math.max(0, faceRect.top  - padTop);
      const right  = Math.min(width,  faceRect.left + faceRect.width  + padSide);
      const bottom = Math.min(height, faceRect.top  + faceRect.height + padBottom);
      cropBox = { left, top, width: right - left, height: bottom - top };
      console.log(`[FacePP] crop left=${left} top=${top} w=${cropBox.width} h=${cropBox.height}`);
    }
  } catch (e: any) {
    console.warn('[FacePP] fallback:', e.message);
  }

  let cropped: Buffer;
  if (cropBox) {
    let extracted = await sharp(input).extract(cropBox).toBuffer();
    // If crop hit top edge, add white padding so hair isn't touching frame
    if (cropBox.top === 0) {
      const extraPad = Math.round(cropBox.height * 0.12);
      extracted = await sharp(extracted)
        .extend({ top: extraPad, bottom: 0, left: 0, right: 0, background: { r: 255, g: 255, b: 255 } })
        .toBuffer();
    }
    cropped = extracted;
  } else {
    console.log('[FacePP] using attention fallback');
    const cropH = Math.round(height * 0.80);
    const sq = Math.min(width, cropH);
    cropped = await sharp(input)
      .extract({ left: 0, top: 0, width, height: cropH })
      .resize(sq, sq, { fit: 'cover', position: sharp.strategy.attention })
      .toBuffer();
  }

  const result = await sharp(cropped)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .normalize()
    .modulate({ brightness: 1.04, saturation: 1.08 })
    .gamma(1.05)
    .resize(targetW, targetH, { fit: 'cover', position: 'north' })
    .withMetadata({ density: 300 })
    .jpeg({ quality: 95 })
    .toBuffer();

  // Debug overlay: draw face rect and crop box as coloured rectangles
  if (debug && faceRect && cropBox) {
    const scaleX = targetW / (cropBox.width  || 1);
    const scaleY = targetH / (cropBox.height || 1);
    const fx = Math.round((faceRect.left - cropBox.left) * scaleX);
    const fy = Math.round((faceRect.top  - cropBox.top)  * scaleY);
    const fw = Math.round(faceRect.width  * scaleX);
    const fh = Math.round(faceRect.height * scaleY);

    const svg = `<svg width="${targetW}" height="${targetH}">
      <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}"
            fill="none" stroke="red" stroke-width="3"/>
      <text x="${fx+4}" y="${fy+16}" font-size="14" fill="red">face</text>
    </svg>`;

    return sharp(result)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  return result;
}
