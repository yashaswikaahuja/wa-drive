import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  downloadMediaMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import { io as ioClient, Socket } from 'socket.io-client';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HUB_URL        = process.env['HUB_URL']            ?? 'http://localhost:3000';
const WORKER_SECRET  = process.env['WORKER_SECRET']       ?? 'worker-secret';
const AUTH_DIR       = resolve(__dirname, 'auth_info');

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

function connectHub() {
  hub = ioClient(HUB_URL, { auth: { secret: WORKER_SECRET }, reconnection: true, reconnectionDelay: 3000 });
  hub.on('connect', () => {
    console.log('[Worker] Hub connected');
    hub.emit('worker:register', { secret: WORKER_SECRET });
  });
  hub.on('disconnect',    (r) => console.log('[Worker] Hub disconnected:', r));
  hub.on('connect_error', (e) => console.error('[Worker] Hub error:', e.message));
  hub.on('worker:reinit', () => {
    console.log('[Worker] Reinit requested — restarting Baileys');
    startBaileys().catch(console.error);
  });
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

  console.log(`[Worker] Uploading ${fileName} (${mimetype}, ${buffer.length} bytes) to hub`);

  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }), fileName);
    form.append('phone', phone);
    form.append('senderName', customerName);
    form.append('profilePicUrl', profilePicUrl ?? '');
    form.append('mimetype', mimetype);
    form.append('fileName', fileName);

    const res = await fetch(`${HUB_URL}/api/worker/upload`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Worker] Hub upload failed (${res.status}):`, err);
      // Fallback: emit via socket without Drive URL
      hub.emit('new_whatsapp_file', {
        id: `${Date.now()}-${phone}`,
        customerId: phone, customerName,
        fileName, fileUrl: '', profilePicUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { fileId, fileUrl } = await res.json() as { fileId: string; fileUrl: string };
    console.log(`[Worker] Uploaded to hub → Drive: ${fileId}`);
  } catch (e) {
    console.error('[Worker] Upload error:', e);
  }
}

// ── Baileys WhatsApp client ──────────────────────────────────────────────────

let currentSock: WASocket | null = null;

async function startBaileys() {
  // Close previous socket if reinit was called
  if (currentSock) {
    try { currentSock.end(undefined); } catch { /* ignore */ }
    currentSock = null;
  }

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
    printQRInTerminal: false,
    browser: ['CyberControl', 'Chrome', '1.0.0'],
    syncFullHistory: false,
  });
  currentSock = sock;

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

      const jid = msg.key.remoteJid ?? '';

      // Resolve real phone: @lid JIDs are temporary IDs, real number is in contact.id._serialized
      let phone: string;
      if (jid.endsWith('@lid')) {
        try {
          const contact = await sock.getContact(jid);
          const serialized: string = contact?.id?._serialized ?? '';
          phone = serialized.replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
        } catch { phone = ''; }
        if (!phone) phone = jid.replace('@lid', '').replace(/[^0-9+]/g, ''); // numeric fallback
      } else {
        phone = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
      }

      console.log(`[Worker] Resolved phone: ${phone} (from jid: ${jid})`);
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

// Minimal HTTP server so Render's health check doesn't mark this as failed
import { createServer } from 'http';
createServer((_req, res) => res.end('ok')).listen(process.env['PORT'] ?? 3001);

// Keep hub awake by pinging it every 10 minutes
setInterval(() => {
  fetch(`${HUB_URL}/api/health`).catch(() => {});
}, 10 * 60 * 1000);

connectHub();
startBaileys().catch((e) => { console.error('[Worker] Fatal:', e); process.exit(1); });
