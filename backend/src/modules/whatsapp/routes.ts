import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { WA_SERVICE, WA_SECRET, WA_INSTANCES, WA_DEAD_AFTER_MS } from '../../config.js';
import { getIO, getWorkspaceQR, setWorkspaceQR, getWorkspaceQRWithAge } from '../../socket/index.js';

const router = Router();

// Shard-aware routing with a STICKY ruleset:
//   • A workspace stays on its assigned instance as long as that instance is ALIVE on the tailnet
//     (heartbeating). In normal operation it never moves → a logged-in session is stable (≥24h).
//   • Failover to another instance happens ONLY when the assigned instance is detected DEAD
//     (stopped heartbeating = disconnected from tailnet). With DB-backed auth the new instance
//     restores the session from the DB, so there is NO QR re-scan.
// Backward-compatible: with no WA_INSTANCES / no shard tables, falls back to the single WA_SERVICE.

// Instances that have heartbeat within the dead-after window.
async function healthyInstances(): Promise<string[]> {
  if (!WA_INSTANCES.length) return [];
  try {
    const { rows } = await pool.query(
      `SELECT instance FROM wa_instances WHERE last_seen > now() - ($1::double precision * interval '1 millisecond')`,
      [WA_DEAD_AFTER_MS]
    );
    const live = new Set<string>(rows.map((r: any) => r.instance));
    const healthy = WA_INSTANCES.filter(i => live.has(i));
    if (healthy.length) return healthy;
    // Bootstrap: before ANY instance has heartbeat (fresh deploy), treat all configured instances as
    // healthy so routing works; once heartbeats exist, an empty result means genuinely all-down.
    const seen = await pool.query('SELECT 1 FROM wa_instances LIMIT 1');
    return seen.rows.length ? [] : WA_INSTANCES.slice();
  } catch {
    return WA_INSTANCES.slice(); // health table absent / DB hiccup → don't break routing
  }
}

// Least-loaded among the healthy instances.
async function pickInstance(): Promise<string | null> {
  const healthy = await healthyInstances();
  if (!healthy.length) return null;
  const { rows } = await pool.query('SELECT instance, count(*)::int AS n FROM wa_assignments GROUP BY instance');
  const counts = new Map<string, number>(rows.map((r: any) => [r.instance, r.n]));
  let best = healthy[0], bestN = counts.get(best) ?? Infinity;
  for (const inst of healthy) {
    const n = counts.get(inst) ?? 0;
    if (n < bestN) { best = inst; bestN = n; }
  }
  return best;
}

async function waBase(workspaceId: string): Promise<string> {
  try {
    const { rows } = await pool.query('SELECT instance, assigned_at FROM wa_assignments WHERE workspace_id=$1', [workspaceId]);
    if (rows[0]) {
      const cur = rows[0].instance as string;
      const healthy = await healthyInstances();
      // STICKY: assigned instance still alive → keep it (the normal path; session never moves).
      if (!WA_INSTANCES.length || healthy.includes(cur)) return `http://${cur}:3100`;
      // FAILOVER (rare): assigned instance is dead (off tailnet). Move to a healthy instance.
      // DB-backed auth → the new instance restores the session, no QR re-scan.
      const target = await pickInstance();
      if (target && target !== cur) {
        await pool.query('UPDATE wa_assignments SET instance=$2, assigned_at=now() WHERE workspace_id=$1', [workspaceId, target]);
        // proactively start the session on the new owner so it reconnects without waiting for a request
        fetch(`http://${target}:3100/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
          body: JSON.stringify({ workspaceId }),
        }).catch(() => {});
        console.log(`[Hub] WA failover ws=${workspaceId.slice(0, 8)}: ${cur} (dead) → ${target}`);
        return `http://${target}:3100`;
      }
      return `http://${cur}:3100`; // no healthy alternative → keep pointing at current (best effort)
    }
    // No assignment yet → pin to least-loaded healthy instance.
    const inst = await pickInstance();
    if (!inst) return WA_SERVICE;
    await pool.query(
      'INSERT INTO wa_assignments(workspace_id, instance) VALUES($1,$2) ON CONFLICT (workspace_id) DO NOTHING',
      [workspaceId, inst]
    );
    const r2 = await pool.query('SELECT instance FROM wa_assignments WHERE workspace_id=$1', [workspaceId]);
    return r2.rows[0] ? `http://${r2.rows[0].instance}:3100` : WA_SERVICE;
  } catch {
    return WA_SERVICE; // shard tables absent / DB hiccup → single-instance behaviour (unchanged)
  }
}

router.get('/status', authMiddleware, async (req: any, res) => {
  const wsId = req.user.workspaceId;
  const base = await waBase(wsId);
  // Snapshot cache state BEFORE worker call (we need ageMs for staleness check)
  const before = await getWorkspaceQRWithAge(wsId);
  try {
    const r = await fetch(base + '/sessions/' + wsId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    // Update cache: only refresh timestamp when worker returns a DIFFERENT QR
    if (data?.qr) {
      if (data.qr !== before.qr) {
        // New QR! Refresh cache (resets timestamp).
        await setWorkspaceQR(wsId, data.qr);
      }
      // If same QR, leave cache untouched — its age keeps growing so we can detect staleness
    }
    if (data?.connected) await setWorkspaceQR(wsId, null);
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
  const cached = await getWorkspaceQR(req.user.workspaceId);
  if (cached) return res.json({ qrCode: cached, qr: cached });
  try {
    const base = await waBase(req.user.workspaceId);
    const r = await fetch(base + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
    const data: any = await r.json();
    if (data?.qr) await setWorkspaceQR(req.user.workspaceId, data.qr);
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

// Instance heartbeat (whatsapp-service → hub). Drives the sticky-shard health check:
// an instance that stops heartbeating (off the tailnet) is treated as dead → its workspaces fail over.
router.post('/instance-heartbeat', async (req, res) => {
  const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { instance } = req.body || {};
  if (!instance) return res.status(400).json({ error: 'instance required' });
  try {
    await pool.query(
      `INSERT INTO wa_instances(instance, last_seen, status) VALUES($1, now(), 'up')
       ON CONFLICT (instance) DO UPDATE SET last_seen = now(), status = 'up'`,
      [instance]
    );
  } catch { /* health table absent → ignore (single-instance mode) */ }
  res.json({ ok: true });
});

// Instance heartbeat (whatsapp-service → hub). Drives the sticky-shard health check:
// an instance that stops heartbeating (off the tailnet) is treated as dead → its workspaces fail over.
router.post('/instance-heartbeat', async (req, res) => {
  const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { instance } = req.body || {};
  if (!instance) return res.status(400).json({ error: 'instance required' });
  try {
    await pool.query(
      `INSERT INTO wa_instances(instance, last_seen, status) VALUES($1, now(), 'up')
       ON CONFLICT (instance) DO UPDATE SET last_seen = now(), status = 'up'`,
      [instance]
    );
  } catch { /* health table absent → ignore (single-instance mode) */ }
  res.json({ ok: true });
});

// Worker event relay (WhatsApp service → hub).
// QR is cached only — frontend polls /status to retrieve it (no socket.io).
// Other events (connected/disconnected) still emit via socket for UI quickness.
router.post('/event', async (req, res) => {
  const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
  if (secret !== WA_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { workspaceId, event, qr, phone } = req.body;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
  const io = getIO();
  if (event === 'qr') {
    await setWorkspaceQR(workspaceId, qr);
    console.log(`[Hub] QR cached for workspace ${workspaceId.slice(0, 8)} (qr_len=${qr?.length || 0})`);
  } else if (event === 'connected') {
    await setWorkspaceQR(workspaceId, null);
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
