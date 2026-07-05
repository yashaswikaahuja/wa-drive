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
        w.id, w.name, w.plan, w.status, w.created_at AS "createdAt", w.last_active_at AS "lastActiveAt",
        (SELECT count(*) FROM users u WHERE u.workspace_id = w.id AND u.deleted_at IS NULL) AS operators,
        EXISTS(SELECT 1 FROM whatsapp_sessions ws WHERE ws.workspace_id = w.id
               AND ws.status = 'connected' AND ws.deleted_at IS NULL)                       AS "whatsappConnected",
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id)                   AS files
      FROM workspaces w
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

export default router;
