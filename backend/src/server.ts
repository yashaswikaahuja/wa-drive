import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';

const WORKER_SECRET = process.env['WORKER_SECRET'] ?? 'worker-secret';

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

// ── Hub state (set by worker via socket) ────────────────────────────────────
let workerConnected = false;
let lastQrCode: string | null = null;
let driveAccessToken: string | null = null;

export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }

// ── Drive helpers ────────────────────────────────────────────────────────────
function getDrive() {
  if (!driveAccessToken) return null;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: driveAccessToken });
  return google.drive({ version: 'v3', auth });
}

app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  driveAccessToken = accessToken ?? null;
  // Forward token to worker if connected
  workerSocket?.emit('drive:token', driveAccessToken);
  res.json({ ok: true });
});

app.delete('/api/drive/files/:fileId', async (req, res) => {
  const drive = getDrive();
  if (!drive) { res.status(401).json({ error: 'Not connected to Drive' }); return; }
  try {
    await drive.files.delete({ fileId: req.params.fileId });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to delete' }); }
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
        fields: 'files(id,name,description,createdTime)',
        orderBy: 'createdTime desc', pageSize: 50,
      });
      for (const f of r.data.files ?? []) {
        if (!f.name || !f.id) continue;
        let meta: { customerName?: string; profilePicUrl?: string } = {};
        try { meta = JSON.parse(f.description ?? '{}'); } catch { /* ignore */ }
        allFiles.push({
          id: f.id, customerId: folder.name,
          customerName: meta.customerName ?? `Guest ${(folder.name ?? '').slice(-4)}`,
          fileName: f.name,
          fileUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`,
          profilePicUrl: meta.profilePicUrl ?? null,
          timestamp: f.createdTime,
        });
      }
    }
    allFiles.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(allFiles);
  } catch { res.json([]); }
});

// Reinit: tell worker to reconnect (worker handles its own lifecycle)
app.post('/api/whatsapp/reinit', (_req, res) => {
  workerSocket?.emit('worker:reinit');
  res.json({ ok: true });
});

app.post('/api/whatsapp/logout', (_req, res) => {
  workerSocket?.emit('worker:logout');
  workerConnected = false;
  lastQrCode = null;
  res.json({ ok: true });
});

app.get('/api/whatsapp/qr', (_req, res) => res.json({ qrCode: lastQrCode }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Socket.IO ────────────────────────────────────────────────────────────────
const PORT = Number(process.env['PORT'] ?? 3000);
const httpServer = app.listen(PORT, () => {
  console.log(`[Hub] Running on http://localhost:${PORT}`);
});

const io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

let workerSocket: any = null; // the authenticated worker socket

io.on('connection', (socket) => {
  // Worker registration
  socket.on('worker:register', ({ secret }: { secret: string }) => {
    if (secret !== WORKER_SECRET) { socket.disconnect(); return; }
    workerSocket = socket;
    console.log('[Hub] Worker registered');
    // Send current Drive token to worker
    if (driveAccessToken) socket.emit('drive:token', driveAccessToken);
  });

  // Worker → hub: QR code (hub stores it for polling clients)
  socket.on('worker:qr', ({ qr }: { qr: string }) => {
    lastQrCode = qr; // raw QR string; frontend polls /api/whatsapp/qr for base64
  });

  // Worker → hub: connection status change → broadcast to all dashboard clients
  socket.on('connection:status', (payload: { connected: boolean; qrCode?: string }) => {
    workerConnected = payload.connected;
    if (payload.connected) lastQrCode = null;
    io.emit('connection:status', payload);
  });

  // Worker → hub: new file received → broadcast to all dashboard clients
  socket.on('new_whatsapp_file', (file: object) => {
    io.emit('new_whatsapp_file', file);
  });

  // Dashboard client connects: send current status immediately
  socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });

  socket.on('disconnect', () => {
    if (socket === workerSocket) {
      workerSocket = null;
      workerConnected = false;
      console.log('[Hub] Worker disconnected');
      io.emit('connection:status', { connected: false });
    }
  });
});

process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
