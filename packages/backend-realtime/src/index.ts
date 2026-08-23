import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, REDIS_URL, WORKER_SECRET } from '@cybercontrol/backend-core';

let io: SocketIOServer;
let workerSocket: any = null;
let workerConnected = false;
let lastQrCode: string | null = null;
const QR_TTL_MS = 40_000;
const workspaceQRs = new Map<string, { qr: string; updatedAt: number }>();
let qrRedis: any = null;
let qrRedisConnecting: Promise<any> | null = null;

async function getQrRedis(): Promise<any | null> {
  if (!REDIS_URL) return null;
  if (qrRedis) return qrRedis;
  if (qrRedisConnecting) return qrRedisConnecting;
  qrRedisConnecting = (async () => {
    try {
      const { createClient } = await import('redis');
      const client = createClient({ url: REDIS_URL, socket: { reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000) } });
      client.on('error', (e: any) => console.error('[QR] redis error:', e.message));
      client.on('ready', () => console.log('[QR] redis ready'));
      await client.connect();
      qrRedis = client;
      console.log('[QR] Redis-backed QR cache active (shared across backend instances)');
      return client;
    } catch (e: any) {
      console.error('[QR] redis connect failed:', e.message);
      return null;
    } finally { qrRedisConnecting = null; }
  })();
  return qrRedisConnecting;
}

const qrKey = (wsId: string) => `wa:qr:${wsId}`;
export function getIO() { return io; }
export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }

export async function getWorkspaceQR(wsId: string): Promise<string | null> {
  if (REDIS_URL) {
    try {
      const redis = await getQrRedis();
      if (redis) { const raw = await redis.get(qrKey(wsId)); return raw ? JSON.parse(raw)?.qr || null : null; }
    } catch (e: any) { console.error('[QR] get failed:', e.message); }
    return null;
  }
  return workspaceQRs.get(wsId)?.qr || null;
}

export async function setWorkspaceQR(wsId: string, qr: string | null): Promise<void> {
  if (REDIS_URL) {
    try {
      const redis = await getQrRedis();
      if (redis) {
        if (qr) await redis.set(qrKey(wsId), JSON.stringify({ qr, updatedAt: Date.now() }), { PX: QR_TTL_MS });
        else await redis.del(qrKey(wsId));
      }
    } catch (e: any) { console.error('[QR] set failed:', e.message); }
    return;
  }
  if (qr) workspaceQRs.set(wsId, { qr, updatedAt: Date.now() });
  else workspaceQRs.delete(wsId);
}

export async function getWorkspaceQRWithAge(wsId: string): Promise<{ qr: string | null; ageMs: number }> {
  if (REDIS_URL) {
    try {
      const redis = await getQrRedis();
      if (redis) {
        const raw = await redis.get(qrKey(wsId));
        if (!raw) return { qr: null, ageMs: 0 };
        const entry = JSON.parse(raw);
        return { qr: entry.qr, ageMs: Date.now() - entry.updatedAt };
      }
    } catch (e: any) { console.error('[QR] getWithAge failed:', e.message); }
    return { qr: null, ageMs: 0 };
  }
  const entry = workspaceQRs.get(wsId);
  return entry ? { qr: entry.qr, ageMs: Date.now() - entry.updatedAt } : { qr: null, ageMs: 0 };
}

export function setupSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }, transports: ['websocket', 'polling'],
    pingInterval: 20000, pingTimeout: 25000, maxHttpBufferSize: 1e7,
  });
  if (REDIS_URL) void (async () => {
    try {
      const { createClient } = await import('redis');
      const { createAdapter } = await import('@socket.io/redis-adapter');
      const pub = createClient({ url: REDIS_URL });
      const sub = pub.duplicate();
      pub.on('error', (e: any) => console.error('[Socket] redis pub error:', e.message));
      sub.on('error', (e: any) => console.error('[Socket] redis sub error:', e.message));
      await Promise.all([pub.connect(), sub.connect()]);
      io.adapter(createAdapter(pub, sub));
      console.log('[Socket] Redis adapter attached — realtime events fan out across instances');
    } catch (e: any) { console.error('[Socket] Redis adapter failed; continuing single-instance:', e.message); }
  })();
  io.on('connection', (socket) => {
    if (socket.handshake.auth?.secret === WORKER_SECRET) {
      workerSocket = socket; workerConnected = false; console.log('[Hub] Worker auto-registered via auth');
    }
    socket.on('worker:register', ({ secret }) => {
      if (secret !== WORKER_SECRET) { socket.disconnect(); return; }
      workerSocket = socket; console.log('[Hub] Worker registered');
    });
    socket.on('connection:status', (payload: any) => {
      workerConnected = payload.connected;
      if (payload.connected) lastQrCode = null; else if (payload.qrCode) lastQrCode = payload.qrCode;
      io.emit('connection:status', payload);
    });
    socket.on('request:status', () => socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) }));
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) try {
      const decoded: any = jwt.verify(token as string, JWT_SECRET);
      if (decoded.workspaceId) { socket.join(decoded.workspaceId); console.log('[Socket] Joined room:', decoded.workspaceId.slice(0, 8)); }
    } catch {}
    socket.on('new_whatsapp_file', (file: any) => file.workspaceId ? io.to(file.workspaceId).emit('new_whatsapp_file', file) : io.emit('new_whatsapp_file', file));
    socket.on('upload:queued', (data: any) => io.emit('upload:queued', data));
    socket.on('upload:start', (data: any) => io.emit('upload:start', data));
    socket.on('upload:done', (data: any) => io.emit('upload:done', data));
    socket.on('upload:fail', (data: any) => io.emit('upload:fail', data));
    socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });
    socket.on('disconnect', () => {
      if (socket === workerSocket) { workerSocket = null; workerConnected = false; console.log('[Hub] Worker disconnected'); io.emit('connection:status', { connected: false }); }
    });
  });
  return io;
}