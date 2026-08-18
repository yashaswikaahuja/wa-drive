// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Knowledge Sync API (Phase 2.7, Issue #91)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Implements the sync protocol defined in architecture/sync-protocol.yml.
//
// Endpoints:
//   POST /api/sync/bootstrap — full knowledge download
//   POST /api/sync/delta     — incremental update
//   POST /api/sync/check     — cache freshness check
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import { pool } from '../../db/db.js';
import { ensureKnowledgeSchema } from '../../engines/knowledge-store.js';
import { createHash } from 'node:crypto';

const router = Router();

// ── Manifest version generation ─────────────────────────────────────

async function getCurrentManifestVersion() {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    `SELECT MAX(updated_at) as latest FROM knowledge_records WHERE status IN ('active','validated')`
  );
  const latest = rows[0]?.latest;
  if (!latest) return '0.empty';
  const ts = Math.floor(new Date(latest).getTime() / 1000);
  const hash = createHash('sha256').update(String(ts)).digest('hex').slice(0, 7);
  return `${ts}.${hash}`;
}

// ── Bootstrap ───────────────────────────────────────────────────────

router.post('/bootstrap', authMiddleware, async (req, res) => {
  try {
    await ensureKnowledgeSchema();
    const { context, extension_version, schema_version, capabilities } = req.body || {};
    const orgId = req.user?.workspaceId;
    const portalId = context?.portal_id || null;
    const formKey = context?.form_key || null;
    const country = context?.country || null;

    // Fetch all active/validated records that apply to this context
    const { rows } = await pool.query(`
      SELECT * FROM knowledge_records
      WHERE status IN ('active','validated')
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          scope_level = 'global'
          OR (scope_level = 'country' AND scope_country = $1)
          OR (scope_level = 'organization' AND scope_org_id = $2)
          OR (scope_level = 'portal' AND scope_portal_id = $3)
          OR (scope_level = 'portal_form' AND scope_portal_id = $3 AND scope_form_key = $4)
        )
    `, [country || '__none__', orgId || '00000000-0000-0000-0000-000000000000', portalId || '__none__', formKey || '__none__']);

    // Filter by requested capabilities (kinds the extension can consume)
    const allowedKinds = capabilities?.length ? new Set(capabilities) : null;
    const filtered = allowedKinds ? rows.filter(r => allowedKinds.has(r.kind)) : rows;

    // Build resolved artifacts
    const artifacts = buildArtifacts(filtered);
    const manifestVersion = await getCurrentManifestVersion();

    res.json({
      manifest_version: manifestVersion,
      generated_at: new Date().toISOString(),
      schema_version: '1.0.0',
      artifacts,
      record_count: filtered.length,
      scope_context: { resolved_portal: portalId, resolved_country: country },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delta ───────────────────────────────────────────────────────────

router.post('/delta', authMiddleware, async (req, res) => {
  try {
    await ensureKnowledgeSchema();
    const { manifest_version, context } = req.body || {};

    if (!manifest_version) {
      return res.status(400).json({ error: 'manifest_expired', action: 'bootstrap' });
    }

    // Parse timestamp from manifest_version
    const ts = parseInt(manifest_version.split('.')[0], 10);
    if (!ts || isNaN(ts)) {
      return res.json({ error: 'manifest_expired', action: 'bootstrap' });
    }

    const sinceDate = new Date(ts * 1000);
    const orgId = req.user?.workspaceId;
    const portalId = context?.portal_id || null;

    // Find records added/updated since the manifest timestamp
    const { rows: updated } = await pool.query(`
      SELECT * FROM knowledge_records
      WHERE updated_at > $1
        AND (
          scope_level = 'global'
          OR (scope_level = 'organization' AND scope_org_id = $2)
          OR (scope_level = 'portal' AND scope_portal_id = $3)
          OR (scope_level = 'portal_form' AND scope_portal_id = $3)
        )
    `, [sinceDate, orgId || '00000000-0000-0000-0000-000000000000', portalId || '__none__']);

    const added = [];
    const changed = [];
    const removed = [];

    for (const row of updated) {
      const entry = { kind: row.kind, key: entityKey(row), data: row.payload };
      if (row.status === 'deprecated' || row.status === 'superseded') {
        removed.push({ kind: row.kind, key: entityKey(row) });
      } else if (new Date(row.created_at) > sinceDate) {
        added.push(entry);
      } else {
        changed.push(entry);
      }
    }

    const currentVersion = await getCurrentManifestVersion();

    res.json({
      manifest_version: currentVersion,
      previous_version: manifest_version,
      changes: { added, updated: changed, removed },
      change_count: added.length + changed.length + removed.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cache check ─────────────────────────────────────────────────────

router.post('/check', authMiddleware, async (req, res) => {
  try {
    const { manifest_version } = req.body || {};
    if (!manifest_version) {
      return res.json({ fresh: false, current_version: null, recommendation: 'bootstrap' });
    }

    const currentVersion = await getCurrentManifestVersion();
    const fresh = manifest_version === currentVersion;

    // Calculate age
    const ts = parseInt(manifest_version.split('.')[0], 10);
    const ageSeconds = ts ? Math.floor(Date.now() / 1000) - ts : Infinity;

    let recommendation = 'ok';
    if (!fresh && ageSeconds > 86400) recommendation = 'bootstrap';
    else if (!fresh) recommendation = 'delta';

    res.json({
      fresh,
      current_version: currentVersion,
      age_seconds: ageSeconds === Infinity ? null : ageSeconds,
      recommendation,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

function buildArtifacts(records) {
  const artifacts = {
    semantic_aliases: {},
    field_mappings: [],
    option_translations: [],
    component_adapters: [],
  };

  for (const row of records) {
    const p = row.payload || {};

    switch (row.kind) {
      case 'synonym':
        if (p.canonical && p.variants) {
          if (!artifacts.semantic_aliases[p.canonical]) artifacts.semantic_aliases[p.canonical] = [];
          artifacts.semantic_aliases[p.canonical].push(...p.variants);
        }
        break;

      case 'field_mapping':
        artifacts.field_mappings.push({
          semantic_key: p.semantic_key,
          profile_key: p.profile_key,
          match_patterns: p.match_patterns || [],
          field_type: p.field_type || null,
          confidence: parseFloat(row.confidence),
        });
        break;

      case 'option_translation':
        artifacts.option_translations.push({
          field_semantic_key: p.field_semantic_key,
          profile_value: p.profile_value,
          option_text: p.option_text,
        });
        break;

      case 'component_adapter':
        artifacts.component_adapters.push({
          component_class: p.component_class,
          detection: p.detection || {},
          interaction: p.interaction || {},
          events: p.events || null,
        });
        break;
    }
  }

  return artifacts;
}

function entityKey(row) {
  const p = row.payload || {};
  return p.semantic_key || p.canonical || p.component_class || p.capability_name || p.hostname || row.id;
}

export default router;
