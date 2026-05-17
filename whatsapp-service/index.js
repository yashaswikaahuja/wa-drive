import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import http from 'http';

const PORT = process.env.WA_PORT || 3100;
const PARENT_URL = process.env.PARENT_URL || 'https://api.cybercontrol.fun';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'wa-service-secret-2024';
const AUTH_DIR = process.env.AUTH_DIR || './sessions';

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ── Session Manager ─────────────────────────────────────────────────────────
const sessions = new Map(); // workspaceId -> { socket, qr, status, phone }

function authMiddleware(req, res, next) {
  const token = req.headers['x-service-secret'];
  if (token !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function startSession(workspaceId) {
  if (sessions.has(workspaceId) && sessions.get(workspaceId).socket) {
    console.log(`[WA:${workspaceId.slice(0,8)}] Session already active`);
    return;
  }

  const sessionDir = path.join(AUTH_DIR, workspaceId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['CyberControl', 'Chrome', '1.0'],
  });

  const session = { socket: sock, qr: null, status: 'connecting', phone: null };
  sessions.set(workspaceId, session);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = qr;
      session.status = 'qr_pending';
      broadcastToWs(workspaceId, { type: 'qr', qr, workspaceId });
      notifyParent(workspaceId, 'qr', { qr });
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.qr = null;
      session.phone = sock.user?.id?.split(':')[0] || null;
      console.log(`[WA:${workspaceId.slice(0,8)}] Connected as ${session.phone}`);
      notifyParent(workspaceId, 'connected', { phone: session.phone });
      broadcastToWs(workspaceId, { type: 'status', connected: true, phone: session.phone, workspaceId });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      session.status = loggedOut ? 'logged_out' : 'disconnected';
      session.socket = null;
      console.log(`[WA:${workspaceId.slice(0,8)}] Disconnected: ${reason} loggedOut=${loggedOut}`);
      notifyParent(workspaceId, 'disconnected', { loggedOut });
      broadcastToWs(workspaceId, { type: 'status', connected: false, workspaceId });

      if (loggedOut) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } else {
        // Reconnect after delay
        setTimeout(() => startSession(workspaceId), 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      // Unwrap viewOnce and captioned messages
      const innerMsg = msg.message?.viewOnceMessage?.message || 
        msg.message?.viewOnceMessageV2?.message ||
        msg.message?.documentWithCaptionMessage?.message || 
        msg.message || {};
      // Allow images and all documents (no videos/audio)
      const hasMedia = innerMsg.imageMessage || innerMsg.documentMessage ||
        msg.message?.documentWithCaptionMessage?.message?.documentMessage;
      if (!hasMedia) continue;

      const phone = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || 'unknown';
      const pushName = msg.pushName || phone;

      try {
        const buffer = await downloadMedia(sock, msg);
        if (!buffer) continue;

        const ext = getExtFromMsg(msg);
        const fileName = `${phone}_${Date.now()}_file.${ext}`;

        // Get sender's profile pic
        let profilePicUrl = null;
        try { profilePicUrl = await sock.profilePictureUrl(msg.key.remoteJid, 'image'); } catch {}

        // Upload to parent
        await uploadToParent(workspaceId, buffer, fileName, phone, pushName, profilePicUrl);
        console.log(`[WA:${workspaceId.slice(0,8)}] Uploaded ${fileName} from ${pushName}`);
      } catch (e) {
        console.error(`[WA:${workspaceId.slice(0,8)}] Media error:`, e.message);
      }
    }
  });
}

async function stopSession(workspaceId) {
  const session = sessions.get(workspaceId);
  if (session?.socket) {
    await session.socket.logout().catch(() => {});
    session.socket = null;
    session.status = 'disconnected';
  }
  sessions.delete(workspaceId);
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function downloadMedia(sock, msg) {
  const { downloadMediaMessage } = await import('baileys');
  try {
    return await downloadMediaMessage(msg, 'buffer', {});
  } catch (e) {
    // Retry once after 2s
    await new Promise(r => setTimeout(r, 2000));
    return await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
  }
}

function getExtFromMsg(msg) {
  const m = msg.message?.viewOnceMessage?.message || 
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.documentWithCaptionMessage?.message || 
    msg.message || {};
  if (m.imageMessage) return 'jpg';
  if (m.videoMessage) return 'mp4';
  if (m.audioMessage) return 'ogg';
  if (m.documentMessage) {
    const name = m.documentMessage.fileName || '';
    return name.split('.').pop() || 'pdf';
  }
  return 'bin';
}

async function uploadToParent(workspaceId, buffer, fileName, phone, pushName, profilePicUrl) {
  const FormData = (await import('form-data')).default;
  const https = await import('https');
  const http = await import('http');
  const url = new URL(`${PARENT_URL}/api/worker/upload`);
  
  const form = new FormData();
  form.append('file', buffer, { filename: fileName, contentType: 'application/octet-stream' });
  form.append('phone', phone);
  form.append('senderName', pushName);
  form.append('workspaceId', workspaceId);
  form.append('fileName', fileName);
  if (profilePicUrl) form.append('profilePicUrl', profilePicUrl);
  
  const mod = url.protocol === 'https:' ? https : http;
  
  const res = await new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { ...form.getHeaders(), 'x-worker-secret': SERVICE_SECRET },
    }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.on('error', reject);
    form.pipe(req);
  });
  
  if (res.status >= 400) throw new Error(`Upload failed: ${res.status} ${res.body.substring(0, 100)}`);
}

async function notifyParent(workspaceId, event, data) {
  try {
    await fetch(`${PARENT_URL}/api/worker/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': SERVICE_SECRET },
      body: JSON.stringify({ workspaceId, event, ...data }),
    });
  } catch {}
}

function broadcastToWs(workspaceId, data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.workspaceId === workspaceId) {
      client.send(JSON.stringify(data));
    }
  });
}

// ── WebSocket ──────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  ws.workspaceId = url.searchParams.get('workspaceId');
  ws.on('close', () => {});
});

// ── API ────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', sessions: sessions.size }));

app.post('/sessions/start', authMiddleware, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  await startSession(workspaceId);
  res.json({ ok: true });
});

app.post('/sessions/stop', authMiddleware, async (req, res) => {
  const { workspaceId } = req.body;
  await stopSession(workspaceId);
  res.json({ ok: true });
});

app.get('/sessions/:workspaceId/status', authMiddleware, (req, res) => {
  const session = sessions.get(req.params.workspaceId);
  if (!session) return res.json({ connected: false, status: 'none' });
  res.json({ connected: session.status === 'connected', status: session.status, phone: session.phone, qr: session.qr });
});

app.get('/sessions/:workspaceId/qr', authMiddleware, (req, res) => {
  const session = sessions.get(req.params.workspaceId);
  res.json({ qr: session?.qr || null });
});

app.post('/sessions/:workspaceId/send', authMiddleware, async (req, res) => {
  const session = sessions.get(req.params.workspaceId);
  if (!session?.socket) return res.status(400).json({ error: 'Not connected' });
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  try {
    const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    await session.socket.sendMessage(jid, { text: message });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/sessions', authMiddleware, (_, res) => {
  const list = [];
  sessions.forEach((s, id) => list.push({ workspaceId: id, status: s.status, phone: s.phone }));
  res.json(list);
});

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[WhatsApp Service] Running on port ${PORT}`);
  console.log(`[WhatsApp Service] Parent: ${PARENT_URL}`);
  console.log(`[WhatsApp Service] Sessions dir: ${AUTH_DIR}`);
});
