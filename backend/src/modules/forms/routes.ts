import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

// GET /api/forms/search?q=railway
router.get('/search', authMiddleware, async (req: any, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    if (!q) {
      const { rows } = await pool.query(
        `SELECT id, name, short_name, portal, url, required_documents, fee, photo_specs, signature_specs, fill_count
         FROM forms WHERE status = 'active' ORDER BY fill_count DESC, short_name LIMIT 20`
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT id, name, short_name, portal, url, required_documents, fee, photo_specs, signature_specs, fill_count
       FROM forms
       WHERE status = 'active' AND (
         LOWER(name) LIKE $1 OR LOWER(short_name) LIKE $1 OR LOWER(portal) LIKE $1
         OR EXISTS (SELECT 1 FROM unnest(search_keywords) k WHERE k LIKE $1)
       )
       ORDER BY fill_count DESC, short_name LIMIT 20`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/forms/:id
router.get('/:id', authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM forms WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Form not found' });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
