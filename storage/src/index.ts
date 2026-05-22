import express from 'express';
import { upload, download, getAuthUrl, handleCallback, isConnected } from './drive';

const PORT = process.env.PORT || 3200;
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';
const app = express();
app.use(express.json({ limit: '50mb' }));

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.headers['x-service-secret'] !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.post('/upload', auth, async (req, res) => {
  const { workspaceId, fileBase64, fileName, mimeType } = req.body;
  if (!workspaceId || !fileBase64) return res.status(400).json({ error: 'workspaceId and fileBase64 required' });
  try {
    const result = await upload(workspaceId, Buffer.from(fileBase64, 'base64'), fileName || 'file', mimeType || 'application/octet-stream');
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/download/:workspaceId/:fileId', auth, async (req, res) => {
  try {
    const { buffer, mimeType, fileName } = await download(req.params.workspaceId, req.params.fileId);
    res.set({ 'Content-Type': mimeType, 'Content-Disposition': `inline; filename="${fileName}"` }).send(buffer);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/status/:workspaceId', auth, async (req, res) => {
  res.json({ connected: await isConnected(req.params.workspaceId) });
});

app.get('/auth-url/:workspaceId', auth, (req, res) => {
  res.json({ url: getAuthUrl(req.params.workspaceId) });
});

app.get('/callback', async (req, res) => {
  const { code, state: workspaceId } = req.query as { code: string; state: string };
  if (!code || !workspaceId) return res.status(400).send('Missing code or state');
  try {
    await handleCallback(code, workspaceId);
    res.send('<script>window.opener?.postMessage({type:"DRIVE_CONNECTED"},"*");window.close();</script>Connected!');
  } catch (e: any) { res.status(500).send('Failed: ' + e.message); }
});

app.listen(PORT, () => console.log(`[Storage Service] Running on port ${PORT}`));
