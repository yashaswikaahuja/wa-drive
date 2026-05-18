import { Router } from 'express';
import { pool, auditLog } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { getIO } from '../../socket/index.js';

const router = Router();

// POST /api/jobs
router.post('/', authMiddleware, async (req: any, res) => {
  const { profileId, serviceType, metadata, notes } = req.body;
  if (!profileId || !serviceType) return res.status(400).json({ error: 'profileId and serviceType required' });
  try {
    const { rows } = await pool.query(
      "INSERT INTO jobs (workspace_id, user_id, profile_id, service_type, metadata, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status, created_at",
      [req.user.workspaceId, req.user.userId, profileId, serviceType, metadata ? JSON.stringify(metadata) : null, notes || null]
    );
    await auditLog(req.user.workspaceId, req.user.userId, 'job_create', 'job', rows[0].id, { serviceType, profileId });
    res.json({ ok: true, job: rows[0] });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/jobs
router.get('/', authMiddleware, async (req: any, res) => {
  const status = req.query.status as string | undefined;
  try {
    let q = "SELECT j.id, j.status, j.service_type, j.metadata, j.notes, j.started_at, j.completed_at, j.created_at, j.updated_at, p.name as customer_name, p.primary_contact_phone as customer_phone, st.label as service_label, st.icon as service_icon FROM jobs j JOIN profiles p ON j.profile_id = p.id JOIN service_types st ON j.service_type = st.id WHERE j.workspace_id = $1";
    const params: any[] = [req.user.workspaceId];
    if (status) { q += " AND j.status = $2"; params.push(status); }
    q += " ORDER BY j.created_at DESC LIMIT 100";
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/jobs/:id
router.patch('/:id', authMiddleware, async (req: any, res) => {
  const { status, notes, sessionId } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  const VALID = ['queued', 'in_progress', 'needs_review', 'completed', 'cancelled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const updates = ["status = $1", "updated_at = now()"];
    const params: any[] = [status];
    let pi = 2;
    if (status === 'in_progress') updates.push('started_at = now()');
    if (status === 'completed' || status === 'cancelled') updates.push('completed_at = now()');
    if (notes) { updates.push(`notes = $${pi}`); params.push(notes); pi++; }
    if (sessionId) { updates.push(`session_id = $${pi}`); params.push(sessionId); pi++; }
    params.push(req.params.id, req.user.workspaceId);
    const { rowCount } = await pool.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = $${pi} AND workspace_id = $${pi + 1}`, params);
    if (!rowCount) return res.status(404).json({ error: 'Job not found' });
    await auditLog(req.user.workspaceId, req.user.userId, 'job_update', 'job', req.params.id, { status });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/jobs/:id/dispatch
router.post('/:id/dispatch', authMiddleware, async (req: any, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT j.id, j.status, j.metadata, j.service_type,
             p.id as profile_id, p.name as profile_name, p.data as profile_data, p.primary_contact_phone,
             st.label as service_label, st.execution_type, st.requires_extension, st.config as service_config
      FROM jobs j JOIN profiles p ON j.profile_id = p.id JOIN service_types st ON j.service_type = st.id
      WHERE j.id = $1 AND j.workspace_id = $2
    `, [req.params.id, req.user.workspaceId]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Job not found' }); }
    const job = rows[0];
    if (job.status !== 'queued' && job.status !== 'failed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Job is ${job.status}, cannot dispatch` });
    }
    const sessionResult = await client.query(`
      INSERT INTO sessions (workspace_id, user_id, profile_id, hostname, runtime_version, schema_version, total_filled, total_failed, records)
      VALUES ($1,$2,$3,$4,$5,'1.0',0,0,'[]'::jsonb) RETURNING id
    `, [req.user.workspaceId, req.user.userId, job.profile_id, job.metadata?.hostname || '', '5.30']);
    const sessionId = sessionResult.rows[0].id;
    await client.query("UPDATE jobs SET status = 'in_progress', session_id = $1, started_at = now(), updated_at = now() WHERE id = $2", [sessionId, job.id]);
    await client.query('COMMIT');
    await auditLog(req.user.workspaceId, req.user.userId, 'job_dispatch', 'job', job.id, { sessionId });
    const payload = {
      jobId: job.id, sessionId, serviceType: job.service_type, executionType: job.execution_type,
      requiresExtension: job.requires_extension, profile: job.profile_data || {},
      profileName: job.profile_name, profilePhone: job.primary_contact_phone,
      serviceLabel: job.service_label, metadata: job.metadata || {},
      formUrl: job.metadata?.formUrl || null,
    };
    const io = getIO();
    io.emit(`job:${job.id}:dispatched`, { jobId: job.id, sessionId, status: 'in_progress' });
    res.json({ ok: true, dispatch: payload });
  } catch (e: any) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// PATCH /api/jobs/:id/progress
router.patch('/:id/progress', authMiddleware, async (req: any, res) => {
  const { sessionId, totalFilled, totalFailed, records, currentField, status, failReason } = req.body;
  try {
    const { rows } = await pool.query("SELECT id, status FROM jobs WHERE id = $1 AND workspace_id = $2", [req.params.id, req.user.workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    if (sessionId && (totalFilled !== undefined || records)) {
      const updates: string[] = [];
      const params: any[] = [];
      let pi = 1;
      if (totalFilled !== undefined) { updates.push(`total_filled = $${pi}`); params.push(totalFilled); pi++; }
      if (totalFailed !== undefined) { updates.push(`total_failed = $${pi}`); params.push(totalFailed); pi++; }
      if (records) { updates.push(`records = $${pi}::jsonb`); params.push(JSON.stringify(records)); pi++; }
      if (updates.length) {
        params.push(sessionId, req.user.workspaceId);
        await pool.query(`UPDATE sessions SET ${updates.join(', ')} WHERE id = $${pi} AND workspace_id = $${pi + 1}`, params);
      }
    }
    if (status) {
      const VALID = ['in_progress', 'needs_review', 'completed', 'failed'];
      if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      const updates = ['status = $1', 'updated_at = now()'];
      const params: any[] = [status];
      let pi = 2;
      if (status === 'completed' || status === 'failed') updates.push('completed_at = now()');
      if (failReason) { updates.push(`notes = $${pi}`); params.push(failReason); pi++; }
      params.push(req.params.id, req.user.workspaceId);
      await pool.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = $${pi} AND workspace_id = $${pi + 1}`, params);
    }
    const io = getIO();
    io.emit(`job:${req.params.id}:progress`, { jobId: req.params.id, totalFilled, totalFailed, currentField, status });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
