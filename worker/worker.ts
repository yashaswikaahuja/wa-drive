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
import qrcode from 'qrcode';
import { io as ioClient, Socket } from 'socket.io-client';
import { createServer } from 'http';
import { rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const log = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });

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
// Single heartbeat timer — cleared and recreated on each hub reconnect to
// prevent timer accumulation when the hub restarts repeatedly.
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
    log.info('[Worker] Hub connected');
    hub.emit('worker:register', { secret: WORKER_SECRET });
    setTimeout(() => hub.emit('connection:status', { connected: isWhatsAppConnected }), 500);
    // Clear any previous heartbeat before starting a new one — prevents
    // multiple overlapping intervals when the hub reconnects.
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(
      () => hub.emit('connection:status', { connected: isWhatsAppConnected }),
      30_000,
    );
  });
  hub.on('disconnect',    (r: string) => log.warn({ reason: r }, '[Worker] Hub disconnected'));
  hub.on('connect_error', (e: Error)  => log.error({ err: e.message }, '[Worker] Hub error'));
  hub.on('worker:reinit', () => { reconnectDelay = 5000; startBaileys().catch((e: Error) => log.error(e, '[Worker] reinit failed')); });
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
        log.info({ fileId, fileName }, '[Worker] ✓ Uploaded to Drive');
        return;
      }

      const errText = await res.text();
      if (res.status === 401) {
        log.error({ fileName }, '[Worker] Drive not connected (401) — skipping retries');
        return; // no point retrying
      }
      throw new Error(`HTTP ${res.status}: ${errText}`);

    } catch (e: any) {
      const reason = e?.name === 'AbortError' ? 'Timeout' : e?.message ?? String(e);
      if (attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        log.warn({ fileName, attempt: attempt + 1, reason, delay }, '[Worker] Upload retry');
        await new Promise(r => setTimeout(r, delay));
      } else {
        log.error({ fileName, phone, reason }, '[Worker] Upload failed — all retries exhausted');
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
    log.warn('[Worker] No media message object — skipping download');
    return null;
  }

  // WhatsApp CDN sometimes needs a moment before the media is available.
  // A short initial delay prevents the "empty media key" error on first attempt.
  await new Promise(r => setTimeout(r, 2000));

  for (let attempt = 1; attempt <= DOWNLOAD_DELAYS_MS.length; attempt++) {
    try {
      // Re-check media key on each attempt — it may have been populated by now
      if (!mediaMsg.mediaKey || mediaMsg.mediaKey.length === 0) {
        log.warn({ attempt }, '[Worker] Empty media key — waiting before retry');
        if (attempt < DOWNLOAD_DELAYS_MS.length) {
          await new Promise(r => setTimeout(r, DOWNLOAD_DELAYS_MS[attempt - 1]));
        }
        continue;
      }

      const buf = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
      if (buf && buf.length > 0) return buf;
      log.warn({ attempt }, '[Worker] Empty buffer on download attempt');
    } catch (e: unknown) {
      const reason = (e as Error).message ?? String(e);
      log.warn({ attempt, reason }, '[Worker] Download attempt failed');
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
  log.info({ version: version.join('.') }, '[Worker] Starting Baileys');

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
      // Send QR to hub only — never print to terminal (operators don't have terminal access).
      try { hub.emit('connection:status', { connected: false, qrCode: await qrcode.toDataURL(qr) }); }
      catch { hub.emit('connection:status', { connected: false }); }
    }
    if (connection === 'open') {
      log.info('[Worker] WhatsApp connected ✓');
      isWhatsAppConnected = true;
      reconnectDelay = 5000;
      hub.emit('connection:status', { connected: true });
      // worker:ready lets the hub distinguish "just reconnected" from heartbeat pings.
      hub.emit('worker:ready', { version: '5.33' });
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      log.warn({ code, loggedOut, delay: reconnectDelay }, '[Worker] Connection closed');
      isWhatsAppConnected = false;
      hub.emit('connection:status', { connected: false });
      if (loggedOut) {
        // Phone explicitly logged out — clear saved credentials so the next
        // startBaileys() call generates a fresh QR instead of looping on 401.
        log.warn('[Worker] Logged out — clearing auth_info and stopping reconnect');
        try { rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
        return; // do NOT reconnect; operator must re-scan QR
      }
      // Any other close reason (network blip, phone sleep, server restart):
      // reconnect with exponential backoff capped at 30 s.
      const delay = reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      log.info({ delay }, '[Worker] Scheduling reconnect');
      setTimeout(() => startBaileys().catch((e: Error) => log.error(e, '[Worker] reconnect failed')), delay);
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

      log.info({ fileName, mimetype, phone }, '[Worker] Queuing upload');
      hub.emit('upload:queued', { fileName, phone });

      // Capture msg reference for closure — download inside queue task
      const capturedMsg = msg;
      enqueue(async () => {
        let profilePicUrl: string | null = null;
        try { profilePicUrl = await sock.profilePictureUrl(jid, 'image'); } catch { /* ignore */ }

        const buffer = await downloadWithRetry(capturedMsg);
        if (!buffer || buffer.length === 0) {
          log.error({ fileName, phone }, '[Worker] Download failed after all attempts');
          hub.emit('upload:fail', { fileName, phone, reason: 'Download failed' });
          return;
        }
        if (buffer.length < 100) {
          log.error({ fileName, phone, bytes: buffer.length }, '[Worker] Buffer too small — corrupt file');
          hub.emit('upload:fail', { fileName, phone, reason: 'Corrupt file (too small)' });
          return;
        }
        log.info({ fileName, bytes: buffer.length }, '[Worker] Processing upload');
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

// Graceful shutdown: logout from WhatsApp cleanly so the phone doesn't show
// the session as still active, then let PM2 / the OS restart the process.
process.on('SIGTERM', async () => {
  log.info('[Worker] SIGTERM received — shutting down gracefully');
  isWhatsAppConnected = false;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try {
    if (currentSock) await currentSock.logout();
  } catch { /* ignore logout errors during shutdown */ }
  hub.emit('connection:status', { connected: false });
  hub.disconnect();
  setTimeout(() => process.exit(0), 2000);
});

connectHub();
startBaileys().catch((e: Error) => { log.fatal(e, '[Worker] Fatal startup error'); process.exit(1); });
