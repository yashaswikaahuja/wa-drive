import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { WA_SERVICE, WA_SECRET, WA_INSTANCES } from '../../config.js';
import { getIO, getWorkspaceQR, setWorkspaceQR, getWorkspaceQRWithAge } from '../../socket/index.js';

const router = Router();

// Shard-aware routing: resolve which whatsapp-service instance owns a workspace.
// Backward-compatible: with no WA_INSTANCES / no shard table, falls back to the single WA_SERVICE.
async function pickInstance(): Promise<string | null> {
  if (!WA_INSTANCES.length) return null;
  const { rows } = await pool.query('SELECT instance, count(*)::int AS n FROM wa_assignments GROUP BY instance');
  const counts = new Map<string, number>(rows.map((r: any) => [r.instance, r.n]));
  let best = WA_INSTANCES[0], bestN = counts.get(best) ?? 0;
  for (const inst of WA_INSTANCES) {
    const n = counts.get(inst) ?? 0;
    if (n < bestN) { best = inst; bestN = n; }
  }
  return best;
}

async function waBase(workspaceId: string): Promise<string> {
  try {
    const { rows } = await pool.query('SELECT instance FROM wa_assignments WHERE workspace_id=$1', [workspaceId]);
    if (rows[0]) return `http://${rows[0].instance}:3100`;
    const inst = await pickInstance();
    if (!inst) return WA_SERVICE;
    await pool.query(
      'INSERT INTO wa_assignments(workspace_id, instance) VALUES($1,$2) ON CONFLICT (workspace_id) DO NOTHING',
      [workspaceId, inst]
    );
    const r2 = await pool.query('SELECT instance FROM wa_assignments WHERE workspace_id=$1', [workspaceId]);
    return r2.rows[0] ? `http://${r2.rows[0].instance}:3100` : WA_SERVICE;
  } catch {
    return WA_SERVICE; // shard table absent / DB hiccup → single-instance behaviour (unchanged)
  }
}

router.get('/status', authMiddleware, async (req: any, res) => {
  const wsId = req.user.workspaceId;
  const base = await waBase(wsId);
  // Snapshot cache state BEFORE worker call (we need ageMs for staleness check)
  const before = getWorkspaceQRWithAge(wsId);
  try {
    const r = await fetch(base + '/sessions/' + wsId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    // Update cache: only refresh timestamp when worker returns a DIFFERENT QR
    if (data?.qr) {
      if (data.qr !== before.qr) {
        // New QR! Refresh cache (resets timestamp).
        setWorkspaceQR(wsId, data.qr);
      }
      // If same QR, leave cache untouched — its age keeps growing so we can detect staleness
    }
    if (data?.connected) setWorkspaceQR(wsId, null);
    // Self-heal: if worker is stuck on the same QR for >45s (Baileys should regenerate every ~20s),
    // force a restart so the user gets a fresh scannable QR
    if (
      !data.connected &&
      data.status === 'qr_pending' &&
      before.qr &&
      data.qr === before.qr &&
      before.ageMs > 45_000
    ) {
      console.log(`[Hub] QR stale (${Math.round(before.ageMs/1000)}s) for ws=${wsId.slice(0, 8)} — force restart`);
      fetch(base + '/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
        body: JSON.stringify({ workspaceId: wsId, force: true }),
      }).catch(() => {});
    }
    res.json({
      connected: !!data.connected,
      status: data.status || 'unknown',
      phone: data.phone || null,
      qr: data.qr || before.qr || null,
    });
  } catch {
    res.json({ connected: false, status: 'service_down', qr: before.qr || null });
  }
});

router.get('/qr', authMiddleware, async (req: any, res) => {
  // Try cache first (instant), then fallback to service
  const cached = getWorkspaceQR(req.user.workspaceId);
  if (cached) return res.json({ qrCode: cached, qr: cached });
  try {
    const base = await waBase(req.user.workspaceId);
    const r = await fetch(base + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    if (data?.qr) setWorkspaceQR(req.user.workspaceId, data.qr);
    res.json({ qrCode: data.qr || null, qr: data.qr || null });
  } catch { res.json({ qrCode: null, qr: null }); }
});

router.post('/connect', authMiddleware, async (req: any, res) => {
  try {
    const base = await waBase(req.user.workspaceId);
    await fetch(base + '/sessions/start', {
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
    const base = await waBase(req.user.workspaceId);
    const r = await fetch(base + '/sessions/' + req.user.workspaceId + '/send', {
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
    const base = await waBase(req.user.workspaceId);
    await fetch(base + '/sessions/' + req.user.workspaceId + '/link-lid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
      body: JSON.stringify({ lid, phone }),
    });
    await pool.query('UPDATE drive_files SET customer_id = $1 WHERE workspace_id = $2 AND customer_id = $3', [phone, req.user.workspaceId, lid]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Worker event relay (WhatsApp service → hub).
// QR is cached only — frontend polls /status to retrieve it (no socket.io).
// Other events (connected/disconnected) still emit via socket for UI quickness.
router.post('/event', (req, res) => {
  const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { workspaceId, event, qr, phone } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const io = getIO();
  if (event === 'qr') {
    setWorkspaceQR(workspaceId, qr);
    console.log(`[Hub] QR cached for workspace ${workspaceId.slice(0, 8)} (qr_len=${qr?.length || 0})`);
  } else if (event === 'connected') {
    setWorkspaceQR(workspaceId, null);
    io.to(workspaceId).emit('connection:status', { connected: true, phone, workspaceId });
    console.log(`[Hub] Connected: ${phone} (${workspaceId.slice(0, 8)})`);
  } else if (event === 'disconnected') {
    io.to(workspaceId).emit('connection:status', { connected: false, workspaceId });
    console.log(`[Hub] Disconnected (${workspaceId.slice(0, 8)})`);
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
