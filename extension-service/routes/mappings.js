import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { pool } from '../db.js';
import { guessProfileKey } from './label-mapper.js';
import { loadDoc, saveDoc, mutateDoc, KEYS } from '../store.js';

const router = Router();

const load = () => loadDoc(KEYS.MAPPINGS);
const mutate = (fn) => mutateDoc(KEYS.MAPPINGS, fn);

// POST /api/mappings/cleanup — remove junk/short entries from existing mappings
router.post('/cleanup', authMiddleware, async (_req, res) => {
  let removed = 0;
  await mutate((all) => {
    for (const formKey of Object.keys(all)) {
      const fields = all[formKey];
      for (const key of Object.keys(fields)) {
        if (key === '_meta') continue;
        const lbl = fields[key].label || key;
        const trimmed = String(lbl).trim();
        // Same filters as seed: too short OR no letters at all
        if (trimmed.length < 3 || !/[a-zA-Z\u0900-\u097F]/.test(trimmed)) {
          delete fields[key];
          removed++;
        }
      }
    }
    return all;
  });
  res.json({ ok: true, removed });
});

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

    const today = new Date().toISOString().slice(0, 10);
    await mutate((all) => {

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
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        if (!r || !r.label) continue;
        const trimmedLabel = String(r.label).trim();
        if (trimmedLabel.length < 3) continue;
        if (!/[a-zA-Z\u0900-\u097F]/.test(trimmedLabel)) continue;
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
          profileKey = guessProfileKey(r.label);
          if (profileKey) source = 'heuristic';
        }
        // Determine field type from session record
        const recType = r.type || 'text';
        const normalisedType = recType === 'select' || recType === 'ng-dropdown' ? 'dropdown'
          : recType === 'radio' ? 'radio'
          : recType === 'checkbox' || recType === 'mat-checkbox' ? 'checkbox'
          : recType === 'textarea' ? 'text'
          : 'text';

        if (!existing) {
          all[formKey][semKey] = {
            label: r.label,
            type: normalisedType,
            order: i,
            profileKey: profileKey || null,
            fills: 0, corrections: 0,
            lastSeen: today,
            source: profileKey ? source : 'seed',
          };
          formSeeded++;
          if (profileKey) mappedTotal++;
        } else {
          if (!existing.label) existing.label = r.label;
          if (!existing.type) existing.type = normalisedType;
          if (existing.order === undefined) existing.order = i;
          if (!existing.profileKey && profileKey) {
            existing.profileKey = profileKey;
            existing.source = source;
            existing.lastSeen = today;
            mappedTotal++;
          }
        }
      }
      if (formSeeded > 0) formsSeeded++;
      seededTotal += formSeeded;
    }
      return all;
    });
    res.json({ ok: true, formsSeeded, seededTotal, mappedTotal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/mappings/list — all formKeys with metadata + hostname from sessions
router.get('/list', authMiddleware, async (_req, res) => {
  const data = await load();

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
router.get('/', async (_req, res) => {
  res.json(Object.keys(await load()).filter(k => k !== '_meta'));
});

// ── Global value translations ──────────────────────────────────────────────────
// Used by the extension at fill time to match profile values to form option text.
// Stored as: { profileValue: formOptionText, ... }
// Example: { "OBC": "Other Backward Class", "SC": "Scheduled Caste", "Male": "पुरुष" }

const TRANSLATIONS_KEY = 'value_translations';

// GET /api/mappings/translations — return all translations
router.get('/translations', async (_req, res) => {
  const data = await loadDoc(TRANSLATIONS_KEY);
  res.json(data || {});
});

// POST /api/mappings/translations — bulk save translations
router.post('/translations', authMiddleware, async (req, res) => {
  const { translations } = req.body || {};
  if (!translations || typeof translations !== 'object') return res.status(400).json({ error: 'translations object required' });
  await saveDoc(TRANSLATIONS_KEY, translations);
  res.json({ ok: true });
});

// PATCH /api/mappings/translations — add/update individual entries
router.patch('/translations', authMiddleware, async (req, res) => {
  const { entries } = req.body || {};
  if (!entries || typeof entries !== 'object') return res.status(400).json({ error: 'entries object required' });
  await mutateDoc(TRANSLATIONS_KEY, (current) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === '') {
        delete current[key];
      } else {
        current[key] = value;
      }
    }
    return current;
  });
  res.json({ ok: true });
});

// GET /api/mappings/:formKey
router.get('/:formKey', async (req, res) => {
  const mappings = await load();
  res.json(mappings[req.params.formKey] || null);
});

// POST /api/mappings/:formKey — bulk update with confidence
router.post('/:formKey', async (req, res) => {
  const { updates, meta } = req.body || {};
  if (!updates && !meta) return res.status(400).json({ error: 'updates or meta required' });
  const formKey = req.params.formKey;
  const today = new Date().toISOString().slice(0, 10);
  await mutate((mappings) => {
    if (!mappings[formKey]) mappings[formKey] = {};
    if (meta) {
      mappings[formKey]._meta = { ...(mappings[formKey]._meta || {}), ...meta, lastSeen: today };
    }
    if (updates) {
      // Sources that a background sync must NOT overwrite (set by admin/owner review).
      const PROTECTED = new Set(['manual', 'confirmed']);
      for (const [semanticKey, info] of Object.entries(updates)) {
        const { profileKey, delta = {}, label, type, order, options,
                fillMode, rules, constantValue, fallback } = info;
        const existing = mappings[formKey][semanticKey];
        if (existing) {
          existing.fills = (existing.fills || 0) + (delta.fills || 0);
          existing.corrections = (existing.corrections || 0) + (delta.corrections || 0);
          const locked = PROTECTED.has(existing.source);
          // profileKey + rule config are only overwritten when the field isn't locked
          if (profileKey !== undefined && !locked) existing.profileKey = profileKey;
          if (fillMode !== undefined && !locked) existing.fillMode = fillMode;
          if (rules !== undefined && !locked) existing.rules = rules;
          if (constantValue !== undefined && !locked) existing.constantValue = constantValue;
          if (fallback !== undefined && !locked) existing.fallback = fallback;
          // Structural metadata (label/type/order/options) always refreshes from the live form
          if (label) existing.label = label;
          if (type) existing.type = type;
          if (order !== undefined) existing.order = order;
          if (options) existing.options = options;
          existing.lastSeen = today;
        } else {
          mappings[formKey][semanticKey] = {
            profileKey: profileKey || null,
            label: label || null,
            type: type || 'text',
            order: order !== undefined ? order : null,
            options: options || null,
            fillMode: fillMode || null,
            rules: rules || null,
            constantValue: constantValue !== undefined ? constantValue : null,
            fallback: fallback !== undefined ? fallback : null,
            fills: delta.fills || 0,
            corrections: delta.corrections || 0,
            lastSeen: today,
            source: profileKey ? 'agent' : 'seed',
          };
        }
      }
    }
    return mappings;
  });
  res.json({ ok: true });
});

// PATCH /api/mappings/:formKey/:label — update ONE field's mapping/rule config
// (used by the admin UI's per-row edit + rule builder). Stored as source:'manual'
// so the extension's background sync never overwrites it.
router.patch('/:formKey/:label', authMiddleware, async (req, res) => {
  const { profileKey, fillMode, rules, constantValue, fallback } = req.body || {};
  const formKey = req.params.formKey;
  const label = req.params.label;
  const today = new Date().toISOString().slice(0, 10);
  let notFound = false;
  await mutate((mappings) => {
    if (!mappings[formKey]) { notFound = true; return mappings; }
    const cur = mappings[formKey][label] || { fills: 0, corrections: 0 };
    if (profileKey !== undefined) cur.profileKey = profileKey || null;
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
});

// DELETE /api/mappings/:formKey/:label — remove ONE bad mapping
router.delete('/:formKey/:label', authMiddleware, async (req, res) => {
  const formKey = req.params.formKey;
  const label = req.params.label;
  await mutate((mappings) => {
    if (mappings[formKey] && mappings[formKey][label]) {
      delete mappings[formKey][label];
    }
    return mappings;
  });
  res.json({ ok: true });
});

// DELETE /api/mappings/:formKey — remove an entire form's mappings
router.delete('/:formKey', authMiddleware, async (req, res) => {
  await mutate((mappings) => {
    if (mappings[req.params.formKey]) {
      delete mappings[req.params.formKey];
    }
    return mappings;
  });
  res.json({ ok: true });
});

export default router;
