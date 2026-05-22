import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const PORT = process.env.PORT || 3000;
const WHATSAPP_URL = process.env.WHATSAPP_URL || 'http://localhost:3100';
const STORAGE_URL = process.env.STORAGE_URL || 'http://localhost:3200';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cybercontrol_app:cybercontrol123@localhost:5432/cybercontrol';

const pool = new Pool({ connectionString: DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper to call internal services
async function svc(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { 'x-service-secret': SERVICE_SECRET, 'Content-Type': 'application/json', ...opts?.headers } });
  return res.json();
}

// Health
app.get('/health', (_, res) => res.json({ status: 'ok', gateway: true }));

// ─── WhatsApp Routes ───
app.post('/api/whatsapp/start', async (req, res) => {
  const { workspaceId } = req.body;
  const data = await svc(`${WHATSAPP_URL}/sessions/start`, { method: 'POST', body: JSON.stringify({ workspaceId }) });
  res.json(data);
});

app.post('/api/whatsapp/stop', async (req, res) => {
  const { workspaceId } = req.body;
  const data = await svc(`${WHATSAPP_URL}/sessions/stop`, { method: 'POST', body: JSON.stringify({ workspaceId }) });
  res.json(data);
});

app.get('/api/whatsapp/status/:workspaceId', async (req, res) => {
  const data = await svc(`${WHATSAPP_URL}/sessions/${req.params.workspaceId}/status`);
  res.json(data);
});

// ─── Drive Routes ───
app.get('/api/drive/status/:workspaceId', async (req, res) => {
  const data = await svc(`${STORAGE_URL}/status/${req.params.workspaceId}`);
  res.json(data);
});

app.get('/api/drive/auth-url/:workspaceId', async (req, res) => {
  const data = await svc(`${STORAGE_URL}/auth-url/${req.params.workspaceId}`);
  res.json(data);
});

app.get('/api/drive/callback', async (req, res) => {
  const { code, state } = req.query;
  const resp = await fetch(`${STORAGE_URL}/callback?code=${code}&state=${state}`);
  const html = await resp.text();
  res.send(html);
});

// ─── Files (inbox) ───
app.get('/api/files/:workspaceId', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM files WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.workspaceId]);
  res.json(rows);
});

// ─── Webhook from WhatsApp Service ───
app.post('/webhook/file', async (req, res) => {
  if (req.headers['x-service-secret'] !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { workspaceId, senderPhone, senderName, senderDp, fileName, mimeType, fileBase64 } = req.body;

  try {
    // Upload to Drive
    const driveResult = await svc(`${STORAGE_URL}/upload`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, fileBase64, fileName, mimeType }),
    });

    // Save to DB
    await pool.query(
      'INSERT INTO files(workspace_id, drive_file_id, file_name, mime_type, sender_phone, sender_name, sender_dp, thumbnail_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [workspaceId, driveResult.driveFileId, fileName, mimeType, senderPhone, senderName, senderDp, driveResult.thumbnailUrl]
    );

    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Gateway] Webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`[Gateway] Running on port ${PORT}`));
