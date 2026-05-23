import { Router } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || resolve(__dirname, '../data');
const MAPPINGS_PATH = resolve(DATA_DIR, 'form_mappings.json');

function loadMappings() {
  if (!existsSync(MAPPINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(MAPPINGS_PATH, 'utf8')); } catch { return {}; }
}
function saveMappings(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MAPPINGS_PATH, JSON.stringify(data, null, 2));
}

const normLabel = l => (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

// Label-↔-profileKey similarity score. Higher = more likely the label is asking for that key.
function labelKeyAffinity(labelLower, profileKey) {
  const pk = (profileKey || '').toLowerCase();
  const tokens = pk.split('_').filter(t => t.length > 1);
  if (!tokens.length) return 0;
  let score = 0;
  for (const t of tokens) {
    if (labelLower.includes(t)) score++;
  }
  // Strong opposite-direction hints — penalize obvious mismatches
  // e.g. label "police station" vs profileKey "block" → 0
  return score;
}

/**
 * Given a profile's data jsonb, an operator-entered value, and the field's label,
 * find which profile key has that value AND has a label-compatible name.
 * Returns the matching profileKey or null.
 *
 * Safety:
 *   - Skips promotion if the value matches multiple profile keys (ambiguous)
 *   - Skips promotion if the chosen key has zero label affinity
 *     AND another key in the data has positive affinity (label contradicts)
 */
function findProfileKeyForValue(profileData, operatorValue, fieldLabel) {
  if (!operatorValue || !profileData || typeof profileData !== 'object') return null;
  const target = String(operatorValue).trim().toLowerCase();
  if (target.length < 2) return null;
  const labelLower = (fieldLabel || '').toLowerCase();

  const exactMatches = [];
  const fuzzyMatches = [];

  for (const [key, raw] of Object.entries(profileData)) {
    const val = (raw && typeof raw === 'object' && 'value' in raw) ? raw.value : raw;
    if (val == null) continue;
    const cmp = String(val).trim().toLowerCase();
    if (!cmp) continue;
    if (cmp === target) {
      exactMatches.push({ key, affinity: labelKeyAffinity(labelLower, key) });
    } else if (cmp.length >= 3 && (cmp.includes(target) || target.includes(cmp))) {
      fuzzyMatches.push({ key, affinity: labelKeyAffinity(labelLower, key) });
    }
  }

  // Prefer exact matches over fuzzy
  const candidates = exactMatches.length ? exactMatches : fuzzyMatches;
  if (!candidates.length) return null;

  // If only one match — use it but ONLY if either:
  //   - label has positive affinity, OR
  //   - no profile key has positive affinity for this label (so we can't disambiguate via label, accept)
  if (candidates.length === 1) {
    const sole = candidates[0];
    if (sole.affinity > 0) return sole.key;
    // Check if any OTHER profile key has affinity to the label — if yes, reject (label contradicts)
    for (const [k] of Object.entries(profileData)) {
      if (k === sole.key) continue;
      if (labelKeyAffinity(labelLower, k) > 0) return null;
    }
    return sole.key;
  }

  // Multiple candidates — pick the one with highest label affinity, but only if it's STRICTLY better
  candidates.sort((a, b) => b.affinity - a.affinity);
  if (candidates[0].affinity > 0 && candidates[0].affinity > (candidates[1]?.affinity || 0)) {
    return candidates[0].key;
  }
  // Ambiguous — skip
  return null;
}

// POST /api/corrections — operator supervised corrections
// + auto-promote: for each correction whose final value matches a profile field,
// save a (formKey, fieldLabel) -> profileKey mapping so future autofills get it right.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { hostname, semanticFormKey, trigger, corrections, runtimeVersion, profileId } = req.body;
    const insR = await pool.query(
      `INSERT INTO corrections (workspace_id, user_id, profile_id, hostname, semantic_form_key, trigger, runtime_version, corrections)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.user.workspaceId, req.user.userId, profileId || null, hostname, semanticFormKey || null, trigger, runtimeVersion || null, JSON.stringify(corrections || [])]
    );
    const correctionId = insR.rows[0].id;

    // ── Auto-promote ──────────────────────────────────────────────────────
    let promoted = 0;
    if (profileId && semanticFormKey && Array.isArray(corrections) && corrections.length) {
      try {
        const pR = await pool.query(
          'SELECT data FROM profiles WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL',
          [profileId, req.user.workspaceId]
        );
        const profileData = pR.rows[0]?.data || {};
        const mappings = loadMappings();
        const formKey = semanticFormKey;
        if (!mappings[formKey]) mappings[formKey] = {};
        const today = new Date().toISOString().slice(0, 10);

        for (const c of corrections) {
          const operatorValue = c.finalOperatorValue || c.operatorValue;
          if (!operatorValue) continue;
          const profileKey = findProfileKeyForValue(profileData, operatorValue, c.field || c.label);
          if (!profileKey) continue;
          const semanticKey = normLabel(c.field || c.label);
          if (!semanticKey) continue;

          const existing = mappings[formKey][semanticKey];
          if (existing && existing.profileKey === profileKey) {
            // Confirm existing mapping (boost confidence)
            existing.fills = (existing.fills || 0) + 1;
            existing.lastSeen = today;
          } else {
            // New or changed mapping (operator overrode the previous)
            mappings[formKey][semanticKey] = {
              profileKey,
              fills: 1,
              corrections: existing?.corrections ? existing.corrections + 1 : 1,
              lastSeen: today,
              source: 'auto-correction',
            };
          }
          promoted++;
        }
        if (promoted > 0) saveMappings(mappings);
      } catch (e) {
        console.warn('[ext/corrections] auto-promote failed:', e.message);
      }
    }

    res.json({ ok: true, id: correctionId, promotedMappings: promoted });
  } catch (e) {
    console.error('[ext/corrections] post:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/corrections — list summaries
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey", trigger,
              jsonb_array_length(corrections) AS "correctionCount",
              created_at AS "receivedAt"
       FROM corrections
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.workspaceId, limit, offset]
    );
    res.json(rows);
  } catch (e) {
    console.error('[ext/corrections] list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/corrections/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, hostname, semantic_form_key AS "semanticFormKey", trigger,
              corrections, created_at AS "receivedAt"
       FROM corrections
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.user.workspaceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[ext/corrections] get:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
