/**
 * Owner learning/config API — form mappings, fill sessions, corrections, aggregate stats.
 * These used to live under Hub /admin/*; café staff stay on the golden path while the
 * platform owner reviews/teaches mappings here (tailnet + OWNER_KEY).
 *
 * Mappings live in shared ext_kv_store (global across cafés). Sessions/corrections are
 * workspace-scoped; list endpoints accept an optional workspaceId filter.
 */
import { Router, type Router as ExpressRouter } from 'express';

const router: ExpressRouter = Router();

const MAPPINGS_KEY = 'form_mappings';
const TRANSLATIONS_KEY = 'value_translations';

async function ensureKv(pool: any) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ext_kv_store (
      key        text PRIMARY KEY,
      data       jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadDoc(pool: any, key: string): Promise<Record<string, any>> {
  await ensureKv(pool);
  const { rows } = await pool.query('SELECT data FROM ext_kv_store WHERE key = $1', [key]);
  return rows[0]?.data ?? {};
}

async function mutateDoc(pool: any, key: string, mutator: (data: Record<string, any>) => any) {
  await ensureKv(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO ext_kv_store (key, data) VALUES ($1, '{}'::jsonb) ON CONFLICT (key) DO NOTHING`,
      [key],
    );
    const { rows } = await client.query('SELECT data FROM ext_kv_store WHERE key = $1 FOR UPDATE', [key]);
    const current = rows[0]?.data ?? {};
    const result = await mutator(current);
    const next = result && typeof result === 'object' ? result : current;
    await client.query(
      'UPDATE ext_kv_store SET data = $2::jsonb, updated_at = now() WHERE key = $1',
      [key, JSON.stringify(next)],
    );
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

// ── Aggregate learning stats (cross-café) ────────────────────────────────────

router.get('/stats', async (req: any, res) => {
  try {
    const [sessions, corrections, mappings] = await Promise.all([
      req.pool.query(`
        SELECT COUNT(*)::int AS sessions,
               COALESCE(SUM(total_filled),0)::int AS filled,
               COALESCE(SUM(total_failed),0)::int AS failed
        FROM sessions`),
      req.pool.query(`SELECT COUNT(*)::int AS total FROM corrections`),
      loadDoc(req.pool, MAPPINGS_KEY).catch(() => ({})),
    ]);
    const mapObj = (mappings || {}) as Record<string, any>;
    const formKeys = Object.keys(mapObj).filter((k) => k !== '_meta');
    let fieldCount = 0;
    let unmapped = 0;
    for (const fk of formKeys) {
      const fields = (mapObj[fk] || {}) as Record<string, any>;
      for (const [k, v] of Object.entries(fields)) {
        if (k === '_meta') continue;
        fieldCount++;
        if (!v?.profileKey) unmapped++;
      }
    }
    res.json({
      sessions: sessions.rows[0].sessions,
      filled: sessions.rows[0].filled,
      failed: sessions.rows[0].failed,
      corrections: corrections.rows[0].total,
      forms: formKeys.length,
      fields: fieldCount,
      unmapped,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sessions (optional workspace filter) ─────────────────────────────────────

router.get('/sessions', async (req: any, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
    const offset = parseInt(String(req.query.offset)) || 0;
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId
      ? req.query.workspaceId
      : null;
    const params: any[] = [];
    let where = '';
    if (workspaceId) {
      params.push(workspaceId);
      where = `WHERE s.workspace_id = $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await req.pool.query(
      `SELECT s.id, s.hostname, s.semantic_form_key AS "semanticFormKey",
              s.runtime_version AS "runtimeVersion",
              s.total_filled AS "totalFilled", s.total_failed AS "totalFailed",
              s.created_at AS "receivedAt",
              s.workspace_id AS "workspaceId",
              w.name AS "workspaceName"
       FROM sessions s
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sessions/:id', async (req: any, res) => {
  try {
    const { rows } = await req.pool.query(
      `SELECT s.id, s.hostname, s.semantic_form_key AS "semanticFormKey",
              s.runtime_version AS "runtimeVersion",
              s.total_filled AS "totalFilled", s.total_failed AS "totalFailed",
              s.records, s.created_at AS "receivedAt",
              s.workspace_id AS "workspaceId",
              w.name AS "workspaceName"
       FROM sessions s
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       WHERE s.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    if (row.records && !Array.isArray(row.records) && Array.isArray(row.records.records)) {
      row.metrics = row.records._metrics || null;
      row.records = row.records.records;
    }
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Corrections ──────────────────────────────────────────────────────────────

router.get('/corrections', async (req: any, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
    const offset = parseInt(String(req.query.offset)) || 0;
    const workspaceId = typeof req.query.workspaceId === 'string' && req.query.workspaceId
      ? req.query.workspaceId
      : null;
    const params: any[] = [];
    let where = '';
    if (workspaceId) {
      params.push(workspaceId);
      where = `WHERE c.workspace_id = $${params.length}`;
    }
    params.push(limit, offset);
    const { rows } = await req.pool.query(
      `SELECT c.id, c.hostname, c.semantic_form_key AS "semanticFormKey", c.trigger,
              jsonb_array_length(c.corrections) AS "correctionCount",
              c.created_at AS "receivedAt",
              c.workspace_id AS "workspaceId",
              w.name AS "workspaceName"
       FROM corrections c
       LEFT JOIN workspaces w ON w.id = c.workspace_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/corrections/:id', async (req: any, res) => {
  try {
    const { rows } = await req.pool.query(
      `SELECT c.id, c.hostname, c.semantic_form_key AS "semanticFormKey", c.trigger,
              c.corrections, c.created_at AS "receivedAt",
              c.workspace_id AS "workspaceId",
              w.name AS "workspaceName"
       FROM corrections c
       LEFT JOIN workspaces w ON w.id = c.workspace_id
       WHERE c.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Form mappings (global ext_kv) ────────────────────────────────────────────

router.get('/mappings/list', async (req: any, res) => {
  try {
    const data = await loadDoc(req.pool, MAPPINGS_KEY);
    let sessionMeta: Record<string, { hostname?: string; lastSession?: string }> = {};
    try {
      const { rows } = await req.pool.query(
        `SELECT semantic_form_key, hostname, MAX(created_at) as last_session
         FROM sessions
         WHERE semantic_form_key IS NOT NULL
         GROUP BY semantic_form_key, hostname`,
      );
      for (const r of rows) {
        if (!sessionMeta[r.semantic_form_key]) sessionMeta[r.semantic_form_key] = {};
        sessionMeta[r.semantic_form_key].hostname = r.hostname;
        sessionMeta[r.semantic_form_key].lastSession = r.last_session;
      }
    } catch { /* ignore */ }

    const list = Object.entries(data).map(([formKey, fields]: [string, any]) => {
      const entries = Object.entries(fields || {}).filter(([k]) => k !== '_meta');
      const fills = entries.reduce((s, [, m]: any) => s + (m?.fills || 0), 0);
      const corrections = entries.reduce((s, [, m]: any) => s + (m?.corrections || 0), 0);
      const lastSeen = entries.reduce((m: string | null, [, e]: any) => {
        if (e?.lastSeen && (!m || e.lastSeen > m)) return e.lastSeen;
        return m;
      }, null as string | null);
      const unmapped = entries.filter(([, m]: any) => !m?.profileKey).length;
      return {
        formKey,
        hostname: fields._meta?.hostname || sessionMeta[formKey]?.hostname || null,
        title: fields._meta?.title || null,
        fieldCount: entries.length,
        unmapped,
        fills,
        corrections,
        lastSeen,
      };
    }).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/mappings/translations', async (req: any, res) => {
  try {
    res.json(await loadDoc(req.pool, TRANSLATIONS_KEY));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/mappings/translations', async (req: any, res) => {
  const { entries } = req.body || {};
  if (!entries || typeof entries !== 'object') {
    return res.status(400).json({ error: 'entries object required' });
  }
  try {
    await mutateDoc(req.pool, TRANSLATIONS_KEY, (current) => {
      for (const [key, value] of Object.entries(entries)) {
        if (value === null || value === '') delete current[key];
        else current[key] = value;
      }
      return current;
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/mappings/:formKey', async (req: any, res) => {
  try {
    const data = await loadDoc(req.pool, MAPPINGS_KEY);
    res.json(data[req.params.formKey] || null);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/mappings/:formKey/:label', async (req: any, res) => {
  const { profileKey, fillMode, rules, constantValue, fallback, relation } = req.body || {};
  const formKey = req.params.formKey;
  const label = decodeURIComponent(req.params.label);
  const today = new Date().toISOString().slice(0, 10);
  try {
    let notFound = false;
    await mutateDoc(req.pool, MAPPINGS_KEY, (mappings) => {
      if (!mappings[formKey]) { notFound = true; return mappings; }
      const cur = mappings[formKey][label] || { fills: 0, corrections: 0 };
      if (profileKey !== undefined) cur.profileKey = profileKey || null;
      if (relation !== undefined) {
        cur.relation = relation;
      } else if (profileKey !== undefined) {
        cur.relation = profileKey ? { kind: 'identity' } : null;
      }
      if (fillMode !== undefined) cur.fillMode = fillMode || null;
      if (rules !== undefined) cur.rules = rules || null;
      if (constantValue !== undefined) cur.constantValue = constantValue;
      if (fallback !== undefined) cur.fallback = fallback;
      cur.lastSeen = today;
      cur.source = 'manual';
      mappings[formKey][label] = cur;
      return mappings;
    });
    if (notFound) return res.status(404).json({ error: 'formKey not found' });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/mappings/:formKey/:label', async (req: any, res) => {
  const formKey = req.params.formKey;
  const label = decodeURIComponent(req.params.label);
  try {
    await mutateDoc(req.pool, MAPPINGS_KEY, (mappings) => {
      if (mappings[formKey]?.[label]) delete mappings[formKey][label];
      return mappings;
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/mappings/:formKey', async (req: any, res) => {
  try {
    await mutateDoc(req.pool, MAPPINGS_KEY, (mappings) => {
      if (mappings[req.params.formKey]) delete mappings[req.params.formKey];
      return mappings;
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
