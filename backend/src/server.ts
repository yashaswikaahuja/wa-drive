import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import multer from 'multer';
import { Readable } from 'stream';
import sharp from 'sharp';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';
import processRoutes from './api/routes/process.routes.js';
import profilesRoutes from './api/routes/profiles.routes.js';
import mappingsRoutes from './api/routes/mappings.routes.js';
import adaptersRoutes from './api/routes/adapters.routes.js';

const WORKER_SECRET = process.env['WORKER_SECRET'] ?? 'worker-secret';
const PORT = Number(process.env['PORT'] ?? 3000);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/process', processRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/mappings', mappingsRoutes);
app.use('/api/adapters', adaptersRoutes);

// ── Hub state ────────────────────────────────────────────────────────────────
let workerConnected = false;
let lastQrCode: string | null = null;
let workerSocket: any = null;

export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }

// ── Google Drive — persistent OAuth2 client ──────────────────────────────────
// Uses auth-code flow: frontend sends code → backend exchanges for tokens →
// refresh_token stored in app_secrets DB → auto-refreshed on every Drive call.
import { pool } from './db.js';

const GOOGLE_CLIENT_ID     = process.env['GOOGLE_CLIENT_ID']     ?? '';
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
const GOOGLE_REDIRECT_URI  = process.env['GOOGLE_REDIRECT_URI']  ?? 'http://localhost:3000/api/drive/callback';

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

// Persist tokens to DB whenever they are refreshed automatically
oauth2Client.on('tokens', async (tokens) => {
  if (tokens.refresh_token) {
    await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_refresh_token',$1,now())
      ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=now()`, [tokens.refresh_token]);
  }
  if (tokens.access_token) {
    await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_access_token',$1,now())
      ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=now()`, [tokens.access_token]);
  }
  console.log('[Hub] Drive tokens refreshed and saved to DB');
});

// Load saved tokens from DB on startup so Drive works after backend restart
async function loadDriveTokensFromDB() {
  try {
    const r = await pool.query(`SELECT key, value FROM app_secrets WHERE key IN ('drive_refresh_token','drive_access_token')`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.key] = row.value;
    if (map['drive_refresh_token']) {
      oauth2Client.setCredentials({
        refresh_token: map['drive_refresh_token'],
        access_token: map['drive_access_token'] ?? undefined,
      });
      console.log('[Hub] Drive tokens loaded from DB — auto-refresh active');
    }
  } catch (e) {
    console.warn('[Hub] Could not load Drive tokens from DB:', (e as Error).message);
  }
}
loadDriveTokensFromDB();

function getDrive() {
  const creds = oauth2Client.credentials;
  if (!creds.refresh_token && !creds.access_token) return null;
  // oauth2Client auto-refreshes access_token using refresh_token when needed
  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Keep a legacy accessor for the remove-bg proxy (uses access_token directly)
function getDriveAccessToken(): string | null {
  return oauth2Client.credentials.access_token ?? null;
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

// Step 1: Frontend opens popup to this URL → Google consent screen
app.get('/api/drive/auth', (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // gets refresh_token
    prompt: 'consent',       // always return refresh_token
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
  res.redirect(url);
});

// Step 2: Google redirects here with ?code=...
app.get('/api/drive/callback', async (req, res) => {
  const code = req.query['code'] as string;
  if (!code) { res.status(400).send('Missing code'); return; }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    if (tokens.refresh_token) {
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_refresh_token',$1,now())
        ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=now()`, [tokens.refresh_token]);
    }
    if (tokens.access_token) {
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_access_token',$1,now())
        ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=now()`, [tokens.access_token]);
    }
    console.log('[Hub] Drive connected — refresh_token saved to DB');
    // Close popup and notify opener (Settings page)
    res.send(`<script>window.opener?.postMessage({type:'DRIVE_CONNECTED'},'*');window.close();</script>`);
  } catch (e) {
    console.error('[Hub] Drive callback error:', (e as Error).message);
    res.status(500).send('OAuth failed: ' + (e as Error).message);
  }
});

// Frontend polls this to check connection state
app.get('/api/drive/status', (_req, res) => {
  const connected = !!(oauth2Client.credentials.refresh_token || oauth2Client.credentials.access_token);
  res.json({ connected });
});

// Legacy endpoint kept for backward compat
app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  if (accessToken) oauth2Client.setCredentials({ ...oauth2Client.credentials, access_token: accessToken });
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

  // ── Sharp image validation ──────────────────────────────────────────────────
  // Validate image buffers before uploading to Drive.
  // Non-image files (PDF, audio, video) are passed through without validation.
  if (mimetype.startsWith('image/')) {
    if (!req.file.buffer || req.file.buffer.length < 100) {
      console.error(`[Hub] ✗ Rejected ${fileName} — buffer empty or too small (${req.file.buffer?.length ?? 0} bytes)`);
      res.status(400).json({ error: 'Invalid image: buffer empty or too small' });
      return;
    }
    try {
      const meta = await sharp(req.file.buffer).metadata();
      if (!meta.width || !meta.height) {
        console.error(`[Hub] ✗ Rejected ${fileName} — Sharp could not read image dimensions`);
        res.status(400).json({ error: 'Invalid image: cannot read dimensions' });
        return;
      }
      console.log(`[Hub] ✓ Image valid: ${fileName} (${meta.width}x${meta.height} ${meta.format})`);
    } catch (sharpErr: any) {
      console.error(`[Hub] ✗ Rejected ${fileName} — Sharp error: ${sharpErr.message}`);
      res.status(400).json({ error: `Invalid image: ${sharpErr.message}` });
      return;
    }
  }

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

// ── Background removal proxy ────────────────────────────────────────────
const bgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

async function downloadDriveBuffer(fileId: string, accessToken: string): Promise<Buffer> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
}

app.post('/api/remove-bg', (req: any, res: any, next: any) => {
  // If JSON body (fileId), skip multer and parse as JSON
  if (req.headers['content-type']?.includes('application/json')) {
    express.json()(req, res, next);
  } else {
    (bgUpload.single('image_file') as any)(req, res, next);
  }
}, async (req: any, res: any) => {
  const REMOVE_BG_KEY = process.env['REMOVE_BG_API_KEY'] ?? 'd9f7QFfqAdFuEzt1dXNqvSxP';
  let imageBuffer: Buffer;
  let filename = 'image.jpg';
  try {
    if (req.file) {
      imageBuffer = req.file.buffer;
      filename = req.file.originalname ?? filename;
    } else if (req.body?.fileId) {
      const driveAccessToken = getDriveAccessToken();
      if (!driveAccessToken) { res.status(401).json({ error: 'Not connected to Google Drive' }); return; }
      imageBuffer = await downloadDriveBuffer(req.body.fileId, driveAccessToken);
      filename = req.body.fileName ?? filename;
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId (JSON)' }); return;
    }
    if (!imageBuffer || imageBuffer.length < 100) {
      res.status(400).json({ error: 'Image buffer empty or too small' }); return;
    }
    const FormDataNode = (await import('form-data')).default;
    const https = (await import('https')).default;
    const form = new FormDataNode();
    form.append('image_file', imageBuffer, { filename, contentType: 'image/jpeg' });
    form.append('size', 'auto');
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const req2 = https.request({
        hostname: 'api.remove.bg', path: '/v1.0/removebg', method: 'POST',
        headers: { 'X-Api-Key': REMOVE_BG_KEY, ...form.getHeaders() },
      }, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => {
          const body = Buffer.concat(chunks);
          if (r.statusCode !== 200) reject(new Error('remove.bg: ' + body.toString()));
          else resolve(body);
        });
      });
      req2.on('error', reject);
      form.pipe(req2);
    });
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (e: any) {
    console.error('[Hub] remove-bg failed:', e.message);
    res.status(500).json({ error: e.message ?? 'Background removal failed' });
  }});

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
  // Auto-register worker if auth secret matches (handles cases where worker:register event is lost)
  if ((socket.handshake.auth as any)?.secret === WORKER_SECRET) {
    workerSocket = socket;
    workerConnected = false;
    console.log('[Hub] Worker auto-registered via auth');
    if (driveAccessToken) socket.emit('drive:token', driveAccessToken);
  }

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

  // Forward upload queue events to dashboard
  socket.on('upload:queued', (d: object) => io.emit('upload:queued', d));
  socket.on('upload:start',  (d: object) => io.emit('upload:start',  d));
  socket.on('upload:done',   (d: object) => io.emit('upload:done',   d));
  socket.on('upload:fail',   (d: object) => io.emit('upload:fail',   d));

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


// Extension update endpoints
import { readFileSync, writeFileSync } from 'fs';
function getExtensionVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../extension/manifest.json'), 'utf8'));
    return manifest.version;
  } catch { return '0.0'; }
}
app.get('/api/diagnose.js', (_req, res) => { res.setHeader('Content-Type','application/javascript'); res.sendFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/diagnose.js')); });
app.get('/api/extension/version', (req: any, res: any) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ version: getExtensionVersion(), download_url: `${base}/api/extension/download` });
});
app.get('/api/extension/download', (_req, res) => {
  const zipPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension.zip');
  res.download(zipPath, 'cybercontrol-autofill.zip');
});

httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
