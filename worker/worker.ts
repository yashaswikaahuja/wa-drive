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
const UPLOAD_CONCURRENCY = 1;   // 1 at a time — safe for 1GB RAM
const UPLOAD_TIMEOUT_MS  = 30000; // 30s per upload
const RETRY_DELAYS = [1000, 3000, 7000]; // exponential backoff

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif',  'image/webp': 'webp', 'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4',  'video/3gpp': '3gp',
};

// ── Simple concurrency-limited queue ────────────────────────────────────────

type QueueTask = () => Promise<void>;
let activeCount = 0;
const taskQueue: QueueTask[] = [];

function enqueue(task: QueueTask) {
  taskQueue.push(task);
  drainQueue();
}

function drainQueue() {
  while (activeCount < UPLOAD_CONCURRENCY && taskQueue.length > 0) {
    const task = taskQueue.shift()!;
    activeCount++;
    task().finally(() => {
      activeCount--;
      drainQueue();
    });
  }
}

// ── Hub connection ───────────────────────────────────────────────────────────

let hub: Socket;
let isWhatsAppConnected = false;

function connectHub() {
  hub = ioClient(HUB_URL, {
    auth: { secret: WORKER_SECRET },
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });
  hub.on('connect', () => {
    console.log('[Worker] Hub connected');
    hub.emit('worker:register', { secret: WORKER_SECRET });
    setTimeout(() => hub.emit('connection:status', { connected: isWhatsAppConnected }), 500);
    // Heartbeat: re-send status every 30s so hub always knows real state
    setInterval(() => hub.emit('connection:status', { connected: isWhatsAppConnected }), 30_000);
  });
  hub.on('disconnect',    (r) => console.log('[Worker] Hub disconnected:', r));
  hub.on('connect_error', (e) => console.error('[Worker] Hub error:', e.message));
  hub.on('worker:reinit', () => { reconnectDelay = 5000; startBaileys().catch(console.error); });
}

// ── Upload with retry + timeout ──────────────────────────────────────────────

async function uploadWithRetry(
  buffer: Buffer,
  mimetype: string,
  fileName: string,
  phone: string,
  customerName: string,
  profilePicUrl: string | null,
): Promise<void> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mimetype }), fileName);
      form.append('phone', phone);
      form.append('senderName', customerName);
      form.append('profilePicUrl', profilePicUrl ?? '');
      form.append('mimetype', mimetype);
      form.append('fileName', fileName);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      const res = await fetch(`${HUB_URL}/api/worker/upload`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const { fileId } = await res.json() as { fileId: string };
        console.log(`[Worker] ✓ Uploaded ${fileName} → Drive ${fileId}`);
        return;
      }

      const errText = await res.text();
      if (res.status === 401) {
        console.error(`[Worker] ✗ ${fileName} — Drive not connected (401). Skipping retries.`);
        return; // no point retrying
      }
      throw new Error(`HTTP ${res.status}: ${errText}`);

    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? 'Timeout' : e?.message ?? String(e);
      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[Worker] ↻ ${fileName} attempt ${attempt + 1} failed (${reason}). Retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`[Worker] ✗ FAILED ${fileName} | phone=${phone} | reason=${reason} | all retries exhausted`);
      }
    }
  }
}

// ── Media download with retry ────────────────────────────────────────────────

const DOWNLOAD_DELAYS_MS = [3000, 6000, 12000, 20000, 30000]; // 5 attempts

async function downloadWithRetry(msg: proto.IWebMessageInfo): Promise<Buffer | null> {
  const msgContent = msg.message;
  if (!msgContent) return null;

  // Validate that the message has a media key before attempting download.
  // "Cannot derive from empty media key" happens when the key is missing/null.
  const mediaMsg =
    msgContent.imageMessage ??
    msgContent.videoMessage ??
    msgContent.audioMessage ??
    msgContent.documentMessage ??
    msgContent.stickerMessage;

  if (!mediaMsg) {
    console.warn('[Worker] No media message object found — skipping download');
    return null;
  }

  // WhatsApp CDN sometimes needs a moment before the media is available.
  // A short initial delay prevents the "empty media key" error on first attempt.
  await new Promise(r => setTimeout(r, 2000));

  for (let attempt = 1; attempt <= DOWNLOAD_DELAYS_MS.length; attempt++) {
    try {
      // Re-check media key on each attempt — it may have been populated by now
      if (!mediaMsg.mediaKey || mediaMsg.mediaKey.length === 0) {
        console.warn(`[Worker] Empty media key on attempt ${attempt} — waiting before retry`);
        if (attempt < DOWNLOAD_DELAYS_MS.length) {
          await new Promise(r => setTimeout(r, DOWNLOAD_DELAYS_MS[attempt - 1]));
        }
        continue;
      }

      const buf = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
      if (buf && buf.length > 0) return buf;
      console.warn(`[Worker] Empty buffer on attempt ${attempt}`);
    } catch (e: any) {
      const reason = (e as Error).message ?? String(e);
      console.warn(`[Worker] Download attempt ${attempt} failed: ${reason}`);
    }
    if (attempt < DOWNLOAD_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, DOWNLOAD_DELAYS_MS[attempt - 1]));
    }
  }
  return null;
}

// ── Baileys ──────────────────────────────────────────────────────────────────

let currentSock: WASocket | null = null;
let reconnectDelay = 5000;

async function startBaileys() {
  if (currentSock) { try { currentSock.end(undefined); } catch { /* ignore */ } currentSock = null; }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[Worker] Baileys ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['CyberControl', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    keepAliveIntervalMs: 30000,
  });
  currentSock = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrcodeTerminal.generate(qr, { small: true });
      try { hub.emit('connection:status', { connected: false, qrCode: await qrcode.toDataURL(qr) }); }
      catch { hub.emit('connection:status', { connected: false }); }
    }
    if (connection === 'open') {
      console.log('[Worker] WhatsApp connected ✓');
      isWhatsAppConnected = true;
      reconnectDelay = 5000;
      hub.emit('connection:status', { connected: true });
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[Worker] Closed (code=${code}), reconnect=${shouldReconnect}, delay=${reconnectDelay}ms`);
      isWhatsAppConnected = false;
      hub.emit('connection:status', { connected: false });
      if (shouldReconnect) { setTimeout(startBaileys, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 2, 60000); }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const msgContent = msg.message;
      const hasMedia = !!(msgContent.imageMessage || msgContent.videoMessage ||
        msgContent.audioMessage || msgContent.documentMessage || msgContent.stickerMessage);
      if (!hasMedia) continue;

      // Phone resolution
      const jid = msg.key.remoteJid ?? '';
      let phone: string;
      if (jid.endsWith('@lid')) {
        const participant = msg.key.participant ?? (msg as any).participant ?? '';
        if (participant && !participant.endsWith('@lid')) {
          phone = participant.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
        } else {
          try {
            const contact = await sock.getContact(jid);
            phone = (contact?.id?._serialized ?? '').replace(/@c\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
          } catch { phone = ''; }
          if (!phone) phone = jid.replace('@lid', '').replace(/[^0-9+]/g, '');
        }
      } else {
        phone = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
      }

      const pushName = msg.pushName ?? `Guest ${phone.slice(-4)}`;
      const mediaMsg = msgContent.imageMessage ?? msgContent.videoMessage ?? msgContent.audioMessage ?? msgContent.documentMessage ?? msgContent.stickerMessage;
      const mimetype = mediaMsg?.mimetype ?? 'application/octet-stream';
      const ext = MIME_TO_EXT[mimetype] ?? 'bin';
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const typeLabel = mimetype.startsWith('image/') ? 'photo' : mimetype.startsWith('video/') ? 'video' : mimetype.startsWith('audio/') ? 'audio' : 'file';
      const fileName = `${phone}_${ts}_${typeLabel}.${ext}`;

      console.log(`[Worker] Queuing ${fileName} (${mimetype}) from ${phone}`);
      hub.emit('upload:queued', { fileName, phone });

      // Capture msg reference for closure — download inside queue task
      const capturedMsg = msg;
      enqueue(async () => {
        let profilePicUrl: string | null = null;
        try { profilePicUrl = await sock.profilePictureUrl(jid, 'image'); } catch { /* ignore */ }

        const buffer = await downloadWithRetry(capturedMsg);
        if (!buffer || buffer.length === 0) {
          console.error(`[Worker] ✗ FAILED download ${fileName} | phone=${phone} | reason=download failed after all attempts`);
          hub.emit('upload:fail', { fileName, phone, reason: 'Download failed' });
          return;
        }

        // Sanity check: reject suspiciously small buffers (< 100 bytes = corrupt)
        if (buffer.length < 100) {
          console.error(`[Worker] ✗ SKIPPED ${fileName} | phone=${phone} | reason=buffer too small (${buffer.length} bytes)`);
          hub.emit('upload:fail', { fileName, phone, reason: 'Corrupt file (too small)' });
          return;
        }

        console.log(`[Worker] Processing ${fileName} (${buffer.length} bytes)`);
        hub.emit('upload:start', { fileName, phone });
        await uploadWithRetry(buffer, mimetype, fileName, phone, pushName, profilePicUrl);
        hub.emit('upload:done', { fileName, phone });
      });
    }
  });
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

createServer((_req, res) => res.end('ok')).listen(process.env['PORT'] ?? 3002);
setInterval(() => fetch(`${HUB_URL}/api/health`).catch(() => {}), 10 * 60 * 1000);

connectHub();
startBaileys().catch((e) => { console.error('[Worker] Fatal:', e); process.exit(1); });
