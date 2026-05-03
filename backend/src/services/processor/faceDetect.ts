import sharp from 'sharp';
import FormData from 'form-data';
import https from 'https';

const FACEPP_HOST = 'api-us.faceplusplus.com';
const FACEPP_PATH = '/facepp/v3/detect';

interface FaceRect { top: number; left: number; width: number; height: number; }

/** Call Face++ detect API using https (compatible with form-data package) */
async function detectFace(imageBuffer: Buffer): Promise<FaceRect | null> {
  const key    = process.env['FACEPP_API_KEY'];
  const secret = process.env['FACEPP_API_SECRET'];
  if (!key || !secret) { console.warn('[FacePP] API keys not set — skipping'); return null; }

  console.log(`[FacePP] Calling detect API (buffer: ${imageBuffer.length} bytes)`);

  return new Promise((resolve) => {
    const form = new FormData();
    form.append('api_key', key);
    form.append('api_secret', secret);
    form.append('image_file', imageBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    form.append('return_attributes', 'none');

    const options = {
      hostname: FACEPP_HOST,
      path: FACEPP_PATH,
      method: 'POST',
      headers: form.getHeaders(),
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as {
            faces?: Array<{ face_rectangle: FaceRect }>;
            error_message?: string;
          };
          console.log(`[FacePP] Response: faces=${json.faces?.length ?? 0}${json.error_message ? ' error=' + json.error_message : ''}`);
          if (json.error_message || !json.faces?.length) {
            if (json.error_message) console.error('[FacePP] API error:', json.error_message);
            else console.warn('[FacePP] No face detected');
            resolve(null); return;
          }
          const face = json.faces.reduce((best, f) => {
            return f.face_rectangle.width * f.face_rectangle.height >
                   best.width * best.height ? f.face_rectangle : best;
          }, json.faces[0].face_rectangle);
          console.log(`[FacePP] Face rect: top=${face.top} left=${face.left} w=${face.width} h=${face.height}`);
          resolve(face);
        } catch { resolve(null); }
      });
    });

    req.on('error', (e) => { console.error('[FacePP] Request error:', e.message); resolve(null); });
    form.pipe(req);
  });
}

/**
 * Crop image around detected face with padding, then resize to target dimensions.
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
      // Passport standard: head fills 70-80% of frame height
      // Tight padding to avoid too much body/background
      const padTop    = Math.round(face.height * 0.50);  // space above crown (hair)
      const padBottom = Math.round(face.height * 0.30);  // small chin space
      const padSide   = Math.round(face.width  * 0.35);  // side padding

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
