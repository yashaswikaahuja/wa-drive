import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

// GET /api/customers/households
router.get('/households', authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        primary_contact_phone as phone,
        COUNT(*) as person_count,
        ARRAY_AGG(json_build_object(
          'id', id,
          'name', name,
          'displayLabel', display_label,
          'relationship', relationship,
          'createdAt', created_at,
          'updatedAt', updated_at
        ) ORDER BY relationship = 'self' DESC, created_at) as persons
      FROM profiles
      WHERE workspace_id = $1 AND deleted_at IS NULL
      GROUP BY primary_contact_phone
      ORDER BY MAX(updated_at) DESC
    `, [req.user.workspaceId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /api/customers/persons
router.post('/persons', authMiddleware, async (req: any, res) => {
  const { phone, name, relationship, displayLabel, data } = req.body;
  if (!phone || !name) return res.status(400).json({ error: 'phone and name required' });
  try {
    const { rows } = await pool.query(`
      INSERT INTO profiles (workspace_id, primary_contact_phone, name, display_label, relationship, data, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [req.user.workspaceId, phone, name, displayLabel || name, relationship || 'self', JSON.stringify(data || {}), req.user.userId]);
    res.json({ ok: true, id: rows[0].id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/customers/persons/:id
router.patch('/persons/:id', authMiddleware, async (req: any, res) => {
  const { fields, displayLabel, relationship } = req.body;
  try {
    const { rows } = await pool.query(
      "SELECT data FROM profiles WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Person not found' });
    const current = rows[0].data || {};
    const merged: any = { ...current };
    if (fields) {
      const now = new Date().toISOString();
      for (const [key, info] of Object.entries(fields)) {
        const fieldInfo = info as any;
        merged[key] = {
          value: fieldInfo.value,
          source: fieldInfo.source || 'manual',
          documentId: fieldInfo.documentId || null,
          confidence: fieldInfo.confidence || 1.0,
          confirmedBy: req.user.userId,
          confirmedAt: now,
        };
      }
    }
    const updates = ['data = $1::jsonb', 'updated_by = $2', 'updated_at = now()'];
    const params: any[] = [JSON.stringify(merged), req.user.userId];
    let pi = 3;
    if (displayLabel !== undefined) { updates.push(`display_label = $${pi}`); params.push(displayLabel); pi++; }
    if (relationship !== undefined) { updates.push(`relationship = $${pi}`); params.push(relationship); pi++; }
    params.push(req.params.id, req.user.workspaceId);
    await pool.query(`UPDATE profiles SET ${updates.join(', ')} WHERE id = $${pi} AND workspace_id = $${pi + 1}`, params);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
