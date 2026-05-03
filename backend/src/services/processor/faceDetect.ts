import sharp from 'sharp';
import FormData from 'form-data';

const FACEPP_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

interface FaceRect { top: number; left: number; width: number; height: number; }

/** Call Face++ detect API, return the largest face rectangle or null */
async function detectFace(imageBuffer: Buffer): Promise<FaceRect | null> {
  const key    = process.env['FACEPP_API_KEY'];
  const secret = process.env['FACEPP_API_SECRET'];
  if (!key || !secret) { console.warn('[FacePP] API keys not set — skipping'); return null; }

  console.log(`[FacePP] Calling detect API (buffer: ${imageBuffer.length} bytes)`);

  const form = new FormData();
  form.append('api_key', key);
  form.append('api_secret', secret);
  form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  form.append('return_attributes', 'none');

  const res = await fetch(FACEPP_URL, { method: 'POST', body: form as any });
  const data = await res.json() as { faces?: Array<{ face_rectangle: FaceRect }>; error_message?: string };

  console.log(`[FacePP] Response: faces=${data.faces?.length ?? 0}${data.error_message ? ' error=' + data.error_message : ''}`);

  if (!res.ok || data.error_message) {
    console.error('[FacePP] API error:', data.error_message ?? res.status);
    return null;
  }
  if (!data.faces?.length) { console.warn('[FacePP] No face detected'); return null; }

  const face = data.faces.reduce((best, f) => {
    const area = f.face_rectangle.width * f.face_rectangle.height;
    const bestArea = best.width * best.height;
    return area > bestArea ? f.face_rectangle : best;
  }, data.faces[0].face_rectangle);

  console.log(`[FacePP] Face rect: top=${face.top} left=${face.left} w=${face.width} h=${face.height}`);
  return face;
}

/**
 * Crop image around detected face with padding, then resize to target dimensions.
 *
 * Padding strategy (based on ICAO passport standard):
 *   - Top:    80% of face height above crown (hair + space)
 *   - Bottom: 60% of face height below chin
 *   - Sides:  50% of face width on each side
 *
 * Falls back to top-biased attention crop if no face detected.
 */
export async function cropAndAlignFace(
  input: Buffer,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  const { width = 600, height = 800 } = await sharp(input).metadata();

  let cropBox: { left: number; top: number; width: number; height: number } | null = null;

  try {
    const face = await detectFace(input);
    if (face) {
      const padTop    = Math.round(face.height * 0.80);
      const padBottom = Math.round(face.height * 0.60);
      const padSide   = Math.round(face.width  * 0.50);

      const left   = Math.max(0, face.left - padSide);
      const top    = Math.max(0, face.top  - padTop);
      const right  = Math.min(width,  face.left + face.width  + padSide);
      const bottom = Math.min(height, face.top  + face.height + padBottom);

      cropBox = { left, top, width: right - left, height: bottom - top };
      console.log(`[FacePP] Crop box: left=${left} top=${top} w=${cropBox.width} h=${cropBox.height}`);
    }
  } catch (e: any) {
    console.warn('[FacePP] Detection failed, using fallback:', e.message);
  }

  let cropped: Buffer;
  if (cropBox) {
    console.log('[FacePP] Using face-detected crop');
    cropped = await sharp(input).extract(cropBox).toBuffer();
  } else {
    console.log('[FacePP] Using attention fallback crop');
    const cropH = Math.round(height * 0.80);
    const squareSize = Math.min(width, cropH);
    cropped = await sharp(input)
      .extract({ left: 0, top: 0, width, height: cropH })
      .resize(squareSize, squareSize, { fit: 'cover', position: sharp.strategy.attention })
      .toBuffer();
  }

  return sharp(cropped)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(targetW, targetH, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}
