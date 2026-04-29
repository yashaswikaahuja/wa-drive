import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { whatsappService } from './services/whatsapp.service.js';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';
import driveRoutes from './api/routes/drive.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, '../uploads');
const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_ROOT));

// Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/drive', driveRoutes);

// Set Google Drive token from frontend
app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  console.log(`[Drive] Token received: ${accessToken ? `SET (length: ${accessToken.length}, prefix: ${accessToken.substring(0, 10)}...)` : 'CLEARED'}`);
  whatsappService.setDriveToken(accessToken ?? null);
  res.json({ ok: true });
});

// Delete a file from Google Drive
app.delete('/api/drive/files/:fileId', async (req, res) => {
  const token = whatsappService.getDriveToken();
  if (!token) { res.status(401).json({ error: 'Not connected to Drive' }); return; }
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.delete({ fileId: req.params.fileId });
    res.json({ success: true });
  } catch (e) {
    console.error('[Drive] Delete error:', e);
    res.status(500).json({ error: 'Failed to delete from Drive' });
  }
});

// List files from Google Drive customers folder
app.get('/api/drive/files', async (req, res) => {
  const token = whatsappService.getDriveToken();
  if (!token) { res.json([]); return; }

  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: token });
    const drive = google.drive({ version: 'v3', auth });

    // Find customers folder
    const folderRes = await drive.files.list({
      q: `name='customers' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
      fields: 'files(id)',
      pageSize: 1,
    });
    const customersId = folderRes.data.files?.[0]?.id;
    if (!customersId) { res.json([]); return; }

    // List all files recursively under customers
    const filesRes = await drive.files.list({
      q: `'${customersId}' in parents or mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id,name,webContentLink,createdTime,parents)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      includeItemsFromAllDrives: false,
      supportsAllDrives: false,
    });

    // Get all phone subfolders first
    const subfoldersRes = await drive.files.list({
      q: `'${customersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id,name)',
    });
    const folderMap = new Map(subfoldersRes.data.files?.map(f => [f.id!, f.name!]) ?? []);

    // Get files inside each subfolder
    const allFiles: object[] = [];
    for (const [folderId, phone] of folderMap) {
      const r = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id,name,webContentLink,createdTime)',
        orderBy: 'createdTime desc',
        pageSize: 50,
      });
      for (const f of r.data.files ?? []) {
        if (!f.name || !f.webContentLink) continue;
        allFiles.push({
          id: f.id,
          customerId: phone,
          customerName: `Guest ${phone.slice(-4)}`,
          fileName: f.name,
          fileUrl: f.webContentLink,
          profilePicUrl: null,
          timestamp: f.createdTime,
        });
      }
    }

    allFiles.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(allFiles);
  } catch (e) {
    console.error('[Drive] List files error:', e);
    res.json([]);
  }
});

// WhatsApp logout
app.post('/api/whatsapp/logout', async (_req, res) => {
  await whatsappService.disconnect();
  res.json({ ok: true });
});

// Re-initialize WhatsApp
app.post('/api/whatsapp/reinit', async (_req, res) => {
  try {
    await whatsappService.disconnect();
    await whatsappService.init();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get current QR code
app.get('/api/whatsapp/qr', (_req, res) => {
  res.json({ qrCode: whatsappService.getQrCode() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = Number(process.env['PORT'] ?? 3000);

const httpServer = app.listen(PORT, async () => {
  console.log(`\n[Server] Running on http://localhost:${PORT}`);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    // Send current status immediately to new client
    const qrCode = whatsappService.getQrCode();
    socket.emit('connection:status', {
      connected: whatsappService.getStatus(),
      ...(qrCode ? { qrCode } : {}),
    });
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  whatsappService.setSocketIO(io);

  try {
    console.log('[WhatsApp] Initializing WhatsApp service...');
    await whatsappService.init();
    console.log('[WhatsApp] Service initialized successfully');
  } catch (error) {
    console.error('[WhatsApp] Failed to initialize (continuing without WhatsApp):', error);
  }
});

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await whatsappService.disconnect();
  httpServer.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
