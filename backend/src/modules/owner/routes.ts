import { Router } from 'express';
import { tailnetOnly, requireOwner } from './gate.js';

const router = Router();

// Every owner route: must come from the tailnet AND be an allowlisted owner identity.
router.use(tailnetOnly, requireOwner);

/**
 * GET /owner/metrics — the top-line Level-1 customer numbers.
 * signups   = live (non-deleted) workspaces
 * active30d = signups with activity in the last 30 days (the real "size")
 * paying    = signups on a paid plan
 * churned   = soft-deleted workspaces
 * newThisMonth / newThisWeek = acquisition
 */
router.get('/metrics', async (req: any, res) => {
  try {
    const { rows } = await req.pool.query(`
      SELECT
        count(*) FILTER (WHERE deleted_at IS NULL)                                                        AS signups,
        count(*) FILTER (WHERE deleted_at IS NULL AND last_active_at > now() - interval '30 days')        AS active30d,
        count(*) FILTER (WHERE deleted_at IS NULL AND plan <> 'free')                                     AS paying,
        count(*) FILTER (WHERE deleted_at IS NOT NULL)                                                    AS churned,
        count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()))           AS new_this_month,
        count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= now() - interval '7 days')            AS new_this_week
      FROM workspaces
    `);
    const r = rows[0];
    res.json({
      signups: +r.signups,
      active30d: +r.active30d,
      paying: +r.paying,
      churned: +r.churned,
      newThisMonth: +r.new_this_month,
      newThisWeek: +r.new_this_week,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /owner/workspaces — per-customer drill-down.
 * ?limit (default 200), ?q (name search), ?sort (last_active|created|files).
 */
router.get('/workspaces', async (req: any, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const q = (req.query.q || '').toString().trim();
    const sort = ({ created: 'w.created_at', files: 'files' } as any)[req.query.sort] || 'w.last_active_at';
    const params: any[] = [];
    let where = 'w.deleted_at IS NULL';
    if (q) { params.push(`%${q}%`); where += ` AND w.name ILIKE $${params.length}`; }
    params.push(limit);
    const { rows } = await req.pool.query(`
      SELECT
        w.id, w.name, w.plan, w.status, w.location, w.created_at AS "createdAt", w.last_active_at AS "lastActiveAt",
        w.location_source AS "locationSource", w.lat, w.lng,
        pc.email, pc.phone,
        (SELECT count(*) FROM users u WHERE u.workspace_id = w.id AND u.deleted_at IS NULL) AS operators,
        EXISTS(SELECT 1 FROM whatsapp_sessions ws WHERE ws.workspace_id = w.id
               AND ws.status = 'connected' AND ws.deleted_at IS NULL)                       AS "whatsappConnected",
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id)                   AS files
      FROM workspaces w
      LEFT JOIN LATERAL (
        SELECT email, phone FROM users u
        WHERE u.workspace_id = w.id AND u.deleted_at IS NULL
        ORDER BY (u.role = 'admin') DESC, u.created_at ASC LIMIT 1
      ) pc ON true
      WHERE ${where}
      ORDER BY ${sort} DESC NULLS LAST
      LIMIT $${params.length}
    `, params);
    res.json(rows.map((r: any) => ({
      ...r,
      operators: +r.operators,
      files: +r.files,
    })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /owner/workspaces/:id — one café's full detail: operators, WhatsApp sessions, file stats, dates.
 */
router.get('/workspaces/:id', async (req: any, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const [ws, ops, wa, files] = await Promise.all([
      req.pool.query(
        `SELECT id, name, plan, status, location, location_source AS "locationSource", lat, lng, created_at AS "createdAt", last_active_at AS "lastActiveAt"
         FROM workspaces WHERE id = $1`, [id]),
      req.pool.query(
        `SELECT id, name, email, phone, role, status, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM users WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [id]),
      req.pool.query(
        `SELECT phone_number AS "phoneNumber", status, connected_at AS "connectedAt"
         FROM whatsapp_sessions WHERE workspace_id = $1 AND deleted_at IS NULL
         ORDER BY connected_at DESC NULLS LAST`, [id]),
      req.pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE uploaded_at > now() - interval '7 days')::int  AS last7,
                count(*) FILTER (WHERE uploaded_at > now() - interval '30 days')::int AS last30,
                max(uploaded_at) AS "lastUpload"
         FROM drive_files WHERE workspace_id = $1`, [id]),
    ]);
    if (!ws.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({
      workspace: ws.rows[0],
      operators: ops.rows,
      whatsapp: wa.rows,
      files: files.rows[0],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * PATCH /owner/workspaces/:id — owner-editable fields. Currently: location (free text, nullable).
 */
router.patch('/workspaces/:id', async (req: any, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  if (!('location' in (req.body || {}))) return res.status(400).json({ error: 'nothing to update' });
  const raw = req.body.location;
  const location = raw == null || String(raw).trim() === '' ? null : String(raw).trim().slice(0, 200);
  try {
    const { rowCount } = await req.pool.query(
      "UPDATE workspaces SET location = $1, location_source = CASE WHEN $1 IS NULL THEN NULL ELSE 'manual' END, updated_at = now() WHERE id = $2 AND deleted_at IS NULL",
      [location, id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, location });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;