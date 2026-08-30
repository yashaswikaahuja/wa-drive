import { Router, type Router as ExpressRouter } from 'express';
import { tailnetOnly, requireOwner } from './gate.js';
import { computeHealth } from './health.js';
import { runHealthSweep } from '@cybercontrol/backend-operations';

const router: ExpressRouter = Router();

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
 * GET /owner/funnel — activation funnel across live cafés:
 * signed up → WhatsApp connected → activated (1st file) → weekly-active → paying.
 * Shows where cafés drop off on the path to value.
 */
router.get('/funnel', async (req: any, res) => {
  try {
    const { rows } = await req.pool.query(`
      SELECT
        count(*) FILTER (WHERE w.deleted_at IS NULL)                                            AS signed_up,
        count(*) FILTER (WHERE w.deleted_at IS NULL AND EXISTS(
            SELECT 1 FROM whatsapp_numbers wn WHERE wn.workspace_id = w.id))                    AS connected,
        count(*) FILTER (WHERE w.deleted_at IS NULL AND EXISTS(
            SELECT 1 FROM drive_files df WHERE df.workspace_id = w.id))                         AS activated,
        count(*) FILTER (WHERE w.deleted_at IS NULL AND EXISTS(
            SELECT 1 FROM drive_files df WHERE df.workspace_id = w.id
              AND df.uploaded_at > now() - interval '7 days'))                                  AS weekly_active,
        count(*) FILTER (WHERE w.deleted_at IS NULL AND w.plan <> 'free')                       AS paying
      FROM workspaces w
    `);
    const r = rows[0];
    res.json({
      signedUp: +r.signed_up,
      connected: +r.connected,
      activated: +r.activated,
      weeklyActive: +r.weekly_active,
      paying: +r.paying,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /owner/trends — North-Star engagement over time:
 *  • wauSeries  Weekly Active Cafés for the last 8 weeks (≥1 doc processed that week)
 *  • stickiness WAU / MAU (how many monthly-active cafés are also active this week)
 *  • cohorts    monthly signup cohorts × % still active k months later (retention triangle)
 */
router.get('/trends', async (req: any, res) => {
  try {
    const [wau, stick, coh, act] = await Promise.all([
      req.pool.query(`
        SELECT to_char(wk, 'YYYY-MM-DD') AS week,
          (SELECT count(DISTINCT df.workspace_id) FROM drive_files df
             WHERE df.uploaded_at >= wk AND df.uploaded_at < wk + interval '7 days') AS active
        FROM generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') AS wk
        ORDER BY wk`),
      req.pool.query(`
        SELECT (SELECT count(DISTINCT workspace_id) FROM drive_files WHERE uploaded_at > now() - interval '7 days')  AS wau,
               (SELECT count(DISTINCT workspace_id) FROM drive_files WHERE uploaded_at > now() - interval '30 days') AS mau`),
      req.pool.query(`SELECT id, to_char(date_trunc('month', created_at), 'YYYY-MM') AS cohort FROM workspaces WHERE deleted_at IS NULL`),
      req.pool.query(`SELECT DISTINCT workspace_id AS id, to_char(date_trunc('month', uploaded_at), 'YYYY-MM') AS m FROM drive_files WHERE uploaded_at IS NOT NULL`),
    ]);

    // Cohort retention computed in JS (clean triangle).
    const MONTHS = 6;
    const now = new Date();
    const curYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const addMonths = (ym: string, k: number) => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + k, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const actByWs = new Map<string, Set<string>>();
    for (const r of act.rows) {
      let set = actByWs.get(r.id);
      if (!set) { set = new Set<string>(); actByWs.set(r.id, set); }
      set.add(r.m);
    }
    const cohortMap = new Map<string, string[]>();
    for (const r of coh.rows) {
      let arr = cohortMap.get(r.cohort);
      if (!arr) { arr = []; cohortMap.set(r.cohort, arr); }
      arr.push(r.id);
    }
    const cohorts = [...cohortMap.keys()].sort().slice(-MONTHS).map(cohort => {
      const ids = cohortMap.get(cohort)!;
      const retention: (number | null)[] = [];
      for (let k = 0; k < MONTHS; k++) {
        const month = addMonths(cohort, k);
        if (month > curYm) { retention.push(null); continue; }   // future — unknown
        const active = ids.filter(id => actByWs.get(id)?.has(month)).length;
        retention.push(ids.length ? Math.round((active / ids.length) * 100) : 0);
      }
      return { cohort, size: ids.length, retention };
    });

    const w = +stick.rows[0].wau, m = +stick.rows[0].mau;
    res.json({
      wauSeries: wau.rows.map((r: any) => ({ week: r.week, active: +r.active })),
      stickiness: { wau: w, mau: m, ratio: m ? Math.round((w / m) * 100) : 0 },
      cohorts,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /owner/health-sweep — run the health sweep on demand (bypasses the daily leader guard).
router.post('/health-sweep', async (_req, res) => {
  try { res.json(await runHealthSweep({ skipLeader: true })); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
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
        wn.phone                                        AS "whatsappNumber",
        (wn.phone IS NOT NULL AND wn.disconnected_at IS NULL) AS "whatsappConnected",
        EXISTS(SELECT 1 FROM workspace_secrets s WHERE s.workspace_id = w.id
               AND s.key = 'drive_refresh_token')                                           AS "driveLinked",
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id)                   AS files,
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id
             AND df.uploaded_at > now() - interval '7 days')                                AS "filesLast7",
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id
             AND df.uploaded_at > now() - interval '14 days'
             AND df.uploaded_at <= now() - interval '7 days')                               AS "filesPrev7",
        (SELECT count(*) FROM drive_files df WHERE df.workspace_id = w.id
             AND df.uploaded_at > now() - interval '30 days')                               AS "filesLast30",
        (SELECT max(uploaded_at) FROM drive_files df WHERE df.workspace_id = w.id)           AS "lastUpload"
      FROM workspaces w
      LEFT JOIN LATERAL (
        SELECT email, phone FROM users u
        WHERE u.workspace_id = w.id AND u.deleted_at IS NULL
        ORDER BY (u.role = 'admin') DESC, u.created_at ASC LIMIT 1
      ) pc ON true
      LEFT JOIN LATERAL (
        SELECT phone, disconnected_at FROM whatsapp_numbers wn
        WHERE wn.workspace_id = w.id AND wn.is_current = true
        ORDER BY wn.last_connected_at DESC LIMIT 1
      ) wn ON true
      WHERE ${where}
      ORDER BY ${sort} DESC NULLS LAST
      LIMIT $${params.length}
    `, params);
    res.json(rows.map((r: any) => {
      const health = computeHealth({
        createdAt: r.createdAt,
        lastUpload: r.lastUpload,
        filesLast7: +r.filesLast7,
        filesPrev7: +r.filesPrev7,
        filesLast30: +r.filesLast30,
        whatsappConnected: !!r.whatsappConnected,
        driveLinked: !!r.driveLinked,
        operators: +r.operators,
      });
      return {
        ...r,
        operators: +r.operators,
        files: +r.files,
        filesLast7: +r.filesLast7,
        health: health.score,
        healthBand: health.band,
        healthFlags: health.flags,
      };
    }));
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
        `SELECT phone AS "phoneNumber", is_current AS "isCurrent",
                (disconnected_at IS NULL) AS "connected",
                first_connected_at AS "firstConnectedAt", last_connected_at AS "lastConnectedAt",
                disconnected_at AS "disconnectedAt"
         FROM whatsapp_numbers WHERE workspace_id = $1
         ORDER BY is_current DESC, last_connected_at DESC NULLS LAST`, [id]),
      req.pool.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE uploaded_at > now() - interval '7 days')::int  AS last7,
                count(*) FILTER (WHERE uploaded_at > now() - interval '30 days')::int AS last30,
                max(uploaded_at) AS "lastUpload"
         FROM drive_files WHERE workspace_id = $1`, [id]),
    ]);
    // Activity timeline (append-only event stream). Separate query so a missing table can't 500 the drawer.
    let activity: any[] = [];
    try {
      activity = (await req.pool.query(
        `SELECT action, properties, created_at AS "createdAt"
         FROM activity_events WHERE workspace_id = $1
         ORDER BY created_at DESC LIMIT 60`, [id])).rows;
    } catch { /* table not migrated yet → empty timeline */ }
    if (!ws.rows.length) return res.status(404).json({ error: 'not found' });
    res.json({
      workspace: ws.rows[0],
      operators: ops.rows,
      whatsapp: wa.rows,
      files: files.rows[0],
      activity,
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

// PATCH /owner/workspaces/:id/status — block (suspend) or unblock a café.
// Block gates every login for all its users and revokes active sessions → locked out now + future.
router.patch('/workspaces/:id/status', async (req: any, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  const action = req.body?.action;
  if (action !== 'block' && action !== 'unblock') return res.status(400).json({ error: "action must be 'block' or 'unblock'" });
  const status = action === 'block' ? 'suspended' : 'active';
  try {
    const { rowCount } = await req.pool.query(
      'UPDATE workspaces SET status = $1, updated_at = now() WHERE id = $2 AND deleted_at IS NULL', [status, id]);
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    await req.pool.query('UPDATE users SET status = $1, updated_at = now() WHERE workspace_id = $2 AND deleted_at IS NULL', [status, id]);
    if (action === 'block') {
      // revoke live refresh tokens so the block bites immediately (access tokens expire ≤24h).
      await req.pool.query(
        'UPDATE auth_sessions SET revoked_at = now() WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE workspace_id = $1)', [id]);
    }
    console.log(`[Owner] ${action} workspace ${id}`);
    res.json({ ok: true, status });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /owner/workspaces/:id — PERMANENT hard delete of a café and ALL its data. Irreversible.
// Requires body { confirm: "<exact café name>" } to guard against accidents. Cascades every
// workspace/user-scoped table (all FKs are NO ACTION) inside one transaction.
router.delete('/workspaces/:id', async (req: any, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
  const client = await req.pool.connect();
  try {
    const w = (await client.query('SELECT name FROM workspaces WHERE id = $1', [id])).rows[0];
    if (!w) { client.release(); return res.status(404).json({ error: 'not found' }); }
    const confirm = (req.body?.confirm ?? '').toString();
    if (confirm !== (w.name || '')) {
      client.release();
      return res.status(400).json({ error: 'Confirmation text does not match the café name.' });
    }
    await client.query('BEGIN');
    // Every table with a workspace_id column (except users + workspaces), discovered live so new
    // tables are covered automatically. Then user-only tables, then users, then the workspace.
    const tbls = (await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE column_name = 'workspace_id' AND table_schema = 'public'
         AND table_name NOT IN ('users', 'workspaces')`)).rows;
    for (const t of tbls) {
      await client.query(`DELETE FROM "${t.table_name}" WHERE workspace_id = $1`, [id]);
    }
    await client.query('DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE workspace_id = $1)', [id]);
    await client.query('DELETE FROM contact_otps  WHERE user_id IN (SELECT id FROM users WHERE workspace_id = $1)', [id]);
    await client.query('DELETE FROM users WHERE workspace_id = $1', [id]);
    await client.query('DELETE FROM workspaces WHERE id = $1', [id]);
    await client.query('COMMIT');
    console.log(`[Owner] HARD-DELETED workspace ${id} ("${w.name}") + ${tbls.length} child tables`);
    res.json({ ok: true });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// GET /owner/ai-settings — prefer DB (owner-panel saves) then env fallback
router.get('/ai-settings', async (req: any, res) => {
  const mask = (k: string) => k ? '•'.repeat(Math.max(0, k.length - 8)) + k.slice(-8) : '';
  let dbAi: any = {};
  try {
    // PATCH writes the same AI block onto all workspaces — read any non-empty one
    const { rows } = await req.pool.query(
      `SELECT settings->'ai' AS ai
         FROM workspaces
        WHERE settings->'ai' IS NOT NULL
          AND (
            COALESCE(settings->'ai'->>'openrouterKey','') <> ''
            OR COALESCE(settings->'ai'->>'llmKey','') <> ''
            OR COALESCE(settings->'ai'->>'groqKey','') <> ''
            OR COALESCE(settings->'ai'->>'mistralKey','') <> ''
          )
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`
    );
    dbAi = rows[0]?.ai || {};
  } catch (e: any) {
    console.warn('[owner/ai-settings] DB read failed:', e.message);
  }

  const openrouterKey = dbAi.openrouterKey || process.env.OPENROUTER_API_KEY || '';
  const llmKey = dbAi.llmKey || dbAi.groqKey || process.env.AI_API_KEY || process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
  const mistralKey = dbAi.mistralKey || process.env.MISTRAL_API_KEY || '';
  const textProvider = dbAi.textProvider || (openrouterKey ? 'openrouter' : 'groq');
  const textModel = dbAi.textModel
    || (textProvider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct' : 'llama-3.3-70b-versatile');

  res.json({
    extractionProvider: dbAi.extractionProvider || 'mistral',
    extractionModel: dbAi.extractionModel || 'mistral-small-latest',
    mistralKey: mask(mistralKey),
    textProvider,
    textModel,
    openrouterKey: mask(openrouterKey),
    llmKey: mask(llmKey),
    // Compat alias for older owner-panel clients
    groqKey: mask(llmKey),
    source: dbAi.openrouterKey || dbAi.llmKey || dbAi.groqKey || dbAi.mistralKey ? 'owner-panel-db' : 'env',
  });
});

// PATCH /owner/ai-settings — update AI keys (writes to all workspace settings as global override)
router.patch('/ai-settings', async (req: any, res) => {
  const { extractionProvider, extractionModel, mistralKey, textProvider, textModel, openrouterKey, llmKey, groqKey } = req.body;
  const textKey = llmKey || groqKey;
  try {
    // Store globally in all workspaces (or we could just use a global table, but this reuses existing infra)
    const updates: string[] = [];
    if (extractionProvider) updates.push(`settings = jsonb_set(settings, '{ai,extractionProvider}', '"${extractionProvider}"'::jsonb)`);
    if (extractionModel) updates.push(`settings = jsonb_set(settings, '{ai,extractionModel}', '"${extractionModel}"'::jsonb)`);
    if (textProvider) updates.push(`settings = jsonb_set(settings, '{ai,textProvider}', '"${textProvider}"'::jsonb)`);
    if (textModel) updates.push(`settings = jsonb_set(settings, '{ai,textModel}', '"${textModel}"'::jsonb)`);
    if (mistralKey && !mistralKey.startsWith('•')) updates.push(`settings = jsonb_set(settings, '{ai,mistralKey}', '"${mistralKey}"'::jsonb)`);
    if (openrouterKey && !openrouterKey.startsWith('•')) updates.push(`settings = jsonb_set(settings, '{ai,openrouterKey}', '"${openrouterKey}"'::jsonb)`);
    if (textKey && !String(textKey).startsWith('•')) {
      updates.push(`settings = jsonb_set(settings, '{ai,llmKey}', '"${textKey}"'::jsonb)`);
      updates.push(`settings = jsonb_set(settings, '{ai,groqKey}', '"${textKey}"'::jsonb)`); // compat
    }
    if (updates.length > 0) {
      // Ensure ai key exists first
      await req.pool.query(`UPDATE workspaces SET settings = jsonb_set(settings, '{ai}', COALESCE(settings->'ai', '{}'::jsonb)) WHERE settings->'ai' IS NULL`);
      for (const u of updates) {
        await req.pool.query(`UPDATE workspaces SET ${u}`);
      }
    }
    // Fill AI on extension-service caches keys for 5m — note for operators
    res.json({ ok: true, note: 'Keys saved to workspaces.settings.ai (fill AI reads these; cache ≤5m)' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;