import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

// Build a map of hostname → { fills, filled, failed } across ALL workspaces (network effect)
async function getHostnameStats(): Promise<Record<string, { fills: number; filled: number; failed: number }>> {
  const { rows } = await pool.query(
    `SELECT hostname, COUNT(*)::int as fills, COALESCE(SUM(total_filled),0)::int as filled, COALESCE(SUM(total_failed),0)::int as failed
     FROM sessions WHERE hostname IS NOT NULL GROUP BY hostname`
  );
  const map: Record<string, any> = {};
  for (const r of rows) map[r.hostname] = { fills: r.fills, filled: r.filled, failed: r.failed };
  return map;
}

// Match a form URL to session stats by hostname (handles www. prefix + subdomain)
function statsForUrl(url: string, stats: Record<string, any>) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { fills: 0, confidence: null }; }
  let agg = { fills: 0, filled: 0, failed: 0 };
  for (const [h, s] of Object.entries(stats)) {
    const hn = h.replace(/^www\./, '');
    if (hn === host || hn.endsWith('.' + host) || host.endsWith('.' + hn)) {
      agg.fills += s.fills; agg.filled += s.filled; agg.failed += s.failed;
    }
  }
  const total = agg.filled + agg.failed;
  const confidence = total > 0 ? Math.round((agg.filled / total) * 100) : null;
  return { fills: agg.fills, confidence };
}

// GET /api/forms/search?q=railway
router.get('/search', authMiddleware, async (req: any, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const stats = await getHostnameStats();
    const baseSql = q
      ? `SELECT id, name, short_name, portal, url, required_documents, fee, photo_specs, signature_specs FROM forms
         WHERE status = 'active' AND (LOWER(name) LIKE $1 OR LOWER(short_name) LIKE $1 OR LOWER(portal) LIKE $1
           OR EXISTS (SELECT 1 FROM unnest(search_keywords) k WHERE k LIKE $1)) LIMIT 20`
      : `SELECT id, name, short_name, portal, url, required_documents, fee, photo_specs, signature_specs FROM forms
         WHERE status = 'active' LIMIT 20`;
    const { rows } = await pool.query(baseSql, q ? [`%${q}%`] : []);
    const result = rows.map((f: any) => {
      const s = statsForUrl(f.url, stats);
      return { ...f, fill_count: s.fills, confidence: s.confidence };
    }).sort((a: any, b: any) => b.fill_count - a.fill_count);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /api/forms/confidence?hostname=ssc.gov.in — for extension popup badge
router.get('/confidence', authMiddleware, async (req: any, res) => {
  try {
    const hostname = (req.query.hostname || '').toString();
    if (!hostname) return res.json({ fills: 0, confidence: null });
    const stats = await getHostnameStats();
    const { fills, confidence } = statsForUrl('https://' + hostname.replace(/^https?:\/\//, ''), stats);
    res.json({ fills, confidence });
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

// GET /api/forms/readiness/:phone — readiness % for each form for this customer
router.get('/readiness/:phone', authMiddleware, async (req: any, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone);
    // Best profile for this phone (most complete)
    const pr = await pool.query(
      `SELECT data FROM profiles WHERE workspace_id = $1 AND primary_contact_phone = $2 AND deleted_at IS NULL`,
      [req.user.workspaceId, phone]
    );
    // Merge all persons' data (household), pick filled values
    const filledKeys = new Set<string>();
    for (const row of pr.rows) {
      const data = row.data || {};
      for (const [k, v] of Object.entries(data)) {
        const val = v && typeof v === 'object' ? (v as any).value : v;
        if (val) filledKeys.add(k);
      }
    }
    const forms = await pool.query(
      `SELECT id, short_name, portal, url, required_fields, required_documents, photo_specs, signature_specs, fill_count
       FROM forms WHERE status = 'active' AND array_length(required_fields, 1) > 0`
    );
    const result = forms.rows.map((f: any) => {
      const req: string[] = f.required_fields || [];
      const missing = req.filter(k => !filledKeys.has(k));
      const percent = req.length ? Math.round(((req.length - missing.length) / req.length) * 100) : 0;
      return {
        id: f.id, short_name: f.short_name, portal: f.portal, url: f.url,
        fill_count: f.fill_count, percent, missing,
        photo_specs: f.photo_specs, signature_specs: f.signature_specs,
      };
    }).sort((a: any, b: any) => b.percent - a.percent);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
