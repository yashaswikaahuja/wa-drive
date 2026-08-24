import { Router } from 'express';
import { pool } from '../../db/db.js';
import { authMiddleware } from '../auth.js';
import { deriveProfile } from '@cybercontrol/svc-fill-planner';

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
    const profile = rows[0];
    // Document-centric model: profiles.data is stored empty; the real fields are derived on demand
    // from per-document extractions (extraction_cache). Operator-confirmed fields in `data` win.
    // (Mirrors backend /api/customers/persons/:id — without this the extension sees an empty profile.)
    try {
      const personKey = (profile.displayLabel || profile.name || '')
        .toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
      const derived = await deriveProfile(req.user.workspaceId, profile.phone, personKey, profile.data || {});
      if (Object.keys(derived).length > 0) profile.data = derived;
    } catch (e) {
      console.warn('[ext/profiles] deriveProfile failed:', e.message);
    }
    res.json(profile);
  } catch (e) {
    console.error('[ext/profiles] get error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
