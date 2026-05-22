import { Client, LocalAuth } from 'whatsapp-web.js';
import { EventEmitter } from 'events';

interface Session {
  client: Client;
  status: 'connecting' | 'qr_pending' | 'connected' | 'disconnected' | 'auth_failed' | 'error';
  qr: string | null;
  phone: string | null;
}

const sessions = new Map<string, Session>();
export const sessionEvents = new EventEmitter();

const PUPPETEER_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--single-process', '--no-zygote'
];

export function getSession(workspaceId: string) {
  return sessions.get(workspaceId) || null;
}

export function getAllSessions() {
  return [...sessions.entries()].map(([id, s]) => ({ id, status: s.status, phone: s.phone }));
}

export async function startSession(workspaceId: string) {
  const existing = sessions.get(workspaceId);
  if (existing?.status === 'connected') return;
  if (existing?.client) { try { await existing.client.destroy(); } catch {} }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: workspaceId, dataPath: './sessions' }),
    puppeteer: { headless: true, args: PUPPETEER_ARGS }
  });

  const session: Session = { client, status: 'connecting', qr: null, phone: null };
  sessions.set(workspaceId, session);

  client.on('qr', (qr: string) => {
    session.qr = qr;
    session.status = 'qr_pending';
    sessionEvents.emit('qr', { workspaceId, qr });
  });

  client.on('ready', () => {
    session.status = 'connected';
    session.qr = null;
    session.phone = (client.info as any)?.wid?.user || null;
    console.log(`[WA:${workspaceId.slice(0, 8)}] Connected as ${session.phone}`);
  });

  client.on('disconnected', () => {
    session.status = 'disconnected';
    session.phone = null;
  });

  client.on('auth_failure', () => { session.status = 'auth_failed'; });

  try { await client.initialize(); }
  catch (e: any) {
    session.status = 'error';
    console.error(`[WA:${workspaceId.slice(0, 8)}] Init error: ${e.message}`);
  }
}

export async function stopSession(workspaceId: string) {
  const session = sessions.get(workspaceId);
  if (!session) return;
  try { await session.client.destroy(); } catch {}
  sessions.delete(workspaceId);
}
