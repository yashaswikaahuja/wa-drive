import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { whatsappService } from './services/whatsapp.service.js';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';
import driveRoutes from './api/routes/drive.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, '../uploads');
const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

// Middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_ROOT));

// Routes
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/drive', driveRoutes);

// Set Google Drive token from frontend
app.post('/api/drive/token', (req, res) => {
  const { accessToken } = req.body as { accessToken: string | null };
  console.log(`[Drive] Token received: ${accessToken ? 'SET' : 'CLEARED'}`);
  whatsappService.setDriveToken(accessToken ?? null);
  res.json({ ok: true });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = Number(process.env['PORT'] ?? 3000);

const httpServer = app.listen(PORT, async () => {
  console.log(`\n[Server] Running on http://localhost:${PORT}`);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  whatsappService.setSocketIO(io);

  try {
    console.log('[WhatsApp] Initializing WhatsApp service...');
    await whatsappService.init();
    console.log('[WhatsApp] Service initialized successfully');
  } catch (error) {
    console.error('[WhatsApp] Failed to initialize (continuing without WhatsApp):', error);
  }
});

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await whatsappService.disconnect();
  httpServer.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
