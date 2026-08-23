import express, { type Express } from 'express';
import compression from 'compression';
import { createServer } from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PORT, OWNER_PORT, OWNER_BIND } from '@cybercontrol/backend-core';
import { createPool, initializeDatabase, pool, setPool } from '@cybercontrol/backend-core';

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
import { authMiddleware } from '@cybercontrol/backend-core';
import { setupSocket } from '@cybercontrol/backend-realtime';
import { loadDriveTokenFromDB } from '@cybercontrol/backend-drive';
import { startExtractionRecovery } from '@cybercontrol/backend-documents';
import { scheduleHealthMonitor, scheduleWaFailover } from '@cybercontrol/backend-operations';

import authRoutes from '@cybercontrol/backend-auth';
import processRoutes from '@cybercontrol/backend-process';
import driveRoutes from '@cybercontrol/backend-drive';
import uploadRoutes from '@cybercontrol/backend-upload';
import whatsappRoutes from '@cybercontrol/backend-whatsapp';
import customersRoutes from '@cybercontrol/backend-customers';
import jobsRoutes from '@cybercontrol/backend-jobs';
import dashboardRoutes from '@cybercontrol/backend-dashboard';
import formsRoutes from '@cybercontrol/backend-forms';
import usersRoutes from '@cybercontrol/backend-users';
import ownerRoutes from '@cybercontrol/backend-owner';

const app: Express = express();
setPool(createPool());
void initializeDatabase().catch(err => {
  console.error('[DB FATAL]', err.message);
  process.exit(1);
});
app.set('trust proxy', 1);
app.use(compression());

// CORS — credentialed allowlist for first-party web origins (so the HttpOnly refresh cookie can be
// sent/received on app.→api. XHR); wildcard fallback (no credentials) for everything else (extension
// chrome-extension:// origin uses Bearer tokens, not cookies, and server-to-server has no Origin).
// NOTE: '*' together with Allow-Credentials is illegal — so credentials are only enabled for allowlisted origins.
const ALLOWED_ORIGINS = new Set([
  'https://app.cybercontrol.fun',
  'https://cybercontrol.fun',
  'http://localhost:5173',
  'http://localhost:3000',
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

app.use(express.json());
// CLI device authorize form posts as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

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

// LLM key for extension (OpenRouter for field mapping / form fill)
// Uses workspace-level override if set, otherwise falls back to env vars
app.get('/api/settings/groq-key', authMiddleware, async (req: any, res) => {
  let wsSettings: any = {};
  try {
    const { rows } = await pool.query('SELECT settings FROM workspaces WHERE id = $1', [req.user.workspaceId]);
    wsSettings = rows[0]?.settings?.ai || {};
  } catch {}
  const orKey = wsSettings.openrouterKey || process.env.OPENROUTER_API_KEY || '';
  const groqKey = wsSettings.groqKey || process.env.GROQ_API_KEY || '';
  const key = orKey || groqKey;
  res.json({
    key,
    provider: orKey ? 'openrouter' : 'groq',
    baseUrl: orKey ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions',
    model: wsSettings.textModel || (orKey ? 'meta-llama/llama-3.3-70b-instruct' : 'llama-3.3-70b-versatile'),
  });
});

// HTTP server + Socket.IO
const httpServer = createServer(app);
setupSocket(httpServer);

// Load Drive tokens on startup
loadDriveTokenFromDB();

// Start the durable-extraction recovery sweeper (re-processes extractions lost to a restart).
// No-ops safely if the extraction_jobs table isn't present yet.
startExtractionRecovery();

// Daily café-health monitor → owner WhatsApp digest on at-risk drops (leader-guarded across instances).
scheduleHealthMonitor();

// Proactive WA failover — every 60s reassigns workspaces from dead instances to healthy ones.
scheduleWaFailover();

// Crash prevention
process.on('uncaughtException', (err) => { console.error('[FATAL] Uncaught:', err.message); });
process.on('unhandledRejection', (err: any) => { console.error('[FATAL] Unhandled:', err?.message || err); });

httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));

// ── Owner control panel API (tailnet-only) ──────────────────────────────────────
// A SEPARATE listener the public LB does not proxy, bound to OWNER_BIND (the VM's tailscale IP in
// prod). Owner routes are never mounted on the public `app` above, so /owner is absent from the
// internet-facing surface. Disabled unless OWNER_PORT is set. Gated again at the route layer by
// tailnetOnly + requireOwner (defense in depth).
if (OWNER_PORT) {
  // Resolve the bind address: 'auto'/empty → this VM's tailscale IP (100.64.0.0/10). This lets the
  // SAME env deploy to every backend VM (each binds its own tailnet IP). Falls back to loopback.
  const resolveOwnerBind = (): string => {
    const want = (OWNER_BIND || '').trim();
    if (want && want.toLowerCase() !== 'auto') return want;
    const ifaces = os.networkInterfaces();
    const names = Object.keys(ifaces).sort((a, b) =>
      Number(b.startsWith('tailscale')) - Number(a.startsWith('tailscale')));
    for (const n of names) {
      for (const a of ifaces[n] || []) {
        const m = a.family === 'IPv4' && !a.internal && a.address.match(/^100\.(\d+)\./);
        if (m && Number(m[1]) >= 64 && Number(m[1]) <= 127) return a.address;
      }
    }
    console.warn('[Owner] no tailscale interface found — binding to 127.0.0.1 (local only)');
    return '127.0.0.1';
  };
  const bind = resolveOwnerBind();
  const ownerApp = express();
  ownerApp.set('trust proxy', false); // no proxy in front — remoteAddress is the real tailnet peer
  ownerApp.use(express.json());
  // CORS: the panel is a separate tailnet origin. No cookies are used (auth is the x-owner-key
  // header), so echoing the origin is safe — the key + tailnet remain the gates.
  ownerApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-owner-key');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  ownerApp.use((req: any, _res, next) => { req.pool = pool; next(); });
  ownerApp.get('/health', (_req, res) => res.json({ status: 'ok' }));
  ownerApp.use('/owner', ownerRoutes);
  // Serve the built owner panel (baked into the image) so the dashboard opens directly at the tailnet
  // URL — no local dev server. Static shell is not sensitive (data still needs the key); SPA fallback
  // to index.html for client routing, but never for /owner or /health.
  const panelDir = process.env.OWNER_PANEL_DIR || path.join(process.cwd(), 'owner-panel');
  if (fs.existsSync(path.join(panelDir, 'index.html'))) {
    ownerApp.use(express.static(panelDir));
    ownerApp.get('*', (req, res, next) => {
      if (req.path.startsWith('/owner') || req.path === '/health') return next();
      res.sendFile(path.join(panelDir, 'index.html'));
    });
    console.log('[Owner] serving panel from', panelDir);
  }
  const ownerServer = createServer(ownerApp);
  ownerServer.on('error', (e: any) => console.error('[Owner] listen error:', e?.message || e));
  ownerServer.listen(OWNER_PORT, bind, () =>
    console.log(`[Owner] tailnet-only API on ${bind}:${OWNER_PORT}`));
}

export { app, httpServer };
