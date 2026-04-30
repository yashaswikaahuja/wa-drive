import 'dotenv/config';
import WhatsAppWeb from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import { io as ioClient, Socket } from 'socket.io-client';
import { google } from 'googleapis';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const { Client, LocalAuth } = WhatsAppWeb as any;

const HUB_URL = process.env['HUB_URL'] ?? 'http://localhost:3000';
const WORKER_SECRET = process.env['WORKER_SECRET'] ?? 'worker-secret';
const DRIVE_TOKEN = process.env['DRIVE_ACCESS_TOKEN'] ?? '';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, 'uploads/customers');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

// ── Hub socket connection ────────────────────────────────────────────────────

let hub: Socket;

function connectHub() {
  hub = ioClient(HUB_URL, {
    auth: { secret: WORKER_SECRET },
    reconnection: true,
    reconnectionDelay: 3000,
  });

  hub.on('connect', () => console.log('[Worker] Connected to hub'));
  hub.on('disconnect', (reason) => console.log('[Worker] Disconnected from hub:', reason));
  hub.on('connect_error', (e) => console.error('[Worker] Hub connect error:', e.message));

  // Hub can push a Drive token update to the worker at runtime
  hub.on('drive:token', (token: string | null) => {
    driveToken = token;
    console.log('[Worker] Drive token updated from hub');
  });
}

let driveToken: string | null = DRIVE_TOKEN || null;

// ── Google Drive helpers ─────────────────────────────────────────────────────

async function getOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id!;
  const folder = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId ?? 'root'] },
    fields: 'id',
  });
  return folder.data.id!;
}

// ── Media processing ─────────────────────────────────────────────────────────

async function processMedia(message: any, media: any, phone: string, customerName: string, contact: any) {
  const mimetype: string = media.mimetype ?? '';
  const ext = MIME_TO_EXT[mimetype] ?? 'bin';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const typeLabel = mimetype.startsWith('image/') ? 'photo' : mimetype.startsWith('video/') ? 'video' : mimetype.startsWith('audio/') ? 'audio' : 'file';
  const rawName: string = media.filename ?? message._data?.filename ?? '';
  const baseName = rawName
    ? rawName.replace(/\s+/g, '_').replace(/[:\\*?<>|]/g, '').replace(/\.[^.]+$/, '')
    : `${ts}_${typeLabel}`;
  const fileName = `${phone}_${baseName}.${ext}`;
  const buffer = Buffer.from(media.data, 'base64');
  console.log(`[Worker] Downloaded ${fileName} (${mimetype}, ${buffer.length} bytes)`);

  let fileUrl: string;

  if (driveToken) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: driveToken });
      const drive = google.drive({ version: 'v3', auth });

      const customersId = await getOrCreateFolder(drive, 'customers');
      const phoneId = await getOrCreateFolder(drive, phone, customersId);
      const file = await drive.files.create({
        requestBody: { name: fileName, parents: [phoneId] },
        media: { mimeType: mimetype, body: Readable.from(buffer) },
        fields: 'id',
      });
      const fileId = file.data.id!;
      await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
      fileUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
      console.log(`[Worker] Uploaded to Drive: ${fileUrl}`);

      // Store customerName + profilePicUrl in file description for hub's Drive listing
      let profilePicUrl: string | null = null;
      try {
        profilePicUrl = await (contact ?? await message.getContact()).getProfilePicUrl() ?? null;
      } catch { /* ignore */ }

      drive.files.update({
        fileId,
        requestBody: { description: JSON.stringify({ customerName, profilePicUrl }) },
      }).catch(() => {});

      hub.emit('new_whatsapp_file', {
        id: `${Date.now()}-${phone}`,
        customerId: phone, customerName,
        fileName, fileUrl, profilePicUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (e) {
      console.error('[Worker] Drive upload failed, falling back to local:', e);
    }
  }

  // Local fallback
  const dir = join(UPLOADS_ROOT, phone);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), buffer);
  fileUrl = `/uploads/customers/${phone}/${fileName}`;
  console.log(`[Worker] Saved locally: ${fileUrl}`);

  let profilePicUrl: string | null = null;
  try { profilePicUrl = await (contact ?? await message.getContact()).getProfilePicUrl() ?? null; } catch { /* ignore */ }

  hub.emit('new_whatsapp_file', {
    id: `${Date.now()}-${phone}`,
    customerId: phone, customerName,
    fileName, fileUrl, profilePicUrl,
    timestamp: new Date().toISOString(),
  });
}

async function handleMedia(message: any) {
  let contact: any = null;
  try { contact = await message.getContact(); } catch { /* ignore */ }

  let phone = '';
  if (contact) {
    const serialized: string = contact.id?._serialized ?? '';
    if (serialized.includes('@c.us') || serialized.includes('@s.whatsapp.net')) {
      phone = serialized.replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
    } else {
      phone = (contact.number || contact.id?.user || '').replace(/[^0-9+]/g, '');
    }
  }
  if (!phone || phone.length < 4) {
    const rawFrom: string = message._data?.from ?? message.from ?? '';
    phone = rawFrom.replace(/@c\.us|@s\.whatsapp\.net|@g\.us|@lid/g, '').replace(/[^0-9+]/g, '');
  }
  if (!phone || phone.length < 4) phone = `unknown_${Date.now()}`;

  const customerName = contact?.name || contact?.pushname || contact?.verifiedName || `Guest ${phone.slice(-4)}`;
  console.log(`[Worker] Resolved phone: ${phone}, name: ${customerName}`);

  let media = await message.downloadMedia();
  if (!media) {
    await new Promise(r => setTimeout(r, 3000));
    media = await message.downloadMedia();
    if (!media) { console.warn('[Worker] downloadMedia() returned null after retry'); return; }
  }
  await processMedia(message, media, phone, customerName, contact);
}

// ── WhatsApp client ──────────────────────────────────────────────────────────

function startWhatsApp() {
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'cybercafe_worker' }),
    webVersionCache: { type: 'local', path: resolve(__dirname, '.wwebjs_cache') },
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
        '--disable-gpu', '--disable-extensions', '--mute-audio',
        '--js-flags=--max-old-space-size=512',
      ],
      timeout: 60000,
    },
  });

  client.on('qr', (qr: string) => {
    console.log('[Worker] QR received — scan with WhatsApp:');
    qrcodeTerminal.generate(qr, { small: true });
    hub.emit('worker:qr', { qr });
    hub.emit('connection:status', { connected: false });
  });

  client.on('authenticated', () => {
    console.log('[Worker] Authenticated ✓');
    hub.emit('connection:status', { connected: true });
  });

  client.on('ready', () => {
    console.log('[Worker] Client ready! ✓');
    hub.emit('connection:status', { connected: true });
  });

  client.on('auth_failure', (msg: string) => {
    console.error('[Worker] Auth failure:', msg);
    hub.emit('connection:status', { connected: false });
    setTimeout(startWhatsApp, 5000);
  });

  client.on('disconnected', () => {
    console.log('[Worker] Disconnected');
    hub.emit('connection:status', { connected: false });
    setTimeout(startWhatsApp, 5000);
  });

  client.on('message_create', async (message: any) => {
    if (message.fromMe) return;
    if (!message.hasMedia) return;
    try { await handleMedia(message); }
    catch (e) { console.error('[Worker] Media error:', e); }
  });

  client.initialize().catch((e: any) => {
    console.error('[Worker] initialize() failed:', e);
    setTimeout(startWhatsApp, 10000);
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

connectHub();
hub!.on('connect', () => {
  // Authenticate this socket as a worker so the hub trusts its events
  hub.emit('worker:register', { secret: WORKER_SECRET });
});
startWhatsApp();
