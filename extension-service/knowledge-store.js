// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Knowledge Store (Phase 2.2, Issue #86)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Canonical persistence + query layer for knowledge records.
// Schema: architecture/knowledge-schema.yml v1.0.0
//
// Responsibilities:
//   - CRUD for knowledge records
//   - Scope-aware resolution (narrowest scope wins)
//   - Version-aware reads/writes (lineage tracking)
//   - Validation before write
//   - Query by kind, scope, payload content
//
// Does NOT own: AI reasoning, learning promotion, plan generation.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { pool } from './db.js';
import { randomUUID } from 'node:crypto';

// ── Schema bootstrap ────────────────────────────────────────────────

let schemaReady = null;

export function ensureKnowledgeSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_records (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind            text NOT NULL,
      version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      lineage_id      uuid NOT NULL,
      status          text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','validated','deprecated','superseded')),
      scope_level     text NOT NULL
                        CHECK (scope_level IN ('portal_form','portal','organization','country','global')),
      scope_portal_id text,
      scope_form_key  text,
      scope_org_id    uuid,
      scope_country   char(2),
      confidence      numeric(4,3) NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
      source_origin   text NOT NULL
                        CHECK (source_origin IN ('manual','learned','derived','imported','ai_generated','correction')),
      source_actor    text,
      source_evidence_ref text,
      tags            text[] NOT NULL DEFAULT '{}',
      supersedes      uuid REFERENCES knowledge_records(id),
      expires_at      timestamptz,
      payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `).then(() => {
    console.log('[knowledge-store] table ready');
  }).catch((e) => {
    schemaReady = null;
    console.error('[knowledge-store] ensureSchema failed:', e.message);
    throw e;
  });
  return schemaReady;
}

// ── Validation ──────────────────────────────────────────────────────

const VALID_KINDS = [
  'field_mapping', 'synonym', 'option_translation', 'component_adapter',
  'fill_rule', 'derivation_rule', 'validation_rule', 'portal_definition',
  'experience', 'correction', 'capability_reference',
];

const VALID_STATUSES = ['draft', 'active', 'validated', 'deprecated', 'superseded'];
const VALID_ORIGINS = ['manual', 'learned', 'derived', 'imported', 'ai_generated', 'correction'];
const VALID_LEVELS = ['portal_form', 'portal', 'organization', 'country', 'global'];

export function validateRecord(record) {
  const errors = [];
  if (!record.kind || !VALID_KINDS.includes(record.kind))
    errors.push(`Invalid kind: ${record.kind}`);
  if (!record.scope || !VALID_LEVELS.includes(record.scope?.level))
    errors.push(`Invalid scope.level: ${record.scope?.level}`);
  if (record.scope?.level === 'portal_form' && (!record.scope.portal_id || !record.scope.form_key))
    errors.push('portal_form scope requires portal_id and form_key');
  if (record.scope?.level === 'portal' && !record.scope.portal_id)
    errors.push('portal scope requires portal_id');
  if (record.scope?.level === 'organization' && !record.scope.organization_id)
    errors.push('organization scope requires organization_id');
  if (record.scope?.level === 'country' && !record.scope.country)
    errors.push('country scope requires country');
  if (record.confidence != null && (record.confidence < 0 || record.confidence > 1))
    errors.push(`confidence must be 0.0–1.0, got ${record.confidence}`);
  if (!record.source?.origin || !VALID_ORIGINS.includes(record.source.origin))
    errors.push(`Invalid source.origin: ${record.source?.origin}`);
  if (!record.payload || typeof record.payload !== 'object')
    errors.push('payload is required and must be an object');
  return errors;
}

// ── Create ──────────────────────────────────────────────────────────

export async function create(record) {
  await ensureKnowledgeSchema();
  const errors = validateRecord(record);
  if (errors.length) throw new Error('Validation failed: ' + errors.join('; '));

  const id = record.id || randomUUID();
  const lineageId = record.lineage_id || randomUUID();
  const now = new Date().toISOString();

  const { rows } = await pool.query(`
    INSERT INTO knowledge_records
      (id, kind, version, lineage_id, status,
       scope_level, scope_portal_id, scope_form_key, scope_org_id, scope_country,
       confidence, source_origin, source_actor, source_evidence_ref,
       tags, supersedes, expires_at, payload, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10, $11,$12,$13,$14, $15,$16,$17,$18::jsonb, $19,$19)
    RETURNING *
  `, [
    id,
    record.kind,
    record.version || 1,
    lineageId,
    record.status || 'draft',
    record.scope.level,
    record.scope.portal_id || null,
    record.scope.form_key || null,
    record.scope.organization_id || null,
    record.scope.country || null,
    record.confidence ?? 0.5,
    record.source.origin,
    record.source.actor || null,
    record.source.evidence_ref || null,
    record.tags || [],
    record.supersedes || null,
    record.expires_at || null,
    JSON.stringify(record.payload),
    now,
  ]);
  return rowToRecord(rows[0]);
}

// ── Read ────────────────────────────────────────────────────────────

export async function getById(id) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query('SELECT * FROM knowledge_records WHERE id = $1', [id]);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getByLineage(lineageId) {
  await ensureKnowledgeSchema();
  const { rows } = await pool.query(
    'SELECT * FROM knowledge_records WHERE lineage_id = $1 ORDER BY version DESC',
    [lineageId]
  );
  return rows.map(rowToRecord);
}

// ── Update (creates new version) ────────────────────────────────────

export async function update(id, changes) {
  await ensureKnowledgeSchema();
  const existing = await getById(id);
  if (!existing) throw new Error(`Record not found: ${id}`);

  // Supersede the old record
  await pool.query(
    `UPDATE knowledge_records SET status = 'superseded', updated_at = now() WHERE id = $1`,
    [id]
  );

  // Create new version in same lineage
  const newRecord = {
    ...existing,
    ...changes,
    id: undefined, // generate new ID
    version: existing.version + 1,
    lineage_id: existing.lineage_id,
    supersedes: id,
    source: changes.source || existing.source,
    payload: changes.payload || existing.payload,
    scope: changes.scope || existing.scope,
    status: changes.status || 'active',
  };
  return create(newRecord);
}

// ── Delete (soft — sets status to deprecated) ───────────────────────

export async function deprecate(id) {
  await ensureKnowledgeSchema();
  const { rowCount } = await pool.query(
    `UPDATE knowledge_records SET status = 'deprecated', updated_at = now() WHERE id = $1`,
    [id]
  );
  if (!rowCount) throw new Error(`Record not found: ${id}`);
  return { ok: true, id };
}

// Hard delete (admin only, for cleaning up drafts)
export async function remove(id) {
  await ensureKnowledgeSchema();
  const { rowCount } = await pool.query(
    `DELETE FROM knowledge_records WHERE id = $1 AND status = 'draft'`,
    [id]
  );
  if (!rowCount) throw new Error(`Record not found or not in draft status: ${id}`);
  return { ok: true, id };
}

// ── Query ───────────────────────────────────────────────────────────

export async function query({ kind, scope, status, tags, limit = 50, offset = 0 } = {}) {
  await ensureKnowledgeSchema();
  const conditions = [];
  const params = [];
  let paramIdx = 0;

  if (kind) {
    conditions.push(`kind = $${++paramIdx}`);
    params.push(kind);
  }
  if (status) {
    conditions.push(`status = $${++paramIdx}`);
    params.push(status);
  } else {
    conditions.push(`status IN ('active','validated')`);
  }
  if (scope?.portal_id) {
    conditions.push(`scope_portal_id = $${++paramIdx}`);
    params.push(scope.portal_id);
  }
  if (scope?.form_key) {
    conditions.push(`scope_form_key = $${++paramIdx}`);
    params.push(scope.form_key);
  }
  if (scope?.organization_id) {
    conditions.push(`scope_org_id = $${++paramIdx}`);
    params.push(scope.organization_id);
  }
  if (scope?.country) {
    conditions.push(`scope_country = $${++paramIdx}`);
    params.push(scope.country);
  }
  if (tags?.length) {
    conditions.push(`tags && $${++paramIdx}`);
    params.push(tags);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  params.push(limit, offset);
  const sql = `SELECT * FROM knowledge_records ${where}
               ORDER BY confidence DESC, updated_at DESC
               LIMIT $${++paramIdx} OFFSET $${++paramIdx}`;
  const { rows } = await pool.query(sql, params);
  return rows.map(rowToRecord);
}

// ── Scope Resolution ────────────────────────────────────────────────
//
// Given a context (portal_id, form_key, org_id, country) and a kind,
// find the BEST matching record. Narrowest scope wins.

const SCOPE_PRIORITY = { portal_form: 5, portal: 4, organization: 3, country: 2, global: 1 };

export async function resolve({ kind, portal_id, form_key, organization_id, country }) {
  await ensureKnowledgeSchema();
  if (!kind) throw new Error('kind is required for resolution');

  // Fetch all candidates: active/validated records of this kind that could match
  const { rows } = await pool.query(`
    SELECT * FROM knowledge_records
    WHERE kind = $1
      AND status IN ('active','validated')
      AND (expires_at IS NULL OR expires_at > now())
      AND (
        (scope_level = 'global')
        OR (scope_level = 'country' AND scope_country = $2)
        OR (scope_level = 'organization' AND scope_org_id = $3)
        OR (scope_level = 'portal' AND scope_portal_id = $4)
        OR (scope_level = 'portal_form' AND scope_portal_id = $4 AND scope_form_key = $5)
      )
    ORDER BY confidence DESC
  `, [kind, country || '__none__', organization_id || '00000000-0000-0000-0000-000000000000', portal_id || '__none__', form_key || '__none__']);

  if (!rows.length) return [];

  // Group by scope level, return narrowest scope matches
  const records = rows.map(rowToRecord);
  records.sort((a, b) => {
    const pa = SCOPE_PRIORITY[a.scope.level] || 0;
    const pb = SCOPE_PRIORITY[b.scope.level] || 0;
    if (pb !== pa) return pb - pa; // narrower first
    return b.confidence - a.confidence; // then by confidence
  });
  return records;
}

// Convenience: resolve to single best record
export async function resolveOne(params) {
  const results = await resolve(params);
  return results[0] || null;
}

// ── Bulk resolve (for fill-time: get all field_mappings for a form) ──

export async function resolveAll({ kind, portal_id, form_key, organization_id, country }) {
  const results = await resolve({ kind, portal_id, form_key, organization_id, country });
  // De-duplicate by payload semantic key (narrowest wins)
  const seen = new Set();
  const deduped = [];
  for (const r of results) {
    const key = r.payload.semantic_key || r.payload.canonical || r.payload.component_class || r.id;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  }
  return deduped;
}

// ── Row mapper ──────────────────────────────────────────────────────

function rowToRecord(row) {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    lineage_id: row.lineage_id,
    status: row.status,
    scope: {
      level: row.scope_level,
      portal_id: row.scope_portal_id,
      form_key: row.scope_form_key,
      organization_id: row.scope_org_id,
      country: row.scope_country,
    },
    confidence: parseFloat(row.confidence),
    source: {
      origin: row.source_origin,
      actor: row.source_actor,
      evidence_ref: row.source_evidence_ref,
      created_at: row.created_at?.toISOString(),
      updated_at: row.updated_at?.toISOString(),
    },
    tags: row.tags || [],
    supersedes: row.supersedes,
    expires_at: row.expires_at?.toISOString() || null,
    payload: row.payload,
  };
}
