import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { EventEmitter } from 'events';

const sessions = new Map(); // workspaceId → { client, status, qr, phone }

const PUPPETEER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
  '--disable-gpu', '--single-process'
];

export const sessionEvents = new EventEmitter();

export function getSession(workspaceId) {
  return sessions.get(workspaceId) || null;
}

export function getAllSessions() {
  const list = [];
  sessions.forEach((s, id) => list.push({ id, status: s.status, phone: s.phone }));
  return list;
}

export async function startSession(workspaceId) {
  // If already connected, skip
  const existing = sessions.get(workspaceId);
  if (existing && existing.status === 'connected') return;

  // If exists but not connected, destroy old client first
  if (existing && existing.client) {
    try { await existing.client.destroy(); } catch {}
  }
  sessions.delete(workspaceId);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: workspaceId, dataPath: './sessions' }),
    puppeteer: { headless: true, args: PUPPETEER_ARGS }
  });

  const session = { client, status: 'connecting', qr: null, phone: null };
  sessions.set(workspaceId, session);

  client.on('qr', (qr) => {
    session.qr = qr;
    session.status = 'qr_pending';
    sessionEvents.emit('qr', { workspaceId, qr });
  });

  client.on('ready', () => {
    session.status = 'connected';
    session.qr = null;
    session.phone = client.info?.wid?.user || null;
    console.log(`[WA:${workspaceId.slice(0,8)}] Connected as ${session.phone}`);
    sessionEvents.emit('connected', { workspaceId, phone: session.phone });
  });

  client.on('disconnected', (reason) => {
    session.status = 'disconnected';
    session.phone = null;
    console.log(`[WA:${workspaceId.slice(0,8)}] Disconnected: ${reason}`);
    sessionEvents.emit('disconnected', { workspaceId, reason });
    // Don't auto-reconnect. User must click "Connect" again.
    // This prevents the infinite reconnect loop.
  });

  client.on('auth_failure', () => {
    session.status = 'auth_failed';
    console.log(`[WA:${workspaceId.slice(0,8)}] Auth failed — need new QR`);
    sessionEvents.emit('disconnected', { workspaceId, reason: 'auth_failure' });
  });

  try {
    await client.initialize();
  } catch (e) {
    session.status = 'error';
    console.error(`[WA:${workspaceId.slice(0,8)}] Init error: ${e.message}`);
  }
}

export async function stopSession(workspaceId) {
  const session = sessions.get(workspaceId);
  if (!session) return;
  try { await session.client.destroy(); } catch {}
  sessions.delete(workspaceId);
  console.log(`[WA:${workspaceId.slice(0,8)}] Stopped`);
}
