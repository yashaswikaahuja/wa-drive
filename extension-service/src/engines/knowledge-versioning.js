// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Knowledge Versioning (Phase 2.6, Issue #90)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Makes knowledge changes safe to publish, preview, roll back, and migrate.
//
// Features:
//   - Version lifecycle: draft → published → deprecated
//   - Snapshot: capture full state for rollback
//   - Restore: roll back to a previous snapshot
//   - Compatibility: check if new records break existing queries
//   - Migration: plan schema evolution for older records
//   - Lineage tracking: full history per knowledge entity
//
// Server-side only. Does not leak into extension.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { pool } from '../db/db.js';
import { ensureKnowledgeSchema } from './knowledge-store.js';
import { randomUUID } from 'node:crypto';

// ── Schema bootstrap ────────────────────────────────────────────────

let versionSchemaReady = null;

export function ensureVersionSchema() {
  if (versionSchemaReady) return versionSchemaReady;
  versionSchemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_snapshots (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name          text NOT NULL,
      description   text,
      record_count  integer NOT NULL DEFAULT 0,
      snapshot_data jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at    timestamptz NOT NULL DEFAULT now(),
      created_by    text
    );
    CREATE TABLE IF NOT EXISTS knowledge_migrations (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_version  text NOT NULL,
      to_version    text NOT NULL,
      status        text NOT NULL DEFAULT 'planned'
                      CHECK (status IN ('planned','in_progress','completed','failed','rolled_back')),
      plan          jsonb NOT NULL DEFAULT '{}'::jsonb,
      results       jsonb,
      created_at    timestamptz NOT NULL DEFAULT now(),
      completed_at  timestamptz
    )
  `).then(() => {
    console.log('[knowledge-versioning] tables ready');
  }).catch(e => {
    versionSchemaReady = null;
    console.error('[knowledge-versioning] schema failed:', e.message);
    throw e;
  });
  return versionSchemaReady;
}

// ── Version lifecycle ───────────────────────────────────────────────

const LIFECYCLE_TRANSITIONS = {
  draft:      ['active', 'deprecated'],
  active:     ['validated', 'deprecated', 'superseded'],
  validated:  ['deprecated', 'superseded'],
  deprecated: [],
  superseded: [],
};

/**
 * Publish a draft record (draft → active).
 */
export async function publish(recordId) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    `UPDATE knowledge_records SET status = 'active', updated_at = now()
     WHERE id = $1 AND status = 'draft' RETURNING id, status`,
    [recordId]
  );
  if (!rows.length) throw new Error(`Cannot publish: record ${recordId} not found or not in draft`);
  return { id: recordId, status: 'active', action: 'published' };
}

/**
 * Validate/promote an active record (active → validated).
 */
export async function promote(recordId) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    `UPDATE knowledge_records SET status = 'validated', updated_at = now()
     WHERE id = $1 AND status = 'active' RETURNING id, status`,
    [recordId]
  );
  if (!rows.length) throw new Error(`Cannot promote: record ${recordId} not found or not active`);
  return { id: recordId, status: 'validated', action: 'promoted' };
}

/**
 * Deprecate a record (any active/validated → deprecated).
 */
export async function deprecate(recordId) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    `UPDATE knowledge_records SET status = 'deprecated', updated_at = now()
     WHERE id = $1 AND status IN ('active','validated') RETURNING id, status`,
    [recordId]
  );
  if (!rows.length) throw new Error(`Cannot deprecate: record ${recordId} not found or already terminal`);
  return { id: recordId, status: 'deprecated', action: 'deprecated' };
}

// ── Snapshots ───────────────────────────────────────────────────────

/**
 * Create a snapshot of all active/validated records.
 */
export async function createSnapshot(name, description, createdBy) {
  await ensureKnowledgeSchema();
  await ensureVersionSchema();

  const { rows: records } = await pool.query(
    `SELECT * FROM knowledge_records WHERE status IN ('active','validated')`
  );

  const snapshotId = randomUUID();
  await pool.query(
    `INSERT INTO knowledge_snapshots (id, name, description, record_count, snapshot_data, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [snapshotId, name, description || null, records.length, JSON.stringify(records), createdBy || null]
  );

  return { id: snapshotId, name, record_count: records.length, created_at: new Date().toISOString() };
}

/**
 * List all snapshots.
 */
export async function listSnapshots() {
  await ensureVersionSchema();
  const { rows } = await pool.query(
    `SELECT id, name, description, record_count, created_at, created_by
     FROM knowledge_snapshots ORDER BY created_at DESC`
  );
  return rows;
}

/**
 * Restore a snapshot: deprecate all current active/validated, then re-insert from snapshot.
 */
export async function restoreSnapshot(snapshotId) {
  await ensureKnowledgeSchema();
  await ensureVersionSchema();

  const { rows } = await pool.query(
    `SELECT snapshot_data FROM knowledge_snapshots WHERE id = $1`, [snapshotId]
  );
  if (!rows.length) throw new Error(`Snapshot not found: ${snapshotId}`);

  const snapshotRecords = rows[0].snapshot_data;
  if (!Array.isArray(snapshotRecords)) throw new Error('Invalid snapshot data');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Deprecate all current active/validated records
    const { rowCount: deprecated } = await client.query(
      `UPDATE knowledge_records SET status = 'deprecated', updated_at = now()
       WHERE status IN ('active','validated')`
    );

    // Re-insert snapshot records with new IDs and active status
    let restored = 0;
    for (const record of snapshotRecords) {
      await client.query(
        `INSERT INTO knowledge_records
          (id, kind, version, lineage_id, status,
           scope_level, scope_portal_id, scope_form_key, scope_org_id, scope_country,
           confidence, source_origin, source_actor, source_evidence_ref,
           tags, supersedes, expires_at, payload, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'active', $5,$6,$7,$8,$9, $10,$11,$12,$13, $14,$15,$16,$17::jsonb, now(), now())`,
        [
          randomUUID(), record.kind, record.version, record.lineage_id,
          record.scope_level, record.scope_portal_id, record.scope_form_key,
          record.scope_org_id, record.scope_country,
          record.confidence, record.source_origin, record.source_actor,
          record.source_evidence_ref, record.tags || [],
          null, record.expires_at, JSON.stringify(record.payload),
        ]
      );
      restored++;
    }

    await client.query('COMMIT');
    return { restored, deprecated, snapshot_id: snapshotId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Compatibility checks ────────────────────────────────────────────

/**
 * Check if a new record is compatible with the existing knowledge base.
 * Returns warnings about potential breaks.
 */
export function checkCompatibility(newRecord, existingRecords) {
  const warnings = [];

  // Check: same lineage, lower version = downgrade
  const sameLineage = existingRecords.filter(r => r.lineage_id === newRecord.lineage_id);
  for (const existing of sameLineage) {
    if (existing.version > (newRecord.version || 1)) {
      warnings.push({
        type: 'version_downgrade',
        message: `New version ${newRecord.version} is lower than existing version ${existing.version}`,
        severity: 'high',
        existing_id: existing.id,
      });
    }
  }

  // Check: same entity key + scope but different payload = breaking change
  const entityKey = getEntityKey(newRecord);
  if (entityKey) {
    const conflicts = existingRecords.filter(r =>
      r.kind === newRecord.kind &&
      getEntityKey(r) === entityKey &&
      isSameScope(r, newRecord) &&
      r.status === 'active' || r.status === 'validated'
    );
    for (const conflict of conflicts) {
      if (conflict.id !== newRecord.id && hasBreakingChange(conflict, newRecord)) {
        warnings.push({
          type: 'breaking_change',
          message: `Record changes meaning of '${entityKey}' at scope ${newRecord.scope?.level}`,
          severity: 'medium',
          existing_id: conflict.id,
        });
      }
    }
  }

  // Check: deprecated record being re-activated
  if (newRecord.status === 'active') {
    const deprecatedSame = existingRecords.filter(r =>
      r.lineage_id === newRecord.lineage_id && r.status === 'deprecated'
    );
    if (deprecatedSame.length) {
      warnings.push({
        type: 'reactivation',
        message: 'Activating a previously deprecated lineage',
        severity: 'low',
      });
    }
  }

  return { compatible: !warnings.some(w => w.severity === 'high'), warnings };
}

// ── Migration planning ──────────────────────────────────────────────

/**
 * Plan a migration: identify records that need updating for a schema change.
 */
export async function planMigration(fromVersion, toVersion, changes) {
  await ensureKnowledgeSchema();
  await ensureVersionSchema();

  const plan = {
    from_version: fromVersion,
    to_version: toVersion,
    changes: changes || [],
    affected_records: [],
    actions: [],
  };

  // Find records that would be affected by each change
  for (const change of (changes || [])) {
    if (change.type === 'rename_field') {
      const { rows } = await pool.query(
        `SELECT id, kind, payload FROM knowledge_records
         WHERE status IN ('active','validated') AND payload ? $1`,
        [change.old_name]
      );
      for (const row of rows) {
        plan.affected_records.push(row.id);
        plan.actions.push({
          record_id: row.id,
          action: 'rename_payload_field',
          from: change.old_name,
          to: change.new_name,
        });
      }
    }

    if (change.type === 'add_required_field') {
      const { rows } = await pool.query(
        `SELECT id, kind, payload FROM knowledge_records
         WHERE status IN ('active','validated') AND kind = $1 AND NOT payload ? $2`,
        [change.kind, change.field_name]
      );
      for (const row of rows) {
        plan.affected_records.push(row.id);
        plan.actions.push({
          record_id: row.id,
          action: 'add_field',
          field: change.field_name,
          default_value: change.default_value,
        });
      }
    }

    if (change.type === 'deprecate_kind') {
      const { rows } = await pool.query(
        `SELECT id FROM knowledge_records
         WHERE status IN ('active','validated') AND kind = $1`,
        [change.kind]
      );
      for (const row of rows) {
        plan.affected_records.push(row.id);
        plan.actions.push({ record_id: row.id, action: 'deprecate' });
      }
    }
  }

  // Save the plan
  const migrationId = randomUUID();
  await pool.query(
    `INSERT INTO knowledge_migrations (id, from_version, to_version, plan)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [migrationId, fromVersion, toVersion, JSON.stringify(plan)]
  );

  return { id: migrationId, ...plan, action_count: plan.actions.length };
}

/**
 * Get lineage history for a record.
 */
export async function getLineageHistory(lineageId) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    `SELECT id, version, status, confidence, source_origin, created_at, updated_at
     FROM knowledge_records WHERE lineage_id = $1 ORDER BY version DESC`,
    [lineageId]
  );
  return {
    lineage_id: lineageId,
    versions: rows,
    total_versions: rows.length,
    current: rows.find(r => r.status === 'active' || r.status === 'validated') || null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function getEntityKey(record) {
  const p = record.payload || {};
  return p.semantic_key || p.canonical || p.component_class || p.capability_name || p.hostname || null;
}

function isSameScope(a, b) {
  const aScope = a.scope || a;
  const bScope = b.scope || b;
  const aLevel = aScope.level || aScope.scope_level || a.scope_level;
  const bLevel = bScope.level || bScope.scope_level || b.scope_level;
  return aLevel === bLevel;
}

function hasBreakingChange(existing, incoming) {
  const ep = existing.payload || {};
  const ip = incoming.payload || {};
  // Breaking = different profile_key or different core meaning
  if (ep.profile_key && ip.profile_key && ep.profile_key !== ip.profile_key) return true;
  if (ep.canonical && ip.canonical && ep.canonical !== ip.canonical) return true;
  if (ep.component_class && ip.component_class && ep.component_class !== ip.component_class) return true;
  return false;
}

export { LIFECYCLE_TRANSITIONS };
