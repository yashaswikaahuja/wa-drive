import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { generateAadhaarLayout, generatePassportSheet } from '../../services/processor/layout.js';

const router = Router();

async function downloadDriveFile(fileId: string, accessToken: string): Promise<Buffer> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });
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
  const { driveAccessToken } = req.app.locals as { driveAccessToken?: string };
  if (!driveAccessToken) {
    res.status(401).json({ error: 'Not connected to Google Drive' }); return;
  }

  try {
    console.log(`[Process] Aadhaar layout for files: ${fileIds.join(', ')}`);
    const buffers = await Promise.all(fileIds.map(id => downloadDriveFile(id, driveAccessToken)));
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
// Body: { fileId, sheet: '4x6'|'a4' }
// Downloads from Drive server-side → Sharp sheet → returns JPEG (no CORS)
router.post('/passport-sheet', async (req: Request, res: Response) => {
  const { fileId, sheet = '4x6', count = 8 } = req.body as { fileId?: string; sheet?: '4x6' | 'a4'; count?: number };
  if (!fileId) { res.status(400).json({ error: 'fileId required' }); return; }
  if (!['4x6', 'a4'].includes(sheet)) { res.status(400).json({ error: 'sheet must be 4x6 or a4' }); return; }
  if (![6, 8, 24].includes(count)) { res.status(400).json({ error: 'count must be 6, 8, or 24' }); return; }

  const { driveAccessToken } = req.app.locals as { driveAccessToken?: string };
  if (!driveAccessToken) { res.status(401).json({ error: 'Not connected to Google Drive' }); return; }

  try {
    const buffer = await downloadDriveFile(fileId, driveAccessToken);
    const output = await generatePassportSheet(buffer, sheet as '4x6' | 'a4', count as 6 | 8 | 24);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `inline; filename="passport_${sheet}_${count}.jpg"`);
    res.send(output);
  } catch (e: any) {
    console.error('[Process] passport-sheet error:', e.message);
    res.status(500).json({ error: e.message ?? 'Sheet generation failed' });
  }
});

export default router;
