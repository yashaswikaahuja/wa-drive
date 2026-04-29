import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import { whatsappService } from './services/whatsapp.service.js';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/files', filesRoutes);

// Drive helpers
function getDrive() {
  const token = whatsappService.getDriveToken();
  if (!token) return null;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.drive({ version: 'v3', auth });
}

app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  whatsappService.setDriveToken(accessToken ?? null);
  res.json({ ok: true });
});

app.delete('/api/drive/files/:fileId', async (req, res) => {
  const drive = getDrive();
  if (!drive) { res.status(401).json({ error: 'Not connected to Drive' }); return; }
  try {
    await drive.files.delete({ fileId: req.params.fileId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete' }); }
});

app.get('/api/drive/files', async (_req, res) => {
  const drive = getDrive();
  if (!drive) { res.json([]); return; }
  try {
    const folderRes = await drive.files.list({
      q: `name='customers' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
      fields: 'files(id)', pageSize: 1,
    });
    const customersId = folderRes.data.files?.[0]?.id;
    if (!customersId) { res.json([]); return; }

    const subfoldersRes = await drive.files.list({
      q: `'${customersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
    });

    const allFiles: object[] = [];
    for (const folder of subfoldersRes.data.files ?? []) {
      const r = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id,name,webContentLink,createdTime)',
        orderBy: 'createdTime desc', pageSize: 50,
      });
      for (const f of r.data.files ?? []) {
        if (!f.name || !f.webContentLink) continue;
        allFiles.push({
          id: f.id, customerId: folder.name,
          customerName: `Guest ${(folder.name ?? '').slice(-4)}`,
          fileName: f.name, fileUrl: f.webContentLink,
          profilePicUrl: null, timestamp: f.createdTime,
        });
      }
    }
    allFiles.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(allFiles);
  } catch { res.json([]); }
});

app.post('/api/whatsapp/logout', async (_req, res) => {
  await whatsappService.disconnect();
  res.json({ ok: true });
});

app.post('/api/whatsapp/reinit', async (_req, res) => {
  try {
    await whatsappService.disconnect();
    await whatsappService.init();
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/whatsapp/qr', (_req, res) => res.json({ qrCode: whatsappService.getQrCode() }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = Number(process.env['PORT'] ?? 3000);
const httpServer = app.listen(PORT, async () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  const io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
  io.on('connection', (socket) => {
    const qrCode = whatsappService.getQrCode();
    socket.emit('connection:status', { connected: whatsappService.getStatus(), ...(qrCode ? { qrCode } : {}) });
    socket.on('disconnect', () => {});
  });
  whatsappService.setSocketIO(io);
  try {
    await whatsappService.init();
    console.log('[WhatsApp] Service initialized');
  } catch (e) {
    console.error('[WhatsApp] Init failed:', e);
  }
});

process.on('SIGINT', async () => {
  await whatsappService.disconnect();
  httpServer.close(() => process.exit(0));
});
