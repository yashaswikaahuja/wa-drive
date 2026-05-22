import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { WA_SERVICE, WA_SECRET } from '../../config.js';
import { getIO, getWorkspaceQR, setWorkspaceQR } from '../../socket/index.js';

const router = Router();

router.get('/status', authMiddleware, async (req: any, res) => {
  try {
    const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    // If service has fresh QR, cache it
    if (data?.qr) setWorkspaceQR(req.user.workspaceId, data.qr);
    if (data?.connected) setWorkspaceQR(req.user.workspaceId, null);
    res.json(data);
  } catch { res.json({ connected: false, status: 'service_down' }); }
});

router.get('/qr', authMiddleware, async (req: any, res) => {
  // Try cache first (instant), then fallback to service
  const cached = getWorkspaceQR(req.user.workspaceId);
  if (cached) return res.json({ qrCode: cached, qr: cached });
  try {
    const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    if (data?.qr) setWorkspaceQR(req.user.workspaceId, data.qr);
    res.json({ qrCode: data.qr || null, qr: data.qr || null });
  } catch { res.json({ qrCode: null, qr: null }); }
});

router.post('/connect', authMiddleware, async (req: any, res) => {
  try {
    await fetch(WA_SERVICE + '/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
      body: JSON.stringify({ workspaceId: req.user.workspaceId }),
    });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/send', authMiddleware, async (req: any, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
      body: JSON.stringify({ phone, message }),
    });
    res.json(await r.json());
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/link-lid', authMiddleware, async (req: any, res) => {
  try {
    const { lid, phone } = req.body;
    if (!lid || !phone) return res.status(400).json({ error: 'lid and phone required' });
    await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/link-lid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
      body: JSON.stringify({ lid, phone }),
    });
    await pool.query('UPDATE drive_files SET customer_id = $1 WHERE workspace_id = $2 AND customer_id = $3', [phone, req.user.workspaceId, lid]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Worker event relay (WhatsApp service → frontend socket.io)
router.post('/event', (req, res) => {
  const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { workspaceId, event, qr, phone } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const io = getIO();
  if (event === 'qr') {
    setWorkspaceQR(workspaceId, qr);
    // Emit to workspace room only (NOT global) and include payload for frontend
    io.to(workspaceId).emit('qr', { qr, workspaceId });
    io.to(workspaceId).emit('connection:status', { connected: false, qrCode: qr, workspaceId });
    console.log(`[Hub] QR pushed to workspace ${workspaceId.slice(0, 8)}`);
  } else if (event === 'connected') {
    setWorkspaceQR(workspaceId, null);
    io.to(workspaceId).emit('connection:status', { connected: true, phone, workspaceId });
    console.log(`[Hub] Connected: ${phone} (${workspaceId.slice(0, 8)})`);
  } else if (event === 'disconnected') {
    io.to(workspaceId).emit('connection:status', { connected: false, workspaceId });
  }
  res.json({ ok: true });
});

// Worker update-dp
router.post('/update-dp', async (req, res) => {
  const secret = req.headers['x-worker-secret'] as string;
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { phone, dpUrl, workspaceId } = req.body;
  if (!phone || !dpUrl || !workspaceId) return res.status(400).json({ error: 'missing fields' });
  try {
    await pool.query('UPDATE drive_files SET profile_pic_url = $1 WHERE workspace_id = $2 AND customer_id = $3', [dpUrl, workspaceId, phone]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
