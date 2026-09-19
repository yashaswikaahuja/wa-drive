import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import { google } from 'googleapis';
import multer from 'multer';
import { pool, REMOVE_BG_KEY } from '@cybercontrol/backend-core';
import { generateAadhaarLayout, generatePassportSheet, generateSingleSheet, SheetPreset, PhotoSpec, cropAndAlignFace, setLastImage, getLastImage } from '@cybercontrol/backend-documents';
import { getDriveForWorkspace } from '@cybercontrol/backend-drive';

const router: ExpressRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

/** Resolve Hub UUID → Google Drive file id when needed. */
async function resolveGoogleFileId(fileId: string, workspaceId?: string): Promise<string> {
  // Google ids are not UUIDs; our drive_files.id is.
  const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  if (!looksUuid) return fileId;
  if (!workspaceId) return fileId;
  const row = (await pool.query(
    'SELECT drive_file_id FROM drive_files WHERE id::text = $1 AND workspace_id = $2 LIMIT 1',
    [fileId, workspaceId],
  )).rows[0];
  if (!row?.drive_file_id) throw new Error(`Document not found for id ${fileId}`);
  return row.drive_file_id;
}

async function downloadDriveFile(fileId: string, req: any): Promise<Buffer> {
  const drive = await getDriveForWorkspace(req.user?.workspaceId);
  if (!drive) throw new Error('Drive not connected for this workspace');
  const googleId = await resolveGoogleFileId(fileId, req.user?.workspaceId);
  try {
    const res = await drive.files.get(
      { fileId: googleId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    const buf = Buffer.from(res.data as ArrayBuffer);
    // Google returns JSON error bodies with HTTP 200 in some edge cases / wrong clients.
    if (buf.length < 500) {
      const text = buf.toString('utf8');
      if (text.startsWith('{') && /"error"/.test(text)) {
        throw new Error(`Drive download failed for ${googleId}: ${text.slice(0, 180)}`);
      }
    }
    return buf;
  } catch (e: any) {
    const status = e?.code || e?.response?.status;
    const detail = e?.response?.data
      ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)).slice(0, 200)
      : '';
    if (status === 404) throw new Error(`Drive file not found or deleted: ${googleId}`);
    if (status === 401 || status === 403) throw new Error('Drive authorization failed — reconnect Google Drive in Settings');
    if (status === 400) throw new Error(`Drive download rejected (400) for ${googleId}${detail ? `: ${detail}` : ''}`);
    throw e;
  }
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

/**
 * POST /api/process/remove-bg
 * Multipart `image_file` OR JSON `{ fileId }` → transparent PNG via remove.bg
 * (also mounted at /api/remove-bg for older clients).
 */
router.post('/remove-bg', upload.single('image_file') as any, async (req: any, res: Response) => {
  if (!REMOVE_BG_KEY) {
    res.status(503).json({ error: 'Background removal not configured (REMOVE_BG_API_KEY)' });
    return;
  }
  try {
    let imageBuffer: Buffer;
    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body?.fileId) {
      imageBuffer = await downloadDriveFile(String(req.body.fileId), req);
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId' });
      return;
    }
    const form = new FormData();
    form.append('size', 'auto');
    form.append('format', 'png');
    form.append('image_file', new Blob([imageBuffer]), 'photo.jpg');
    const upstream = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': REMOVE_BG_KEY },
      body: form,
    });
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      res.status(upstream.status === 402 ? 402 : 502).json({
        error: `remove.bg failed (${upstream.status})${errText ? `: ${errText.slice(0, 180)}` : ''}`,
      });
      return;
    }
    const png = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'inline; filename="cutout.png"');
    res.send(png);
  } catch (e: any) {
    console.error('[Process] remove-bg error:', e.message);
    res.status(500).json({ error: e.message || 'Background removal failed' });
  }
});

// POST /api/process/set-document-type — operator confirms type → typed field extract
router.post('/set-document-type', async (req: any, res: Response) => {
  const { fileId, documentType } = req.body as { fileId?: string; documentType?: string };
  if (!fileId || !documentType) {
    res.status(400).json({ error: 'fileId and documentType required' });
    return;
  }
  try {
    const {
      normalizeDocTypeKey, applyConfirmedDocumentType, DOC_TYPE_LABELS,
    } = await import('@cybercontrol/backend-documents');
    const typeKey = normalizeDocTypeKey(String(documentType));
    if (!typeKey) { res.status(400).json({ error: 'Unknown document type' }); return; }
    const wsId = req.user?.workspaceId;
    if (!wsId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const row = (await pool.query(
      'SELECT id, drive_file_id, customer_id FROM drive_files WHERE (id::text = $1 OR drive_file_id = $1) AND workspace_id = $2 LIMIT 1',
      [fileId, wsId],
    )).rows[0];
    if (!row) { res.status(404).json({ error: 'Document not found' }); return; }
    // Some rows store the Google id in `id` and leave drive_file_id empty.
    const googleId = String(row.drive_file_id || row.id || '').trim();
    if (!googleId) { res.status(400).json({ error: 'Document has no Drive file id' }); return; }
    const phone = row.customer_id as string | null;
    const buffer = await downloadDriveFile(googleId, req);
    const result = await applyConfirmedDocumentType({
      fileId: String(row.id),
      workspaceId: wsId,
      documentType: typeKey,
      phone,
      operatorId: req.user?.userId,
      download: async () => ({ buffer }),
    });
    res.json({
      ok: true,
      documentType: typeKey,
      tag: DOC_TYPE_LABELS[typeKey] || typeKey,
      needsType: result.needsType,
      suggested: result.suggested,
      fieldCount: Object.keys(result.suggested || {}).filter((k) => !['document_type', 'document_label', 'needs_type'].includes(k)).length,
    });
  } catch (e: any) {
    const msg = e?.message || e?.response?.data?.error || 'Failed to set document type';
    console.error('[Process] set-document-type:', msg);
    const status = /not found/i.test(msg) ? 404 : /authoriz|reconnect/i.test(msg) ? 401 : 500;
    res.status(status).json({ error: msg });
  }
});

// POST /api/process/extract — type-first: cache hit OK; else classify→typed extract (or needsType)
router.post('/extract', async (req: any, res: Response) => {
  const { fileId, documentType, force } = req.body as { fileId?: string; documentType?: string; force?: boolean };
  if (!fileId) { res.status(400).json({ error: 'fileId required' }); return; }

  try {
    const { getCachedExtraction } = await import('@cybercontrol/backend-documents');
    const cached = await getCachedExtraction(fileId);
    const needsType = !!(cached?.needs_type || cached?.document_type?.needsReview || cached?.document_type?.decision === 'unknown' || cached?.document_type?.decision === 'uncertain');
    // Return cache when we have real fields, or when waiting on type (unless force / forcedType)
    if (!force && !documentType && cached && Object.keys(cached).length > 0) {
      res.json({ ok: true, suggested: cached, cached: true, needsType });
      return;
    }
  } catch {}

  try {
    const buffer = await downloadDriveFile(fileId, req);
    const { extractFromBuffer, cacheExtraction } = await import('@cybercontrol/backend-documents');
    const { suggested, needsType, ruleLearned } = await extractFromBuffer(buffer, fileId, {
      forcedType: documentType || undefined,
      workspaceId: req.user?.workspaceId,
    });
    if (req.user?.workspaceId && Object.keys(suggested).length > 0) {
      try { await cacheExtraction(fileId, req.user.workspaceId, suggested); } catch {}
    }
    res.json({ ok: true, suggested, needsType: !!needsType, ruleLearned: !!ruleLearned });
    return;
  } catch (e: any) {
    console.error('[Process] extract error:', e.message);
    res.status(500).json({ error: e.message ?? 'Extraction failed' });
    return;
  }
});

export default router;
