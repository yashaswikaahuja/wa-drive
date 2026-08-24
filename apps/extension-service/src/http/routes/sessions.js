import { Router } from 'express';
import { pool } from '../../db/db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// POST /api/sessions — extension reports a completed fill session
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      hostname,
      semanticFormKey,
      runtimeVersion,
      totalFilled,
      totalFailed,
      totalSkipped,
      totalUnmapped,
      records,
      url,
      origin,
    } = req.body;

    // T16 — always store hostname when possible (product/newer posts used to leave empty)
    let host = (hostname && String(hostname).trim()) || '';
    if (!host) {
      const tryUrl = url || origin || '';
      if (tryUrl) {
        try { host = new URL(tryUrl).hostname; } catch { /* ignore */ }
      }
    }
    if (!host && Array.isArray(records)) {
      for (const r of records) {
        if (r?.hostname) { host = String(r.hostname); break; }
      }
    }

    const filled = totalFilled || 0;
    const failed = totalFailed || 0;
    // Honest totals live on records JSON; columns keep filled/failed for compat
    const recs = Array.isArray(records) ? records : [];
    const enriched = {
      _metrics: {
        filled,
        failed,
        skipped: totalSkipped ?? recs.filter((r) => r?.result === 'skipped').length,
        unmapped: totalUnmapped ?? recs.filter((r) => r?.result === 'unmapped').length,
        waiting_human: recs.filter((r) => r?.result === 'waiting_human').length,
      },
      records: recs,
    };

    const { rows } = await pool.query(
      `INSERT INTO sessions (workspace_id, user_id, hostname, semantic_form_key, runtime_version, schema_version, total_filled, total_failed, records)
       VALUES ($1,$2,$3,$4,$5,'1.0',$6,$7,$8) RETURNING id`,
      [req.user.workspaceId, req.user.userId, host || null, semanticFormKey || null, runtimeVersion, filled, failed, JSON.stringify(enriched)]
    );
    res.json({ ok: true, id: rows[0].id, hostname: host || null });
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
    const row = rows[0];
    // T16 — unwrap { _metrics, records } envelope for admin UI (expects array)
    let metrics = null;
    if (row.records && !Array.isArray(row.records) && Array.isArray(row.records.records)) {
      metrics = row.records._metrics || null;
      row.records = row.records.records;
    }
    if (metrics) row.metrics = metrics;
    res.json(row);
  } catch (e) {
    console.error('[ext/sessions] get:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
