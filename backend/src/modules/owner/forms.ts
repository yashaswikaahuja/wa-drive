import { Router } from 'express';
import { pool } from '../../db.js';

const router = Router();

const VALID_LIFECYCLE = ['upcoming', 'open', 'closed', 'archived'];

const PATCH_ALLOWLIST = [
  'lifecycle', 'opens_at', 'closes_at', 'source_updated_at',
  'url', 'name', 'short_name', 'portal',
  'required_documents', 'fee', 'photo_specs', 'signature_specs',
  'official_notice_url', 'notice_summary', 'status',
];

function lifecycleToStatus(lifecycle: string): string {
  return (lifecycle === 'open' || lifecycle === 'upcoming') ? 'active' : 'archived';
}

// GET /owner/forms?q=ssc&lifecycle=open
router.get('/', async (req: any, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const lifecycleFilter = (req.query.lifecycle || '').toString().trim().toLowerCase();

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 0;

    if (lifecycleFilter) {
      const allowed = lifecycleFilter.split(',').map((s: string) => s.trim()).filter(Boolean);
      idx++;
      conditions.push(`lifecycle = ANY($${idx})`);
      params.push(allowed);
    }

    if (q) {
      idx++;
      conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(short_name) LIKE $${idx} OR LOWER(portal) LIKE $${idx})`);
      params.push(`%${q}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, name, short_name, portal, url, lifecycle, opens_at, closes_at, source_updated_at,
              official_notice_url, notice_summary, status, required_documents, fee, photo_specs, signature_specs
       FROM forms ${where}
       ORDER BY CASE lifecycle WHEN 'open' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END, short_name
       LIMIT 100`, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /owner/forms/:id
router.get('/:id', async (req: any, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM forms WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Form not found' });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH /owner/forms/:id
router.patch('/:id', async (req: any, res) => {
  const { id } = req.params;
  const body = req.body || {};

  // Validate lifecycle
  if (body.lifecycle && !VALID_LIFECYCLE.includes(body.lifecycle)) {
    return res.status(400).json({ error: `Invalid lifecycle. Must be one of: ${VALID_LIFECYCLE.join(', ')}` });
  }

  const sets: string[] = [];
  const params: any[] = [];
  let idx = 0;

  for (const key of PATCH_ALLOWLIST) {
    if (!(key in body)) continue;
    idx++;
    if (key === 'required_documents') {
      sets.push(`required_documents = $${idx}::text[]`);
      params.push(body[key]);
    } else if (['fee', 'photo_specs', 'signature_specs'].includes(key)) {
      sets.push(`${key} = $${idx}::jsonb`);
      params.push(JSON.stringify(body[key]));
    } else {
      sets.push(`${key} = $${idx}`);
      params.push(body[key]);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  // Always update source_updated_at unless explicitly provided
  if (!('source_updated_at' in body)) {
    idx++;
    sets.push(`source_updated_at = $${idx}`);
    params.push(new Date().toISOString());
  }

  // Keep status in sync with lifecycle
  if (body.lifecycle && !('status' in body)) {
    idx++;
    sets.push(`status = $${idx}`);
    params.push(lifecycleToStatus(body.lifecycle));
  }

  idx++;
  params.push(id);

  try {
    const { rowCount, rows } = await pool.query(
      `UPDATE forms SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (!rowCount) return res.status(404).json({ error: 'Form not found' });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /owner/forms — create a new form
router.post('/', async (req: any, res) => {
  const { name, short_name, portal, url } = req.body || {};
  if (!name || !short_name || !portal || !url) {
    return res.status(400).json({ error: 'name, short_name, portal, and url are required' });
  }

  const lifecycle = req.body.lifecycle || 'open';
  if (!VALID_LIFECYCLE.includes(lifecycle)) {
    return res.status(400).json({ error: `Invalid lifecycle. Must be one of: ${VALID_LIFECYCLE.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO forms (name, short_name, portal, url, lifecycle, status, opens_at, closes_at, official_notice_url, notice_summary, source_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING *`,
      [name, short_name, portal, url, lifecycle, lifecycleToStatus(lifecycle),
       req.body.opens_at || null, req.body.closes_at || null,
       req.body.official_notice_url || null, req.body.notice_summary || null]);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
