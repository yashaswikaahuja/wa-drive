import { Router, Request, Response } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

// GET /api/profiles — list all profiles for the authenticated user's workspace
// Returns shape compatible with extension popup: { id, name, phone, displayLabel, relationship }
router.get('/', authMiddleware, async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
             relationship, updated_at AS "updatedAt"
      FROM profiles
      WHERE workspace_id = $1 AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `, [req.user.workspaceId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/profiles/:id — full profile (with data jsonb) for the extension to autofill
router.get('/:id', authMiddleware, async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, primary_contact_phone AS phone, display_label AS "displayLabel",
             relationship, data, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM profiles
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    `, [req.params.id, req.user.workspaceId]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
