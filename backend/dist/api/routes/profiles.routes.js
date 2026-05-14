import { Router } from 'express';
const router = Router();

// All routes require auth — middleware applied at mount point in server.js

// GET /api/profiles — list workspace profiles
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.pool.query(
      "SELECT id, name, primary_contact_phone, data, created_at, updated_at FROM profiles WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC",
      [req.user.workspaceId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/profiles/:id — get profile by UUID or phone
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const isUuid = /^[0-9a-f]{8}-/.test(id);
    const { rows } = await req.pool.query(
      isUuid
        ? "SELECT id, name, primary_contact_phone, data, created_at, updated_at FROM profiles WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL"
        : "SELECT id, name, primary_contact_phone, data, created_at, updated_at FROM profiles WHERE primary_contact_phone = $1 AND workspace_id = $2 AND deleted_at IS NULL",
      [id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/profiles — create/update profile
router.post('/', async (req, res) => {
  const { phone, name, data } = req.body;
  if (!phone && !data) return res.status(400).json({ error: 'phone or data required' });
  try {
    const profileData = data || req.body;
    const profileName = name || profileData.name || '';
    const profilePhone = phone || profileData.phone || '';
    // Check if exists, then insert or update
    const existing = await req.pool.query(
      'SELECT id FROM profiles WHERE primary_contact_phone = $1 AND workspace_id = $2 AND deleted_at IS NULL',
      [profilePhone, req.user.workspaceId]
    );
    let result;
    if (existing.rows.length) {
      result = await req.pool.query(
        'UPDATE profiles SET data = $1, name = $2, updated_by = $3, updated_at = now() WHERE id = $4 RETURNING id, name, primary_contact_phone, created_at, updated_at',
        [JSON.stringify(profileData), profileName, req.user.userId, existing.rows[0].id]
      );
    } else {
      result = await req.pool.query(
        'INSERT INTO profiles (workspace_id, primary_contact_phone, name, data, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, primary_contact_phone, created_at, updated_at',
        [req.user.workspaceId, profilePhone, profileName, JSON.stringify(profileData), req.user.userId]
      );
    }
    res.json({ ok: true, profile: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/profiles/:id — soft delete
router.delete('/:id', async (req, res) => {
  try {
    await req.pool.query(
      "UPDATE profiles SET deleted_at = now() WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.user.workspaceId]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
