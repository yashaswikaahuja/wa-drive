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

// Detect which optional columns exist (cached after first check)
let _columnCache: Set<string> | null = null;
async function getFormColumns(): Promise<Set<string>> {
  if (_columnCache) return _columnCache;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'forms'`
  );
  _columnCache = new Set(rows.map((r: any) => r.column_name));
  return _columnCache;
}

// Build a safe SELECT list based on what columns actually exist
async function safeSelectList(): Promise<string> {
  const cols = await getFormColumns();
  const base = ['id', 'name', 'short_name', 'portal', 'url', 'status', 'required_documents', 'fee', 'photo_specs', 'signature_specs'];
  const optional = ['lifecycle', 'opens_at', 'closes_at', 'source_updated_at', 'official_notice_url', 'notice_summary'];
  const selected = [...base];
  for (const c of optional) {
    if (cols.has(c)) selected.push(c);
    else selected.push(`NULL AS ${c}`);
  }
  return selected.join(', ');
}

// GET /owner/forms?q=ssc&lifecycle=open
router.get('/', async (req: any, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const lifecycleFilter = (req.query.lifecycle || '').toString().trim().toLowerCase();
    const cols = await getFormColumns();
    const selectList = await safeSelectList();

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 0;

    if (lifecycleFilter && cols.has('lifecycle')) {
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
    const orderCol = cols.has('lifecycle') ? `CASE lifecycle WHEN 'open' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END, ` : '';

    const { rows } = await pool.query(
      `SELECT ${selectList} FROM forms ${where} ORDER BY ${orderCol}short_name LIMIT 100`, params);
    res.json(rows);
  } catch (e: any) {
    console.error('[owner/forms] GET / error:', e.message);
    res.status(500).json({ error: e.message, code: 'query_failed' });
  }
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

  // Only patch columns that exist
  const cols = await getFormColumns();
  const sets: string[] = [];
  const params: any[] = [];
  let idx = 0;

  for (const key of PATCH_ALLOWLIST) {
    if (!(key in body)) continue;
    if (!cols.has(key)) continue; // skip columns not yet migrated
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
  if (!('source_updated_at' in body) && cols.has('source_updated_at')) {
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

  const cols = await getFormColumns();

  // Build insert dynamically based on available columns
  const fields = ['name', 'short_name', 'portal', 'url', 'status'];
  const values = [name, short_name, portal, url, lifecycleToStatus(lifecycle)];

  if (cols.has('lifecycle')) { fields.push('lifecycle'); values.push(lifecycle); }
  if (cols.has('opens_at')) { fields.push('opens_at'); values.push(req.body.opens_at || null); }
  if (cols.has('closes_at')) { fields.push('closes_at'); values.push(req.body.closes_at || null); }
  if (cols.has('official_notice_url')) { fields.push('official_notice_url'); values.push(req.body.official_notice_url || null); }
  if (cols.has('notice_summary')) { fields.push('notice_summary'); values.push(req.body.notice_summary || null); }
  if (cols.has('source_updated_at')) { fields.push('source_updated_at'); values.push(new Date().toISOString()); }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  try {
    const { rows } = await pool.query(
      `INSERT INTO forms (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`, values);
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
