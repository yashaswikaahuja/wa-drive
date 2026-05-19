import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { PORT } from './config.js';
import { pool } from './db.js';
import { authMiddleware } from './middleware/auth.js';
import { setupSocket } from './socket/index.js';
import { loadDriveTokenFromDB } from './modules/drive/service.js';

import authRoutes from './modules/auth/routes.js';
import processRoutes from './api/routes/process.routes.js';
import profilesRoutes from './api/routes/profiles.routes.js';
import mappingsRoutes from './api/routes/mappings.routes.js';
import adaptersRoutes from './api/routes/adapters.routes.js';
import driveRoutes from './modules/drive/routes.js';
import uploadRoutes from './modules/upload/routes.js';
import whatsappRoutes from './modules/whatsapp/routes.js';
import customersRoutes from './modules/customers/routes.js';
import jobsRoutes from './modules/jobs/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';

const app = express();
app.set('trust proxy', 1);
app.use(compression());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json());

// Inject pool into req for legacy route handlers
app.use((req: any, res, next) => { req.pool = pool; next(); });

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/process', authMiddleware, processRoutes);
app.use('/api/worker', uploadRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/worker', whatsappRoutes); // /api/worker/event and /api/worker/update-dp
app.use('/api/customers', customersRoutes);
app.use('/api/profiles', authMiddleware, profilesRoutes);
app.use('/api/mappings', authMiddleware, mappingsRoutes);
app.use('/api/adapters', adaptersRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// GET /api/services
app.get('/api/services', authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query("SELECT id, label, icon, execution_type, requires_extension, requires_review, requires_documents, requires_whatsapp FROM service_types WHERE active = true ORDER BY sort_order");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Groq key for extension
app.get('/api/settings/groq-key', authMiddleware, (_req, res) => {
  res.json({ key: process.env.GROQ_API_KEY || '' });
});

// HTTP server + Socket.IO
const httpServer = createServer(app);
setupSocket(httpServer);

// Load Drive tokens on startup
loadDriveTokenFromDB();

// Crash prevention
process.on('uncaughtException', (err) => { console.error('[FATAL] Uncaught:', err.message); });
process.on('unhandledRejection', (err: any) => { console.error('[FATAL] Unhandled:', err?.message || err); });

httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));

export { app, httpServer };
