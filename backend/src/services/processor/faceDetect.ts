import sharp from 'sharp';
import FormData from 'form-data';

const FACEPP_URL = 'https://api-us.faceplusplus.com/facepp/v3/detect';

interface FaceRect { top: number; left: number; width: number; height: number; }

/** Call Face++ detect API, return the largest face rectangle or null */
async function detectFace(imageBuffer: Buffer): Promise<FaceRect | null> {
  const key    = process.env['FACEPP_API_KEY'];
  const secret = process.env['FACEPP_API_SECRET'];
  if (!key || !secret) return null;

  const form = new FormData();
  form.append('api_key', key);
  form.append('api_secret', secret);
  form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  form.append('return_attributes', 'none');

  const res = await fetch(FACEPP_URL, { method: 'POST', body: form as any });
  if (!res.ok) return null;

  const data = await res.json() as { faces?: Array<{ face_rectangle: FaceRect }> };
  if (!data.faces?.length) return null;

  // Pick the largest face (by area) in case multiple faces detected
  return data.faces.reduce((best, f) => {
    const area = f.face_rectangle.width * f.face_rectangle.height;
    const bestArea = best.width * best.height;
    return area > bestArea ? f.face_rectangle : best;
  }, data.faces[0].face_rectangle);
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
    }
  } catch {
    // Face++ unavailable — fall through to fallback
  }

  let cropped: Buffer;
  if (cropBox) {
    cropped = await sharp(input)
      .extract(cropBox)
      .toBuffer();
  } else {
    // Fallback: top-biased attention crop (no face detected or API unavailable)
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
