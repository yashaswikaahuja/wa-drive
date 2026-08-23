import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import { google } from 'googleapis';
import multer from 'multer';
import { generateAadhaarLayout, generatePassportSheet, generateSingleSheet, SheetPreset, PhotoSpec, cropAndAlignFace, setLastImage, getLastImage } from '@cybercontrol/backend-documents';
import { getDriveForWorkspace } from '@cybercontrol/backend-drive';

const router: ExpressRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

async function downloadDriveFile(fileId: string, req: any): Promise<Buffer> {
  const drive = await getDriveForWorkspace(req.user?.workspaceId);
  if (!drive) throw new Error('Drive not connected for this workspace');
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
}

router.post('/', async (req: Request, res: Response) => {
  const { fileIds, action } = req.body as { fileIds?: string[]; action?: string };

  if (!fileIds || fileIds.length !== 2) {
    res.status(400).json({ error: 'Provide exactly 2 fileIds' }); return;
  }
  if (action !== 'aadhaar_layout') {
    res.status(400).json({ error: 'Unknown action' }); return;
  }

  // Access token is stored on the hub — retrieve from module-level state
  // Drive access handled per-workspace in downloadDriveFile

  try {
    console.log(`[Process] Aadhaar layout for files: ${fileIds.join(', ')}`);
    const buffers = await Promise.all(fileIds.map(id => downloadDriveFile(id, req)));
    const output = await generateAadhaarLayout(buffers);
    console.log(`[Process] Layout generated: ${output.length} bytes`);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'inline; filename="aadhaar_layout.jpg"');
    res.send(output);
  } catch (e) {
    console.error('[Process] Error:', e);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// POST /api/process/passport-sheet
// Accepts: JSON { fileId } OR multipart image_file (for bg-removed images)
router.post('/passport-sheet', upload.single('image_file') as any, async (req: Request, res: Response) => {
  const { fileId, preset = '4x6-8', spec = 'standard', name, date, signature, font = 'bold' } = req.body as {
    fileId?: string; preset?: string; spec?: string;
    name?: string; date?: string; signature?: boolean; font?: string;
  };
  const validPresets = ['4x6-8', '4x6-12', '4x6-4', 'a4-24', 'single'];
  const validSpecs   = ['standard', 'small', 'stamp'];
  if (!validPresets.includes(preset)) { res.status(400).json({ error: `preset must be one of: ${validPresets.join(', ')}` }); return; }
  if (!validSpecs.includes(spec))     { res.status(400).json({ error: `spec must be one of: ${validSpecs.join(', ')}` }); return; }

  let buffer: Buffer;
  try {
    if ((req as any).file) {
      // Multipart upload — bg-removed image from frontend
      buffer = (req as any).file.buffer;
    } else if (fileId) {
      // Drive handled per-workspace
      buffer = await downloadDriveFile(fileId, req);
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId' }); return;
    }
    const textOpts = (name || date || signature) ? { name, date, signature } : undefined;
    const output = preset === 'single'
      ? await generateSingleSheet(buffer, spec as PhotoSpec)
      : await generatePassportSheet(buffer, preset as SheetPreset, spec as PhotoSpec, textOpts, font as any);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `inline; filename="photos_${preset}_${spec}.jpg"`);
    res.send(output);
  } catch (e: any) {
    console.error('[Process] passport-sheet error:', e.message);
    res.status(500).json({ error: e.message ?? 'Sheet generation failed' });
  }
});

// POST /api/process/face-align
// Accepts: multipart image_file OR JSON { fileId }
// Query params: ?pad=0.9 (crop padding), ?debug=true (draw face box overlay)
// Returns: aligned passport photo (600×600 JPEG)
router.post('/face-align', upload.single('image_file') as any, async (req: any, res: Response) => {
  const pad   = parseFloat(req.query.pad as string)   || 0.9;
  const debug = req.query.debug === 'true';

  let imageBuffer: Buffer;
  try {
    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body?.fileId) {
      // Drive handled per-workspace
      imageBuffer = await downloadDriveFile(req.body.fileId, req);
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId (JSON)' }); return;
    }

    setLastImage(imageBuffer);
    const aligned = await cropAndAlignFace(imageBuffer, 600, 600, { pad, debug });
    res.set('Content-Type', 'image/jpeg');
    res.send(aligned);
  } catch (e: any) {
    console.error('[Process] face-align error:', e.message);
    res.status(500).json({ error: e.message ?? 'Face alignment failed' });
  }
});

// GET /api/process/debug/last-image
// Re-runs face detection + crop on the last uploaded image — no re-upload needed
// Query params: ?pad=0.9&debug=true
router.get('/debug/last-image', async (req: Request, res: Response) => {
  const buf = getLastImage();
  if (!buf) { res.status(404).json({ error: 'No image uploaded yet' }); return; }
  const pad   = parseFloat(req.query.pad as string)   || 0.9;
  const debug = req.query.debug !== 'false';  // debug=true by default for this endpoint
  try {
    const result = await cropAndAlignFace(buf, 600, 600, { pad, debug });
    res.set('Content-Type', 'image/jpeg');
    res.send(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

// POST /api/process/extract
router.post('/extract', async (req: any, res: Response) => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) { res.status(400).json({ error: 'fileId required' }); return; }

  // Instant path: return cached extraction if auto-extract already ran on arrival
  try {
    const { getCachedExtraction } = await import('@cybercontrol/backend-documents');
    const cached = await getCachedExtraction(fileId);
    if (cached && Object.keys(cached).length > 0) {
      res.json({ ok: true, suggested: cached, cached: true });
      return;
    }
  } catch {}

  // Use the shared extraction pipeline (normalizeKeys → correct sections, provenance, validation)
  try {
    const buffer = await downloadDriveFile(fileId, req);
    const { extractFromBuffer, cacheExtraction } = await import('@cybercontrol/backend-documents');
    const { suggested } = await extractFromBuffer(buffer, fileId);
    if (req.user?.workspaceId && Object.keys(suggested).length > 0) {
      try { await cacheExtraction(fileId, req.user.workspaceId, suggested); } catch {}
    }
    res.json({ ok: true, suggested });
    return;
  } catch (e: any) {
    console.error('[Process] extract error:', e.message);
    res.status(500).json({ error: e.message ?? 'Extraction failed' });
    return;
  }

});
