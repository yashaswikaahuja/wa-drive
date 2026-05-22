import { Router } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// POST /api/sessions — extension reports a completed fill session
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { hostname, semanticFormKey, runtimeVersion, totalFilled, totalFailed, records } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO sessions (workspace_id, user_id, hostname, semantic_form_key, runtime_version, schema_version, total_filled, total_failed, records)
       VALUES ($1,$2,$3,$4,$5,'1.0',$6,$7,$8) RETURNING id`,
      [req.user.workspaceId, req.user.userId, hostname, semanticFormKey || null, runtimeVersion, totalFilled || 0, totalFailed || 0, JSON.stringify(records || [])]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error('[ext/sessions] post:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sessions/stats — per-hostname success rates (must be BEFORE /:id)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT hostname,
              COUNT(*)::int AS sessions,
              COALESCE(SUM(total_filled),0)::int AS "totalFilled",
              COALESCE(SUM(total_failed),0)::int AS "totalFailed"
       FROM sessions
       WHERE workspace_id = $1 AND hostname IS NOT NULL AND hostname != ''
       GROUP BY hostname
       ORDER BY sessions DESC`,
      [req.user.workspaceId]
    );
    const byHostname = {};
    for (const r of rows) byHostname[r.hostname] = r;
    res.json(byHostname);
  } catch (e) {
    console.error('[ext/sessions] stats:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sessions — list summary, paginated, workspace-scoped
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey",
              runtime_version AS "runtimeVersion",
              total_filled AS "totalFilled", total_failed AS "totalFailed",
              submitted_at, created_at AS "receivedAt"
       FROM sessions
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.workspaceId, limit, offset]
    );
    res.json(rows);
  } catch (e) {
    console.error('[ext/sessions] list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/sessions/:id — full session with per-field records
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey",
              runtime_version AS "runtimeVersion",
              total_filled AS "totalFilled", total_failed AS "totalFailed",
              records, submitted_at, created_at AS "receivedAt"
       FROM sessions
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[ext/sessions] get:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
