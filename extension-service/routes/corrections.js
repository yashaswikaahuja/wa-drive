import { Router } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// POST /api/corrections — operator supervised correction batch
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { hostname, semanticFormKey, trigger, corrections, runtimeVersion } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO corrections (workspace_id, user_id, hostname, semantic_form_key, trigger, runtime_version, corrections)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.workspaceId, req.user.userId, hostname, semanticFormKey || null, trigger, runtimeVersion || null, JSON.stringify(corrections || [])]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (e) {
    console.error('[ext/corrections] post:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/corrections — list summaries
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey", trigger,
              jsonb_array_length(corrections) AS "correctionCount",
              created_at AS "receivedAt"
       FROM corrections
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.workspaceId, limit, offset]
    );
    res.json(rows);
  } catch (e) {
    console.error('[ext/corrections] list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/corrections/:id — full
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey", trigger,
              corrections, created_at AS "receivedAt"
       FROM corrections
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[ext/corrections] get:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
