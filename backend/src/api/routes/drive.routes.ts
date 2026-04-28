import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { Readable } from 'stream';

const router = Router();

/**
 * POST /api/drive/upload
 * Body: { accessToken, fileName, mimeType, base64Data, folderName? }
 * Uploads a file to Google Drive and returns the file URL.
 */
router.post('/upload', async (req: Request, res: Response) => {
  const { accessToken, fileName, mimeType, base64Data, folderName } = req.body as {
    accessToken: string;
    fileName: string;
    mimeType: string;
    base64Data: string;
    folderName?: string;
  };

  if (!accessToken || !fileName || !base64Data) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // Find or create customer folder
    let parentId: string | undefined;
    if (folderName) {
      const folderSearch = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
      });
      if (folderSearch.data.files?.length) {
        parentId = folderSearch.data.files[0].id!;
      } else {
        const folder = await drive.files.create({
          requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        });
        parentId = folder.data.id!;
      }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const stream = Readable.from(buffer);

    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: parentId ? [parentId] : undefined,
      },
      media: { mimeType, body: stream },
      fields: 'id,webViewLink,webContentLink',
    });

    // Make file publicly readable
    await drive.permissions.create({
      fileId: file.data.id!,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    res.json({
      fileId: file.data.id,
      fileUrl: file.data.webContentLink,
      viewUrl: file.data.webViewLink,
    });
  } catch (err) {
    console.error('[Drive] Upload error:', err);
    res.status(500).json({ error: 'Drive upload failed' });
  }
});

export default router;
