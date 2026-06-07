import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, WORKER_SECRET, REDIS_URL } from '../config.js';

let io: SocketIOServer;
let workerSocket: any = null;
let workerConnected = false;
let lastQrCode: string | null = null;

// Per-workspace QR cache with timestamp.
//
// Multi-instance: a QR is produced on whichever backend the worker happened to POST /event to,
// but the frontend may poll /status on a DIFFERENT backend.
//
// Source-of-truth rule (avoids Map/Redis divergence, per scaling review):
//   • REDIS_URL set    → Redis is the ONLY source. The in-memory Map is NOT used (a per-instance Map
//                        would diverge across backends). A transient Redis error returns "no QR" rather
//                        than a stale local value; node-redis auto-reconnects in the background.
//   • REDIS_URL empty  → single-instance: the in-memory Map is the source (unchanged legacy behaviour).
const QR_TTL_MS = 40_000; // Baileys regenerates every ~20s; 40s gives 2x safety margin
const workspaceQRs = new Map<string, { qr: string; updatedAt: number }>();

// Lazily-created Redis client dedicated to the QR cache (separate from the socket.io adapter clients).
// node-redis v4 auto-reconnects; reconnectStrategy caps the backoff so a Redis restart recovers without
// hammering. Created once; never nulled (so the client keeps trying to reconnect rather than giving up).
let qrRedis: any = null;
let qrRedisConnecting: Promise<any> | null = null;
async function getQrRedis(): Promise<any | null> {
  if (!REDIS_URL) return null;
  if (qrRedis) return qrRedis;
  if (qrRedisConnecting) return qrRedisConnecting;
  qrRedisConnecting = (async () => {
    try {
      const { createClient } = await import('redis');
      const client = createClient({
        url: REDIS_URL,
        socket: {
          // cap reconnect backoff at 3s; keep retrying indefinitely
          reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
        },
      });
      client.on('error', (e: any) => console.error('[QR] redis error:', e.message));
      client.on('ready', () => console.log('[QR] redis ready'));
      await client.connect();
      qrRedis = client;
      console.log('[QR] Redis-backed QR cache active (shared across backend instances)');
      return client;
    } catch (e: any) {
      console.error('[QR] redis connect failed:', e.message);
      return null; // this call returns null; a later call retries the connect
    } finally {
      qrRedisConnecting = null;
    }
  })();
  return qrRedisConnecting;
}
const qrKey = (wsId: string) => `wa:qr:${wsId}`;

export function getIO() { return io; }
export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }

export async function getWorkspaceQR(wsId: string): Promise<string | null> {
  if (REDIS_URL) {
    try {
      const r = await getQrRedis();
      if (r) {
        const raw = await r.get(qrKey(wsId));
        if (!raw) return null;
        return JSON.parse(raw)?.qr || null;
      }
    } catch (e: any) { console.error('[QR] get failed:', e.message); }
    return null; // Redis mode: no stale Map fallback (avoids divergence)
  }
  const entry = workspaceQRs.get(wsId);
  return entry?.qr || null;
}

export async function setWorkspaceQR(wsId: string, qr: string | null): Promise<void> {
  if (REDIS_URL) {
    try {
      const r = await getQrRedis();
      if (r) {
        if (qr) await r.set(qrKey(wsId), JSON.stringify({ qr, updatedAt: Date.now() }), { PX: QR_TTL_MS });
        else await r.del(qrKey(wsId));
      }
    } catch (e: any) { console.error('[QR] set failed:', e.message); }
    return; // Redis mode: do NOT also write the Map
  }
  if (qr) workspaceQRs.set(wsId, { qr, updatedAt: Date.now() });
  else workspaceQRs.delete(wsId);
}

// Helper for /status route: get raw cached QR with age, even if expired
export async function getWorkspaceQRWithAge(wsId: string): Promise<{ qr: string | null; ageMs: number }> {
  if (REDIS_URL) {
    try {
      const r = await getQrRedis();
      if (r) {
        const raw = await r.get(qrKey(wsId));
        if (!raw) return { qr: null, ageMs: 0 };
        const entry = JSON.parse(raw);
        return { qr: entry.qr, ageMs: Date.now() - entry.updatedAt };
      }
    } catch (e: any) { console.error('[QR] getWithAge failed:', e.message); }
    return { qr: null, ageMs: 0 };
  }
  const entry = workspaceQRs.get(wsId);
  if (!entry) return { qr: null, ageMs: 0 };
  return { qr: entry.qr, ageMs: Date.now() - entry.updatedAt };
}

export function setupSocket(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Prefer websocket; allow polling as fallback only
    transports: ['websocket', 'polling'],
    // Faster pings keep the connection healthy through proxies
    pingInterval: 20000,
    pingTimeout: 25000,
    // Allow long-lived connections
    maxHttpBufferSize: 1e7,
  });

  // Multi-instance fan-out: when REDIS_URL is set, route socket.io events through Redis so a client
  // connected to one backend receives events emitted by any backend. Flag off = single-instance (no-op).
  // Fail-safe: if Redis is unreachable, log and keep running single-instance.
  if (REDIS_URL) {
    (async () => {
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
      } catch (e: any) {
        console.error('[Socket] Redis adapter failed; continuing single-instance:', e.message);
      }
    })();
  }

  io.on('connection', (socket) => {
    // Auto-register worker
    if (socket.handshake.auth?.secret === WORKER_SECRET) {
      workerSocket = socket;
      workerConnected = false;
      console.log('[Hub] Worker auto-registered via auth');
    }

    socket.on('worker:register', ({ secret }) => {
      if (secret !== WORKER_SECRET) { socket.disconnect(); return; }
      workerSocket = socket;
      console.log('[Hub] Worker registered');
    });

    socket.on('connection:status', (payload: any) => {
      workerConnected = payload.connected;
      if (payload.connected) lastQrCode = null;
      else if (payload.qrCode) lastQrCode = payload.qrCode;
      io.emit('connection:status', payload);
    });

    socket.on('request:status', () => {
      socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });
    });

    // Join workspace room via JWT (still useful for non-QR events: file inbox, connection status)
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    let workspaceId: string | null = null;
    if (token) {
      try {
        const decoded: any = jwt.verify(token as string, JWT_SECRET);
        if (decoded.workspaceId) {
          workspaceId = decoded.workspaceId;
          socket.join(decoded.workspaceId);
          console.log('[Socket] Joined room:', decoded.workspaceId.slice(0, 8));
          // QR is delivered via polling now — no longer pushed via socket on join
        }
      } catch {}
    }

    socket.on('new_whatsapp_file', (file: any) => {
      if (file.workspaceId) io.to(file.workspaceId).emit('new_whatsapp_file', file);
      else io.emit('new_whatsapp_file', file);
    });

    socket.on('upload:queued', (d: any) => io.emit('upload:queued', d));
    socket.on('upload:start', (d: any) => io.emit('upload:start', d));
    socket.on('upload:done', (d: any) => io.emit('upload:done', d));
    socket.on('upload:fail', (d: any) => io.emit('upload:fail', d));

    socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });

    socket.on('disconnect', () => {
      if (socket === workerSocket) {
        workerSocket = null;
        workerConnected = false;
        console.log('[Hub] Worker disconnected');
        io.emit('connection:status', { connected: false });
      }
    });
  });

  return io;
}
