import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../auth.js';
import { pool } from '../db.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '../data');
const MAPPINGS_PATH = resolve(DATA_DIR, 'form_mappings.json');

function load() {
  if (!existsSync(MAPPINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(MAPPINGS_PATH, 'utf8')); } catch { return {}; }
}
function save(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MAPPINGS_PATH, JSON.stringify(data, null, 2));
}

// POST /api/mappings/backfill — seed mappings from past sessions for a formKey
// (or all formKeys) so the admin UI shows EVERY field ever seen on a form.
// Pre-existing profileKey assignments are never overwritten.
router.post('/backfill', authMiddleware, async (req, res) => {
  const targetFormKey = req.body?.formKey || null;
  let seededTotal = 0;
  let formsSeeded = 0;
  try {
    const sql = targetFormKey
      ? `SELECT semantic_form_key, hostname, records FROM sessions WHERE semantic_form_key = $1 AND records IS NOT NULL ORDER BY created_at DESC`
      : `SELECT semantic_form_key, hostname, records FROM sessions WHERE semantic_form_key IS NOT NULL AND records IS NOT NULL ORDER BY created_at DESC`;
    const params = targetFormKey ? [targetFormKey] : [];
    const { rows } = await pool.query(sql, params);

    const all = load();
    const today = new Date().toISOString().slice(0, 10);

    function normLabel(s) {
      return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    for (const row of rows) {
      const formKey = row.semantic_form_key;
      if (!all[formKey]) all[formKey] = {};
      if (!all[formKey]._meta) all[formKey]._meta = { firstSeen: today };
      all[formKey]._meta.hostname = all[formKey]._meta.hostname || row.hostname;
      all[formKey]._meta.lastSeen = today;
      let formSeeded = 0;
      const records = Array.isArray(row.records) ? row.records : [];
      for (const r of records) {
        if (!r || !r.label) continue;
        const semKey = normLabel(r.label);
        if (!semKey) continue;
        if (!all[formKey][semKey]) {
          all[formKey][semKey] = { profileKey: null, fills: 0, corrections: 0, lastSeen: today, source: 'backfill' };
          formSeeded++;
        }
      }
      if (formSeeded > 0) formsSeeded++;
      seededTotal += formSeeded;
    }
    save(all);
    res.json({ ok: true, formsSeeded, seededTotal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mappings/list — all formKeys with metadata + hostname from sessions
router.get('/list', authMiddleware, async (_req, res) => {
  const data = load();

  // Backfill hostname/title from sessions table for entries that don't have _meta
  // (existing mappings created before agent v5.79 don't have _meta.hostname)
  let sessionMeta = {};
  try {
    const { rows } = await pool.query(
      `SELECT semantic_form_key, hostname, MAX(created_at) as last_session
       FROM sessions
       WHERE semantic_form_key IS NOT NULL
       GROUP BY semantic_form_key, hostname`
    );
    for (const r of rows) {
      if (!sessionMeta[r.semantic_form_key]) sessionMeta[r.semantic_form_key] = {};
      sessionMeta[r.semantic_form_key].hostname = r.hostname;
      sessionMeta[r.semantic_form_key].lastSession = r.last_session;
    }
  } catch (e) { /* ignore — sessions table missing or DB down */ }

  const list = Object.entries(data).map(([formKey, fields]) => {
    const entries = Object.entries(fields || {}).filter(([k]) => k !== '_meta');
    const fills = entries.reduce((s, [, m]) => s + (m?.fills || 0), 0);
    const corrections = entries.reduce((s, [, m]) => s + (m?.corrections || 0), 0);
    const lastSeen = entries.reduce((m, [, e]) => {
      if (e?.lastSeen && (!m || e.lastSeen > m)) return e.lastSeen;
      return m;
    }, null);
    const unmapped = entries.filter(([, m]) => !m?.profileKey).length;
    return {
      formKey,
      hostname: fields._meta?.hostname || sessionMeta[formKey]?.hostname || null,
      title: fields._meta?.title || null,
      fieldCount: entries.length,
      unmapped,
      fills, corrections, lastSeen,
    };
  }).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  res.json(list);
});

// GET /api/mappings — list all form keys (legacy, used by extension)
router.get('/', (_req, res) => {
  res.json(Object.keys(load()).filter(k => k !== '_meta'));
});

// GET /api/mappings/:formKey
router.get('/:formKey', (req, res) => {
  const mappings = load();
  res.json(mappings[req.params.formKey] || null);
});

// POST /api/mappings/:formKey — bulk update with confidence
router.post('/:formKey', (req, res) => {
  const { updates, meta } = req.body || {};
  if (!updates && !meta) return res.status(400).json({ error: 'updates or meta required' });
  const mappings = load();
  const formKey = req.params.formKey;
  if (!mappings[formKey]) mappings[formKey] = {};
  const today = new Date().toISOString().slice(0, 10);
  if (meta) {
    mappings[formKey]._meta = { ...(mappings[formKey]._meta || {}), ...meta, lastSeen: today };
  }
  if (updates) {
    for (const [semanticKey, info] of Object.entries(updates)) {
      const { profileKey, delta = {} } = info;
      const existing = mappings[formKey][semanticKey];
      if (existing) {
        existing.fills = (existing.fills || 0) + (delta.fills || 0);
        existing.corrections = (existing.corrections || 0) + (delta.corrections || 0);
        existing.profileKey = profileKey;
        existing.lastSeen = today;
      } else {
        mappings[formKey][semanticKey] = {
          profileKey,
          fills: delta.fills || 0,
          corrections: delta.corrections || 0,
          lastSeen: today,
        };
      }
    }
  }
  save(mappings);
  res.json({ ok: true });
});

// PATCH /api/mappings/:formKey/:label — update ONE field's profileKey
// (used by the admin UI's per-row edit)
router.patch('/:formKey/:label', authMiddleware, (req, res) => {
  const { profileKey } = req.body || {};
  const mappings = load();
  const formKey = req.params.formKey;
  const label = req.params.label;
  if (!mappings[formKey]) return res.status(404).json({ error: 'formKey not found' });
  if (!mappings[formKey][label]) {
    mappings[formKey][label] = { profileKey, fills: 0, corrections: 0, lastSeen: new Date().toISOString().slice(0, 10), source: 'manual' };
  } else {
    mappings[formKey][label].profileKey = profileKey || null;
    mappings[formKey][label].lastSeen = new Date().toISOString().slice(0, 10);
    mappings[formKey][label].source = 'manual';
  }
  save(mappings);
  res.json({ ok: true });
});

// DELETE /api/mappings/:formKey/:label — remove ONE bad mapping
router.delete('/:formKey/:label', authMiddleware, (req, res) => {
  const mappings = load();
  const formKey = req.params.formKey;
  const label = req.params.label;
  if (mappings[formKey] && mappings[formKey][label]) {
    delete mappings[formKey][label];
    save(mappings);
  }
  res.json({ ok: true });
});

// DELETE /api/mappings/:formKey — remove an entire form's mappings
router.delete('/:formKey', authMiddleware, (req, res) => {
  const mappings = load();
  if (mappings[req.params.formKey]) {
    delete mappings[req.params.formKey];
    save(mappings);
  }
  res.json({ ok: true });
});

export default router;
