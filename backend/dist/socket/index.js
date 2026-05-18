import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, WORKER_SECRET } from '../config.js';
let io;
let workerSocket = null;
let workerConnected = false;
let lastQrCode = null;
export function getIO() { return io; }
export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }
export function setupSocket(httpServer) {
    io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    io.on('connection', (socket) => {
        // Auto-register worker
        if (socket.handshake.auth?.secret === WORKER_SECRET) {
            workerSocket = socket;
            workerConnected = false;
            console.log('[Hub] Worker auto-registered via auth');
        }
        socket.on('worker:register', ({ secret }) => {
            if (secret !== WORKER_SECRET) {
                socket.disconnect();
                return;
            }
            workerSocket = socket;
            console.log('[Hub] Worker registered');
        });
        socket.on('connection:status', (payload) => {
            workerConnected = payload.connected;
            if (payload.connected)
                lastQrCode = null;
            else if (payload.qrCode)
                lastQrCode = payload.qrCode;
            io.emit('connection:status', payload);
        });
        socket.on('request:status', () => {
            socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });
        });
        // Join workspace room via JWT
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.workspaceId) {
                    socket.join(decoded.workspaceId);
                    console.log('[Socket] Joined room:', decoded.workspaceId.slice(0, 8));
                }
            }
            catch { }
        }
        socket.on('new_whatsapp_file', (file) => {
            if (file.workspaceId)
                io.to(file.workspaceId).emit('new_whatsapp_file', file);
            else
                io.emit('new_whatsapp_file', file);
        });
        socket.on('upload:queued', (d) => io.emit('upload:queued', d));
        socket.on('upload:start', (d) => io.emit('upload:start', d));
        socket.on('upload:done', (d) => io.emit('upload:done', d));
        socket.on('upload:fail', (d) => io.emit('upload:fail', d));
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
//# sourceMappingURL=index.js.map