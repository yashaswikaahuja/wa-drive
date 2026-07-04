import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { createRequire } from 'module';
import { PORT } from './config.js';
import { pool } from './db.js';

// Architecture doctrine runtime check (see /ARCHITECTURE.md §5).
// Non-blocking, fail-silent. Logs a warning if forbidden deps are installed.
// Deleting this block disables runtime warnings; CI still enforces.
setTimeout(() => {
  try {
    const __req = createRequire(import.meta.url);
    const FORBIDDEN = ['jimp','puppeteer','puppeteer-core','playwright','canvas','pdfkit','pdf-lib','tesseract.js','ffmpeg-static','fluent-ffmpeg','@tensorflow/tfjs-node','onnxruntime-node','node-poppler','pdf2pic','pdf-image','html-pdf','html-pdf-node','gm'];
    const found = FORBIDDEN.filter((n: string) => { try { __req.resolve(n); return true; } catch { return false; } });
    if (found.length) console.error('[ARCHITECTURE] forbidden deps installed:', found.join(', '), '— see /ARCHITECTURE.md §5');
  } catch {}
}, 1000);
import { authMiddleware } from './middleware/auth.js';
import { setupSocket } from './socket/index.js';
import { loadDriveTokenFromDB } from './modules/drive/service.js';
import { startExtractionRecovery } from './services/extraction.js';

import authRoutes from './modules/auth/routes.js';
import processRoutes from './modules/process/routes.js';
import driveRoutes from './modules/drive/routes.js';
import uploadRoutes from './modules/upload/routes.js';
import whatsappRoutes from './modules/whatsapp/routes.js';
import customersRoutes from './modules/customers/routes.js';
import jobsRoutes from './modules/jobs/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import formsRoutes from './modules/forms/routes.js';
import usersRoutes from './modules/users/routes.js';

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
// /api/profiles, /api/mappings, /api/adapters → extension-service (port 3300, routed by nginx)
app.use('/api/jobs', jobsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/users', usersRoutes);

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

// Start the durable-extraction recovery sweeper (re-processes extractions lost to a restart).
// No-ops safely if the extraction_jobs table isn't present yet.
startExtractionRecovery();

// Crash prevention
process.on('uncaughtException', (err) => { console.error('[FATAL] Uncaught:', err.message); });
process.on('unhandledRejection', (err: any) => { console.error('[FATAL] Unhandled:', err?.message || err); });

httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));

export { app, httpServer };
