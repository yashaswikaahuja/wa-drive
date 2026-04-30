import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import type { WASocket, BaileysEventMap } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import { io as ioClient, Socket } from 'socket.io-client';
import { google } from 'googleapis';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HUB_URL        = process.env['HUB_URL']            ?? 'http://localhost:3000';
const WORKER_SECRET  = process.env['WORKER_SECRET']       ?? 'worker-secret';
const AUTH_DIR       = resolve(__dirname, 'auth_info');
const UPLOADS_ROOT   = resolve(__dirname, 'uploads/customers');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif',  'image/webp': 'webp', 'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4',  'video/3gpp': '3gp',
};

// ── Hub connection ───────────────────────────────────────────────────────────

let hub: Socket;
let driveToken: string | null = process.env['DRIVE_ACCESS_TOKEN'] ?? null;

function connectHub() {
  hub = ioClient(HUB_URL, { auth: { secret: WORKER_SECRET }, reconnection: true, reconnectionDelay: 3000 });
  hub.on('connect',       () => { console.log('[Worker] Hub connected'); hub.emit('worker:register', { secret: WORKER_SECRET }); });
  hub.on('disconnect',    (r) => console.log('[Worker] Hub disconnected:', r));
  hub.on('connect_error', (e) => console.error('[Worker] Hub error:', e.message));
  hub.on('drive:token',   (t: string | null) => { driveToken = t; console.log('[Worker] Drive token updated'); });
}

// ── Google Drive helpers ─────────────────────────────────────────────────────

async function getOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
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

// ── Media processing ─────────────────────────────────────────────────────────

async function processMedia(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  buffer: Buffer,
  mimetype: string,
  phone: string,
  customerName: string,
  profilePicUrl: string | null,
) {
  const ext = MIME_TO_EXT[mimetype] ?? 'bin';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const typeLabel = mimetype.startsWith('image/') ? 'photo' : mimetype.startsWith('video/') ? 'video' : mimetype.startsWith('audio/') ? 'audio' : 'file';
  const fileName = `${phone}_${ts}_${typeLabel}.${ext}`;

  console.log(`[Worker] Processing ${fileName} (${mimetype}, ${buffer.length} bytes)`);

  let fileUrl: string;

  if (driveToken) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: driveToken });
      const drive = google.drive({ version: 'v3', auth });

      const customersId = await getOrCreateFolder(drive, 'customers');
      const phoneId     = await getOrCreateFolder(drive, phone, customersId);
      const file = await drive.files.create({
        requestBody: { name: fileName, parents: [phoneId] },
        media: { mimeType: mimetype, body: Readable.from(buffer) },
        fields: 'id',
      });
      const fileId = file.data.id!;
      await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
      fileUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
      drive.files.update({ fileId, requestBody: { description: JSON.stringify({ customerName, profilePicUrl }) } }).catch(() => {});
      console.log(`[Worker] Uploaded to Drive: ${fileUrl}`);
    } catch (e) {
      console.error('[Worker] Drive upload failed, saving locally:', e);
      const dir = join(UPLOADS_ROOT, phone);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fileName), buffer);
      fileUrl = `/uploads/customers/${phone}/${fileName}`;
    }
  } else {
    const dir = join(UPLOADS_ROOT, phone);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), buffer);
    fileUrl = `/uploads/customers/${phone}/${fileName}`;
    console.log(`[Worker] Saved locally: ${fileUrl}`);
  }

  hub.emit('new_whatsapp_file', {
    id: `${Date.now()}-${phone}`,
    customerId: phone, customerName,
    fileName, fileUrl, profilePicUrl,
    timestamp: new Date().toISOString(),
  });
}

// ── Baileys WhatsApp client ──────────────────────────────────────────────────

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[Worker] Baileys version: ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // we handle it manually
    browser: ['CyberControl', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('[Worker] QR received — scan with WhatsApp:');
      qrcodeTerminal.generate(qr, { small: true });
      try {
        const qrBase64 = await qrcode.toDataURL(qr);
        hub.emit('connection:status', { connected: false, qrCode: qrBase64 });
      } catch {
        hub.emit('connection:status', { connected: false });
      }
    }

    if (connection === 'open') {
      console.log('[Worker] Connected ✓');
      hub.emit('connection:status', { connected: true });
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[Worker] Connection closed (code=${code}), reconnect=${shouldReconnect}`);
      hub.emit('connection:status', { connected: false });
      if (shouldReconnect) setTimeout(startBaileys, 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const msgContent = msg.message;
      const hasMedia = !!(
        msgContent.imageMessage   ||
        msgContent.videoMessage   ||
        msgContent.audioMessage   ||
        msgContent.documentMessage ||
        msgContent.stickerMessage
      );
      if (!hasMedia) continue;

      const jid   = msg.key.remoteJid ?? '';
      const phone = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
      const pushName = msg.pushName ?? `Guest ${phone.slice(-4)}`;

      // Resolve profile pic
      let profilePicUrl: string | null = null;
      try { profilePicUrl = await sock.profilePictureUrl(jid, 'image'); } catch { /* ignore */ }

      // Determine mimetype from message type
      const imgMsg  = msgContent.imageMessage;
      const vidMsg  = msgContent.videoMessage;
      const audMsg  = msgContent.audioMessage;
      const docMsg  = msgContent.documentMessage;
      const stkMsg  = msgContent.stickerMessage;
      const mediaMsg = imgMsg ?? vidMsg ?? audMsg ?? docMsg ?? stkMsg;
      const mimetype = mediaMsg?.mimetype ?? 'application/octet-stream';

      try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
        if (!buffer?.length) { console.warn('[Worker] Empty media buffer, skipping'); continue; }
        await processMedia(sock, msg, buffer, mimetype, phone, pushName, profilePicUrl);
      } catch (e) {
        console.error('[Worker] Media error:', e);
      }
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

connectHub();
startBaileys().catch((e) => { console.error('[Worker] Fatal:', e); process.exit(1); });
