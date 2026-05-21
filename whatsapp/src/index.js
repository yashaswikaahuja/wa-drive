import express from 'express';
import { startSession, stopSession, getSession, getAllSessions, sessionEvents } from './session.js';
import { handleMessage } from './handlers.js';
import fs from 'fs';
import path from 'path';

const PORT = process.env.PORT || 3100;
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Auth middleware for internal calls
function auth(req, res, next) {
  if (req.headers['x-service-secret'] !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Health
app.get('/health', (_, res) => {
  res.json({ status: 'ok', sessions: getAllSessions() });
});

// Start session (generates QR)
app.post('/sessions/start', auth, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  await startSession(workspaceId);
  // Set up message handler for this client
  const session = getSession(workspaceId);
  if (session?.client) {
    session.client.removeAllListeners('message');
    session.client.on('message', (msg) => handleMessage(workspaceId, msg));
  }
  res.json({ ok: true });
});

// Stop session
app.post('/sessions/stop', auth, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  await stopSession(workspaceId);
  res.json({ ok: true });
});

// Get session status
app.get('/sessions/:id/status', auth, (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.json({ status: 'none', connected: false, qr: null, phone: null });
  res.json({
    status: session.status,
    connected: session.status === 'connected',
    qr: session.qr,
    phone: session.phone,
  });
});

// Send message
app.post('/sessions/:id/send', auth, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session?.client) return res.status(400).json({ error: 'Not connected' });
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  try {
    const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
    await session.client.sendMessage(chatId, message);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List all sessions
app.get('/sessions', auth, (_, res) => {
  res.json(getAllSessions());
});

// Auto-start saved sessions on boot
function autoStart() {
  const sessionsDir = './sessions';
  if (!fs.existsSync(sessionsDir)) return;
  const dirs = fs.readdirSync(sessionsDir).filter(d => {
    const full = path.join(sessionsDir, d);
    return fs.statSync(full).isDirectory() && d.startsWith('session-');
  });
  const workspaceIds = dirs.map(d => d.replace('session-', ''));
  console.log(`[WA] Auto-starting ${workspaceIds.length} session(s)...`);
  workspaceIds.forEach((id, i) => {
    setTimeout(async () => {
      await startSession(id);
      const session = getSession(id);
      if (session?.client) {
        session.client.on('message', (msg) => handleMessage(id, msg));
      }
    }, 10000 * (i + 1)); // Stagger 10s apart
  });
}

app.listen(PORT, () => {
  console.log(`[WhatsApp Service] Running on port ${PORT}`);
  autoStart();
});
