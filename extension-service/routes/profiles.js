import { Router } from 'express';
import { pool } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();

// GET /api/profiles — list profiles for the authenticated workspace
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
             relationship, updated_at AS "updatedAt"
      FROM profiles
      WHERE workspace_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `, [req.user.workspaceId]);
    res.json(rows);
  } catch (e) {
    console.error('[ext/profiles] list error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/profiles/:id — full profile (with data jsonb) for autofill
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
             relationship, data, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM profiles
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    `, [req.params.id, req.user.workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[ext/profiles] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
