import express from 'express';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WebSocketServer } from 'ws';
import http from 'http';
import pg from 'pg';
import { usePostgresAuthState, clearPostgresAuthState } from './auth-postgres.js';

const PORT = process.env.WA_PORT || 3100;
const PARENT_URL = process.env.PARENT_URL || 'https://api.cybercontrol.fun';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'wa-service-secret-2024';
const WA_SECRET = process.env.WA_SECRET || SERVICE_SECRET; // alias for newer code paths
const AUTH_DIR = process.env.AUTH_DIR || './sessions';
const RESOLVER_URL = process.env.RESOLVER_URL || 'http://localhost:3200';

// Auth backend: 'postgres' (DB-backed, shardable) or 'files' (local, default for safety).
// Set WA_AUTH_BACKEND=postgres + DATABASE_URL to decouple sessions from local disk.
const WA_AUTH_BACKEND = process.env.WA_AUTH_BACKEND || 'files';
// This instance's tailnet hostname (e.g. cybercontrol-wa-1). Used for sticky-shard heartbeats +
// boot resume. Empty → single-instance mode (no heartbeat / no resume).
const WA_INSTANCE_NAME = process.env.WA_INSTANCE_NAME || '';
const HEARTBEAT_MS = Number(process.env.WA_HEARTBEAT_MS || 20_000);
// Resource-based admission control: this instance keeps ACCEPTING new sessions until its own RAM
// usage crosses this %. VM-size-agnostic — a 1GB and an 8GB box each fill to their own ceiling.
// Keep a burst margin below 100% (a connecting/syncing session spikes RAM; OOM kills ALL sessions).
const WA_ACCEPT_THRESHOLD_PCT = Number(process.env.WA_ACCEPT_THRESHOLD_PCT || 80);
const pgPool = (WA_AUTH_BACKEND === 'postgres' && process.env.DATABASE_URL)
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

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
  let state, saveCreds;
  if (pgPool) {
    ({ state, saveCreds } = await usePostgresAuthState(pgPool, workspaceId));
  } else {
    fs.mkdirSync(sessionDir, { recursive: true });
    ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
  }
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    markOnlineOnConnect: false,  // Don't broadcast "online" when the socket connects
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
      // Mark presence as UNAVAILABLE so the user's contacts don't see them "online" 24/7.
      // The socket stays open for receiving messages, but presence is hidden. Critical for
      // avoiding WhatsApp bans and not alarming contacts.
      sock.sendPresenceUpdate('unavailable').catch(() => {});
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
        if (pgPool) clearPostgresAuthState(pgPool, workspaceId).catch(() => {});
        else fs.rmSync(sessionDir, { recursive: true, force: true });
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

      const rawJid = msg.key.remoteJid || '';
      const participantJid = msg.key.participant || '';
      // For groups, rawJid is the group, real sender is in participant
      const senderJid = rawJid.endsWith('@g.us') ? participantJid : rawJid;
      let phone;
      let profilePicUrl = null;
      let savedName = null;

      if (senderJid.endsWith('@s.whatsapp.net')) {
        phone = senderJid.replace('@s.whatsapp.net', '');
        try { profilePicUrl = await sock.profilePictureUrl(senderJid, 'image'); } catch {}
        try {
          const r = await fetch(`${RESOLVER_URL}/contact?phone=${phone}`, { headers: { 'x-service-secret': WA_SECRET } });
          if (r.ok) {
            const data = await r.json();
            savedName = data.name || null;
            console.log(`[WA] phone ${phone} resolver returned name=${data.name}`);
          } else {
            console.warn(`[WA] phone ${phone} resolver HTTP ${r.status}`);
          }
        } catch (e) {
          console.warn(`[WA] phone ${phone} resolver failed: ${e.message}`);
        }
      } else if (senderJid.endsWith('@lid')) {
        const lidNum = senderJid.replace('@lid', '');
        try {
          const r = await fetch(`${RESOLVER_URL}/resolve?lid=${lidNum}`, { headers: { 'x-service-secret': WA_SECRET } });
          if (r.ok) {
            const data = await r.json();
            phone = data.phone || lidNum;
            profilePicUrl = data.dpUrl || null;
            savedName = data.name || null;
            console.log(`[WA] LID ${lidNum} → ${phone}${savedName ? ' (' + savedName + ')' : ''}`);
          } else {
            console.warn(`[WA] LID ${lidNum} resolver HTTP ${r.status}`);
            phone = lidNum;
          }
        } catch (e) {
          console.warn(`[WA] LID ${lidNum} resolver error: ${e.message}`);
          phone = lidNum;
        }
      } else {
        phone = senderJid.replace(/@.*/, '') || rawJid.replace(/@.*/, '');
        console.warn(`[WA] sender JID has unknown format: ${senderJid} (rawJid=${rawJid})`);
      }
      // Priority: operator's saved contact name > sender's WA display name > phone
      const pushName = savedName || msg.pushName || phone;

      try {
        const buffer = await downloadMedia(sock, msg);
        if (!buffer) continue;

        const ext = getExtFromMsg(msg);
        const fileName = `${phone}_${Date.now()}_file.${ext}`;

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
  const { workspaceId, force } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  if (force) {
    const existing = sessions.get(workspaceId);
    if (existing?.socket) {
      console.log(`[WA:${workspaceId.slice(0, 8)}] Force restart — tearing down existing socket`);
      try { existing.socket.end(); } catch {}
    }
    sessions.delete(workspaceId);
  }
  await startSession(workspaceId);
  res.json({ ok: true, forced: !!force });
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

// ── Resource metrics for admission control ───────────────────────────────────
// Report this instance's REAL memory pressure so the hub routes new sessions by headroom.
// Prefer the cgroup limit (the container's actual RAM ceiling) over os.totalmem() (which reports the
// HOST's RAM and would over-estimate capacity inside a memory-limited container). Falls back to os.*.
function readCgroupMem() {
  // cgroup v2
  try {
    const max = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    const cur = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();
    if (max && max !== 'max') {
      const total = Number(max), used = Number(cur);
      if (total > 0) return { total, used };
    }
  } catch {}
  // cgroup v1
  try {
    const total = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim());
    const used = Number(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim());
    // v1 reports a huge sentinel when unlimited; ignore if larger than host RAM
    if (total > 0 && total < os.totalmem() * 4) return { total, used };
  } catch {}
  return null;
}

function memStats() {
  const cg = readCgroupMem();
  let total, used;
  if (cg) { total = cg.total; used = cg.used; }
  else { total = os.totalmem(); used = total - os.freemem(); }
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return { mem_pct: pct, mem_total: total, mem_used: used };
}

// ── Sticky-shard: heartbeat + boot resume ────────────────────────────────────
// Tell the hub we're alive on the tailnet. If these stop arriving (instance off the tailnet),
// the hub fails this instance's workspaces over to a healthy instance.
async function sendHeartbeat() {
  if (!WA_INSTANCE_NAME) return;
  const { mem_pct } = memStats();
  const accepting = mem_pct < WA_ACCEPT_THRESHOLD_PCT;   // refuse NEW sessions once near our own RAM ceiling
  try {
    await fetch(`${PARENT_URL}/api/worker/instance-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': SERVICE_SECRET },
      body: JSON.stringify({
        instance: WA_INSTANCE_NAME,
        mem_pct,                 // current RAM usage %
        sessions: sessions.size, // sessions this instance is running
        accepting,               // may the hub assign NEW sessions here?
      }),
    });
  } catch { /* hub unreachable → hub will mark us dead, which is correct */ }
}

// On boot, resume the sessions this instance owns (per the shard map) so they reconnect
// proactively (e.g. after a restart or a failover) without waiting for a user request.
// Requires DB-backed auth (pgPool) so creds can be restored with no QR re-scan.
async function resumeAssignedSessions() {
  if (!pgPool || !WA_INSTANCE_NAME) return;
  try {
    const { rows } = await pgPool.query('SELECT workspace_id FROM wa_assignments WHERE instance=$1', [WA_INSTANCE_NAME]);
    console.log(`[WhatsApp Service] Resuming ${rows.length} assigned session(s) for ${WA_INSTANCE_NAME}`);
    for (const r of rows) {
      startSession(r.workspace_id).catch(e => console.warn(`[resume] ${r.workspace_id.slice(0,8)}: ${e.message}`));
    }
  } catch (e) {
    console.warn(`[WhatsApp Service] resume skipped: ${e.message}`);
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[WhatsApp Service] Running on port ${PORT}`);
  console.log(`[WhatsApp Service] Parent: ${PARENT_URL}`);
  console.log(`[WhatsApp Service] Auth backend: ${WA_AUTH_BACKEND}${pgPool ? ' (DB)' : ' (local files)'}`);
  console.log(`[WhatsApp Service] Sessions dir: ${AUTH_DIR}`);
  if (WA_INSTANCE_NAME) {
    console.log(`[WhatsApp Service] Instance: ${WA_INSTANCE_NAME} (heartbeat every ${HEARTBEAT_MS}ms)`);
    sendHeartbeat();
    setInterval(sendHeartbeat, HEARTBEAT_MS);
    resumeAssignedSessions();
  }
});
