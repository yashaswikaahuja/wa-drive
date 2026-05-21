import express from 'express';
import { uploadFile, downloadFile, getAuthUrl, handleCallback, isConnected } from './drive.js';

const PORT = process.env.PORT || 3200;
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';

const app = express();
app.use(express.json({ limit: '50mb' }));

function auth(req, res, next) {
  if (req.headers['x-service-secret'] !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Health
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Upload file
app.post('/upload', auth, async (req, res) => {
  const { workspaceId, fileBase64, fileName, mimeType } = req.body;
  if (!workspaceId || !fileBase64) return res.status(400).json({ error: 'workspaceId and fileBase64 required' });
  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const result = await uploadFile(workspaceId, buffer, fileName || 'file', mimeType || 'application/octet-stream');
    res.json(result);
  } catch (e) {
    console.error(`[Storage] Upload error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Download file
app.get('/download/:workspaceId/:fileId', auth, async (req, res) => {
  try {
    const { buffer, mimeType, fileName } = await downloadFile(req.params.workspaceId, req.params.fileId);
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(buffer);
  } catch (e) {
    console.error(`[Storage] Download error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// Check connection status
app.get('/status/:workspaceId', auth, async (req, res) => {
  const connected = await isConnected(req.params.workspaceId);
  res.json({ connected });
});

// Get OAuth URL
app.get('/auth-url/:workspaceId', auth, (req, res) => {
  const url = getAuthUrl(req.params.workspaceId);
  res.json({ url });
});

// OAuth callback
app.get('/callback', async (req, res) => {
  const { code, state: workspaceId } = req.query;
  if (!code || !workspaceId) return res.status(400).send('Missing code or state');
  try {
    await handleCallback(code, workspaceId);
    res.send('<html><body><script>window.opener?.postMessage({type:"DRIVE_CONNECTED"},"*");window.close();</script><p>Connected! You can close this window.</p></body></html>');
  } catch (e) {
    res.status(500).send('Connection failed: ' + e.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Storage Service] Running on port ${PORT}`);
});
