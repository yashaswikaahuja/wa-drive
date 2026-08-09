import 'dotenv/config';
import express from 'express';
import http from 'http';
import { createRequire } from 'module';
import { attachWebSocket } from './ws-server.js';
import { createHandlers } from './ws-handlers.js';

// Architecture doctrine runtime check (see /ARCHITECTURE.md §5).
// Non-blocking, fail-silent. Logs a warning if forbidden deps are installed.
// Deleting this block disables runtime warnings; CI still enforces.
setTimeout(() => {
  try {
    const __req = createRequire(import.meta.url);
    const FORBIDDEN = ['jimp','puppeteer','puppeteer-core','playwright','canvas','pdfkit','pdf-lib','tesseract.js','ffmpeg-static','fluent-ffmpeg','@tensorflow/tfjs-node','onnxruntime-node','node-poppler','pdf2pic','pdf-image','html-pdf','html-pdf-node','gm','sharp'];
    const found = FORBIDDEN.filter(n => { try { __req.resolve(n); return true; } catch { return false; } });
    if (found.length) console.error('[ARCHITECTURE] forbidden deps installed:', found.join(', '), '— see /ARCHITECTURE.md §5');
  } catch {}
}, 1000);

import profilesRouter from './routes/profiles.js';
import mappingsRouter from './routes/mappings.js';
import adaptersRouter from './routes/adapters.js';
import sessionsRouter from './routes/sessions.js';
import correctionsRouter from './routes/corrections.js';
import trainingRouter from './routes/training.js';
import agentRouter from './routes/agent.js';
import knowledgeRouter from './routes/knowledge.js';
import resolveRouter from './routes/resolve.js';
import validateRouter from './routes/validate.js';
import versionsRouter from './routes/versions.js';
import syncRouter from './routes/sync.js';
import fillRouter from './routes/fill.js';
import { ensureSchema } from './store.js';
import { ensureKnowledgeSchema } from './knowledge-store.js';

const PORT = Number(process.env.PORT) || 3300;
const app = express();

// CORS — same as hub (extension hits this via api.cybercontrol.fun → nginx → here)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '5mb' }));

// Health endpoint (unauthenticated, for nginx + smoke tests)
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'extension-service',
  version: '1.0.0',
  commit: process.env.BUILD_SHA || 'development',
}));

// Routes are mounted at the SAME paths the hub used to expose them at,
// so nginx can transparently route /api/profiles, /api/mappings, /api/adapters here.
app.use('/api/profiles', profilesRouter);
app.use('/api/mappings', mappingsRouter);
app.use('/api/adapters', adaptersRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/corrections', correctionsRouter);
app.use('/api/training', trainingRouter);
app.use('/api/agent', agentRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/resolve', resolveRouter);
app.use('/api/validate', validateRouter);
app.use('/api/versions', versionsRouter);
app.use('/api/sync', syncRouter);
app.use('/api', fillRouter);

// 404 fallthrough
app.use((req, res) => res.status(404).json({ error: 'not found', path: req.path }));

// Error handler (last)
app.use((err, _req, res, _next) => {
  console.error('[extension-service]', err);
  res.status(500).json({ error: err.message });
});

// Crash safety
process.on('uncaughtException', (err) => console.error('[FATAL] Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('[FATAL] Unhandled:', err?.message || err));

// ── HTTP + WebSocket server ──────────────────────────────────────────────
const server = http.createServer(app);
const wsHandlers = createHandlers();
const wsServer = attachWebSocket(server, {
  onConnection: wsHandlers.onConnection,
  onMessage: wsHandlers.onMessage,
  onClose: wsHandlers.onClose,
});

export { server, wsServer };

server.listen(PORT, () => {
  const jwtPrefix = (process.env.JWT_SECRET || '').slice(0, 4);
  console.log(`[extension-service] listening on :${PORT} (HTTP + WSS)`);
  console.log(`[extension-service] JWT_SECRET starts with: ${jwtPrefix}***`);
  console.log(`[extension-service] DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
  console.log(`[extension-service] DATA_DIR: ${process.env.DATA_DIR || 'default ./data'}`);
  ensureSchema().catch((e) => console.error('[extension-service] ensureSchema on boot failed:', e.message));
  ensureKnowledgeSchema().catch((e) => console.error('[extension-service] knowledge schema on boot failed:', e.message));
});
