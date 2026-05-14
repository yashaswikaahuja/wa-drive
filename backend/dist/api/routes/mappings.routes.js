import { Router } from 'express';
const router = Router();

// GET /api/mappings — list all form keys for workspace
router.get('/', async (req, res) => {
  try {
    const { rows } = await req.pool.query(
      "SELECT semantic_form_key, hostname, source, confidence, fill_count, last_used_at FROM mappings WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY last_used_at DESC NULLS LAST",
      [req.user.workspaceId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mappings/:formKey — get mapping data
router.get('/:formKey', async (req, res) => {
  try {
    const { rows } = await req.pool.query(
      "SELECT mapping_data, source, confidence, fill_count FROM mappings WHERE semantic_form_key = $1 AND workspace_id = $2 AND deleted_at IS NULL ORDER BY confidence DESC LIMIT 1",
      [req.params.formKey, req.user.workspaceId]
    );
    if (!rows.length) return res.json(null);
    res.json(rows[0].mapping_data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/mappings/:formKey — save/update with confidence
router.post('/:formKey', async (req, res) => {
  const { updates, formKey: bodyFormKey } = req.body;
  if (!updates) return res.status(400).json({ error: 'updates required' });
  const formKey = req.params.formKey;
  try {
    // Load existing or create new
    const { rows } = await req.pool.query(
      "SELECT id, mapping_data, fill_count FROM mappings WHERE semantic_form_key = $1 AND workspace_id = $2 AND source = 'saved' AND deleted_at IS NULL",
      [formKey, req.user.workspaceId]
    );
    let mappingData = rows.length ? rows[0].mapping_data : {};
    const today = new Date().toISOString().slice(0, 10);
    for (const [semanticKey, { profileKey, delta }] of Object.entries(updates)) {
      const existing = mappingData[semanticKey];
      if (existing) {
        existing.fills = (existing.fills || 0) + (delta?.fills || 0);
        existing.corrections = (existing.corrections || 0) + (delta?.corrections || 0);
        existing.profileKey = profileKey;
        existing.lastSeen = today;
      } else {
        mappingData[semanticKey] = { profileKey, fills: delta?.fills || 0.5, corrections: delta?.corrections || 0, lastSeen: today };
      }
    }
    if (rows.length) {
      await req.pool.query(
        "UPDATE mappings SET mapping_data = $1, fill_count = fill_count + 1, last_used_at = now(), updated_at = now() WHERE id = $2",
        [JSON.stringify(mappingData), rows[0].id]
      );
    } else {
      await req.pool.query(
        "INSERT INTO mappings (workspace_id, semantic_form_key, mapping_data, source, confidence, created_by) VALUES ($1,$2,$3,'saved',0.5,$4)",
        [req.user.workspaceId, formKey, JSON.stringify(mappingData), req.user.userId]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
