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
import { createServer } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HUB_URL       = process.env['HUB_URL']       ?? 'http://localhost:3000';
const WORKER_SECRET = process.env['WORKER_SECRET']  ?? 'worker-secret';
const AUTH_DIR      = resolve(__dirname, 'auth_info');

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
let isWhatsAppConnected = false;

function connectHub() {
  hub = ioClient(HUB_URL, {
    auth: { secret: WORKER_SECRET },
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 10000,
    // FIX 3: Force WebSocket transport — avoids Cloudflare 100s polling timeout
    transports: ['websocket'],
    // FIX 3: Keep connection alive through Cloudflare tunnel
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  hub.on('connect', () => {
    console.log('[Worker] Hub connected');
    hub.emit('worker:register', { secret: WORKER_SECRET });
    // Re-sync WhatsApp state after hub reconnect
    setTimeout(() => {
      hub.emit('connection:status', { connected: isWhatsAppConnected });
    }, 500); // small delay to ensure registration is processed first
  });
  hub.on('disconnect',    (r) => console.log('[Worker] Hub disconnected:', r));
  hub.on('connect_error', (e) => console.error('[Worker] Hub error:', e.message));
  hub.on('worker:reinit', () => {
    console.log('[Worker] Reinit requested — restarting Baileys');
    reconnectDelay = 5000; // reset backoff
    startBaileys().catch(console.error);
  });
}

// ── Media processing ─────────────────────────────────────────────────────────

async function processMedia(
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

  console.log(`[Worker] Uploading ${fileName} (${mimetype}, ${buffer.length} bytes)`);

  // FIX: retry upload up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mimetype }), fileName);
      form.append('phone', phone);
      form.append('senderName', customerName);
      form.append('profilePicUrl', profilePicUrl ?? '');
      form.append('mimetype', mimetype);
      form.append('fileName', fileName);

      const res = await fetch(`${HUB_URL}/api/worker/upload`, { method: 'POST', body: form });

      if (res.ok) {
        const { fileId } = await res.json() as { fileId: string; fileUrl: string };
        console.log(`[Worker] Uploaded → Drive: ${fileId}`);
        return;
      }

      const err = await res.text();
      console.error(`[Worker] Upload attempt ${attempt} failed (${res.status}): ${err}`);
      if (res.status === 401) return; // no Drive token — don't retry
    } catch (e) {
      console.error(`[Worker] Upload attempt ${attempt} error:`, (e as Error).message);
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }

  // All retries failed — emit via socket as fallback
  hub.emit('new_whatsapp_file', {
    id: `${Date.now()}-${phone}`,
    customerId: phone, customerName,
    fileName, fileUrl: '', profilePicUrl,
    timestamp: new Date().toISOString(),
  });
}

// ── Baileys WhatsApp client ──────────────────────────────────────────────────

let currentSock: WASocket | null = null;
let reconnectDelay = 5000; // FIX 1: exponential backoff state

async function startBaileys() {
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
    // FIX 1: keep-alive to reduce server-side disconnects
    keepAliveIntervalMs: 30000,
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
      isWhatsAppConnected = true;
      reconnectDelay = 5000; // reset backoff on success
      hub.emit('connection:status', { connected: true });
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[Worker] Connection closed (code=${code}), reconnect=${shouldReconnect}, delay=${reconnectDelay}ms`);
      isWhatsAppConnected = false;
      hub.emit('connection:status', { connected: false });

      if (shouldReconnect) {
        // FIX 1: exponential backoff — cap at 60s
        setTimeout(startBaileys, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 60000);
      }
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

      let phone: string;
      if (jid.endsWith('@lid')) {
        // participant field contains the real @s.whatsapp.net JID
        const participant = msg.key.participant ?? msg.participant ?? '';
        if (participant && !participant.endsWith('@lid')) {
          phone = participant.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
        } else {
          // fallback: try getContact, else use numeric lid
          try {
            const contact = await sock.getContact(jid);
            const serialized: string = contact?.id?._serialized ?? '';
            phone = serialized.replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
          } catch { phone = ''; }
          if (!phone) phone = jid.replace('@lid', '').replace(/[^0-9+]/g, '');
        }
      } else {
        phone = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
      }

      console.log(`[Worker] Media from phone: ${phone} (jid: ${jid})`);
      const pushName = msg.pushName ?? `Guest ${phone.slice(-4)}`;

      let profilePicUrl: string | null = null;
      try { profilePicUrl = await sock.profilePictureUrl(jid, 'image'); } catch { /* ignore */ }

      const mediaMsg = msgContent.imageMessage ?? msgContent.videoMessage ?? msgContent.audioMessage ?? msgContent.documentMessage ?? msgContent.stickerMessage;
      const mimetype = mediaMsg?.mimetype ?? 'application/octet-stream';

      // FIX 2: retry media download — "empty media key" happens on first attempt during reconnect
      let buffer: Buffer | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
          if (buffer?.length) break;
          console.warn(`[Worker] Empty buffer attempt ${attempt}, retrying...`);
        } catch (e) {
          console.warn(`[Worker] Download attempt ${attempt} failed: ${(e as Error).message}`);
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 3000));
      }

      if (!buffer?.length) {
        console.error('[Worker] Media download failed after 3 attempts, skipping');
        continue;
      }

      try {
        await processMedia(msg, buffer, mimetype, phone, pushName, profilePicUrl);
      } catch (e) {
        console.error('[Worker] processMedia error:', e);
      }
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

createServer((_req, res) => res.end('ok')).listen(process.env['PORT'] ?? 3002);

// Keep hub awake
setInterval(() => fetch(`${HUB_URL}/api/health`).catch(() => {}), 10 * 60 * 1000);

connectHub();
startBaileys().catch((e) => { console.error('[Worker] Fatal:', e); process.exit(1); });
