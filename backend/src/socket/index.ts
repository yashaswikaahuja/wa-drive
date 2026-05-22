import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, WORKER_SECRET } from '../config.js';

let io: SocketIOServer;
let workerSocket: any = null;
let workerConnected = false;
let lastQrCode: string | null = null;

// Per-workspace QR cache (latest QR for each workspace)
const workspaceQRs = new Map<string, string | null>();

export function getIO() { return io; }
export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }
export function getWorkspaceQR(wsId: string): string | null {
  return workspaceQRs.get(wsId) || null;
}
export function setWorkspaceQR(wsId: string, qr: string | null): void {
  if (qr) workspaceQRs.set(wsId, qr);
  else workspaceQRs.delete(wsId);
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

    // Join workspace room via JWT and immediately send cached QR if any
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    let workspaceId: string | null = null;
    if (token) {
      try {
        const decoded: any = jwt.verify(token as string, JWT_SECRET);
        if (decoded.workspaceId) {
          workspaceId = decoded.workspaceId;
          socket.join(decoded.workspaceId);
          console.log('[Socket] Joined room:', decoded.workspaceId.slice(0, 8));
          // Send cached QR immediately to this socket if available
          const cachedQR = workspaceQRs.get(decoded.workspaceId);
          if (cachedQR) {
            socket.emit('qr', { qr: cachedQR, workspaceId: decoded.workspaceId });
            socket.emit('connection:status', { connected: false, qrCode: cachedQR, workspaceId: decoded.workspaceId });
          }
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
