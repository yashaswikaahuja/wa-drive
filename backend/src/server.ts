import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import multer from 'multer';
import { Readable } from 'stream';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';
import processRoutes from './api/routes/process.routes.js';

const WORKER_SECRET = process.env['WORKER_SECRET'] ?? 'worker-secret';
const PORT = Number(process.env['PORT'] ?? 3000);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

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
app.use('/api/process', processRoutes);

// ── Hub state ────────────────────────────────────────────────────────────────
let workerConnected = false;
let lastQrCode: string | null = null;
let driveAccessToken: string | null = null;
let workerSocket: any = null;

export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }

// ── Drive helpers ────────────────────────────────────────────────────────────
function getDrive() {
  if (!driveAccessToken) return null;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: driveAccessToken });
  return google.drive({ version: 'v3', auth });
}

async function findOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id!;
  const f = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId ?? 'root'] },
    fields: 'id',
  });
  return f.data.id!;
}

function mimeToType(mime: string): string {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  return 'file';
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  driveAccessToken = accessToken ?? null;
  app.locals.driveAccessToken = driveAccessToken;
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

// ── Worker file upload ────────────────────────────────────────────────────────
// Memory storage but limit file size to 50MB to prevent OOM
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Concurrency limiter — only 1 Drive upload at a time on e2-micro (1GB RAM)
let hubUploadActive = 0;
const hubUploadQueue: Array<() => void> = [];
const HUB_UPLOAD_CONCURRENCY = 1;

function acquireUploadSlot(): Promise<void> {
  return new Promise(resolve => {
    if (hubUploadActive < HUB_UPLOAD_CONCURRENCY) { hubUploadActive++; resolve(); }
    else hubUploadQueue.push(resolve);
  });
}
function releaseUploadSlot() {
  const next = hubUploadQueue.shift();
  if (next) { next(); } else { hubUploadActive--; }
}

app.post('/api/worker/upload', upload.single('file') as any, async (req: any, res: any) => {
  const drive = getDrive();
  if (!drive) { res.status(401).json({ error: 'Not connected to Drive' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  const { phone, senderName, profilePicUrl, mimetype, fileName } = req.body as Record<string, string>;
  const fileSize = req.file.size;
  console.log(`[Hub] Upload queued: ${fileName} (${(fileSize/1024).toFixed(0)}KB) from ${phone}`);

  await acquireUploadSlot();
  try {
    console.log(`[Hub] Uploading: ${fileName}`);
    const customersId = await findOrCreateFolder(drive, 'customers');
    const phoneId     = await findOrCreateFolder(drive, phone, customersId);

    // Stream buffer to Drive — don't hold reference after upload
    const buffer = req.file.buffer;
    const file = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [phoneId],
        description: JSON.stringify({ customerName: senderName, profilePicUrl: profilePicUrl || null }),
      },
      media: { mimeType: mimetype, body: Readable.from(buffer) },
      fields: 'id,webContentLink',
    });

    // Release buffer from memory immediately
    (req.file as any).buffer = null;

    const fileId = file.data.id!;
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
    console.log(`[Hub] ✓ Uploaded: ${fileName} → ${fileId}`);

    io.emit('new_whatsapp_file', {
      id: fileId,
      customerId: phone,
      customerName: senderName,
      phoneNumber: phone,
      fileName,
      fileUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`,
      type: mimeToType(mimetype),
      size: fileSize,
      timestamp: new Date().toISOString(),
      profilePicUrl: profilePicUrl || null,
    });

    res.json({ fileUrl: file.data.webContentLink, fileId });
  } catch (e) {
    console.error(`[Hub] ✗ Upload failed: ${fileName} | ${(e as Error).message}`);
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    releaseUploadSlot();
  }
});

app.post('/api/whatsapp/reinit', (_req, res) => {
  lastQrCode = null;
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
io.on('connection', (socket) => {
  socket.on('worker:register', ({ secret }: { secret: string }) => {
    if (secret !== WORKER_SECRET) { socket.disconnect(); return; }
    workerSocket = socket;
    console.log('[Hub] Worker registered');
    if (driveAccessToken) socket.emit('drive:token', driveAccessToken);
  });

  socket.on('connection:status', (payload: { connected: boolean; qrCode?: string }) => {
    workerConnected = payload.connected;
    if (payload.connected) lastQrCode = null;
    else if (payload.qrCode) lastQrCode = payload.qrCode;
    io.emit('connection:status', payload);
  });

  socket.on('new_whatsapp_file', (file: object) => {
    io.emit('new_whatsapp_file', file);
  });

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

httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
