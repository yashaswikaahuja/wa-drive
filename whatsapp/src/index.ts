import express from 'express';
import fs from 'fs';
import path from 'path';
import { startSession, stopSession, getSession, getAllSessions } from './session';
import { handleMessage } from './handlers';

const PORT = process.env.PORT || 3100;
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';
const app = express();
app.use(express.json({ limit: '50mb' }));

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.headers['x-service-secret'] !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/health', (_, res) => res.json({ status: 'ok', sessions: getAllSessions() }));

app.post('/sessions/start', auth, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  await startSession(workspaceId);
  const session = getSession(workspaceId);
  if (session?.client) {
    session.client.removeAllListeners('message');
    session.client.on('message', (msg: any) => handleMessage(workspaceId, msg));
  }
  res.json({ ok: true });
});

app.post('/sessions/stop', auth, async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  await stopSession(workspaceId);
  res.json({ ok: true });
});

app.get('/sessions/:id/status', auth, (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.json({ status: 'none', connected: false, qr: null, phone: null });
  res.json({ status: session.status, connected: session.status === 'connected', qr: session.qr, phone: session.phone });
});

app.post('/sessions/:id/send', auth, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session?.client) return res.status(400).json({ error: 'Not connected' });
  const { phone, message } = req.body;
  try {
    await session.client.sendMessage(phone.replace(/[^0-9]/g, '') + '@c.us', message);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/sessions', auth, (_, res) => res.json(getAllSessions()));

// Auto-start saved sessions
const sessionsDir = './sessions';
if (fs.existsSync(sessionsDir)) {
  const ids = fs.readdirSync(sessionsDir)
    .filter(d => d.startsWith('session-') && fs.statSync(path.join(sessionsDir, d)).isDirectory())
    .map(d => d.replace('session-', ''));
  ids.forEach((id, i) => setTimeout(async () => {
    await startSession(id);
    const s = getSession(id);
    if (s?.client) s.client.on('message', (msg: any) => handleMessage(id, msg));
  }, 10000 * (i + 1)));
}

app.listen(PORT, () => console.log(`[WhatsApp Service] Running on port ${PORT}`));
