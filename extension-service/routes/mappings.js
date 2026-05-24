import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../auth.js';
import { pool } from '../db.js';
import { guessProfileKey } from './label-mapper.js';

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
// Reverse-looks-up profileKey from each record's value against that session's
// profile, so fields are PRE-MAPPED with the best guess. Pre-existing manual
// assignments are never overwritten.
router.post('/backfill', authMiddleware, async (req, res) => {
  const targetFormKey = req.body?.formKey || null;
  let seededTotal = 0;
  let formsSeeded = 0;
  let mappedTotal = 0;
  try {
    const sql = targetFormKey
      ? `SELECT s.semantic_form_key, s.hostname, s.records, s.profile_id, p.data as profile_data
         FROM sessions s LEFT JOIN profiles p ON p.id = s.profile_id
         WHERE s.semantic_form_key = $1 AND s.records IS NOT NULL ORDER BY s.created_at DESC`
      : `SELECT s.semantic_form_key, s.hostname, s.records, s.profile_id, p.data as profile_data
         FROM sessions s LEFT JOIN profiles p ON p.id = s.profile_id
         WHERE s.semantic_form_key IS NOT NULL AND s.records IS NOT NULL ORDER BY s.created_at DESC`;
    const params = targetFormKey ? [targetFormKey] : [];
    const { rows } = await pool.query(sql, params);

    const all = load();
    const today = new Date().toISOString().slice(0, 10);

    function normLabel(s) {
      return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // Flatten profile data jsonb into {key: stringValue} for reverse-lookup
    function flattenProfile(p) {
      if (!p) return {};
      const out = {};
      for (const [k, v] of Object.entries(p)) {
        if (v == null) continue;
        if (typeof v === 'object' && 'value' in v) out[k] = String(v.value);
        else if (typeof v !== 'object') out[k] = String(v);
      }
      return out;
    }
    function reverseLookup(profile, value) {
      if (!profile || !value) return null;
      const v = String(value);
      const vNorm = v.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!vNorm) return null;
      // Exact match first
      for (const [k, pv] of Object.entries(profile)) {
        if (String(pv) === v) return k;
      }
      // Normalised match (for spacing/case differences)
      for (const [k, pv] of Object.entries(profile)) {
        const pvNorm = String(pv).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (pvNorm && pvNorm === vNorm) return k;
      }
      return null;
    }

    for (const row of rows) {
      const formKey = row.semantic_form_key;
      const profile = flattenProfile(row.profile_data);
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
        const existing = all[formKey][semKey];
        // Don't overwrite manual assignments
        if (existing && existing.source === 'manual') continue;
        // Try to determine profileKey from r.profileKey first, then reverse-lookup, then label heuristic
        let profileKey = r.profileKey || null;
        let source = 'backfill';
        if (!profileKey && r.value) profileKey = reverseLookup(profile, r.value);
        if (!profileKey) {
          // Fall back to label-based guess (server-side mirror of mapper.js aliases)
          profileKey = guessProfileKey(r.label);
          if (profileKey) source = 'heuristic';
        }

        if (!existing) {
          all[formKey][semKey] = {
            profileKey: profileKey || null,
            fills: 0, corrections: 0,
            lastSeen: today,
            source: profileKey ? source : 'seed',
          };
          formSeeded++;
          if (profileKey) mappedTotal++;
        } else if (!existing.profileKey && profileKey) {
          existing.profileKey = profileKey;
          existing.source = source;
          existing.lastSeen = today;
          mappedTotal++;
        }
      }
      if (formSeeded > 0) formsSeeded++;
      seededTotal += formSeeded;
    }
    save(all);
    res.json({ ok: true, formsSeeded, seededTotal, mappedTotal });
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
