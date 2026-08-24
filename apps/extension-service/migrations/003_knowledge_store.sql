-- Knowledge Store (Phase 2.2, Issue #86)
-- Canonical persistence for all CyberControl knowledge records.
-- Schema follows architecture/knowledge-schema.yml v1.0.0.

CREATE TABLE IF NOT EXISTS knowledge_records (
  -- Envelope fields
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  lineage_id      uuid NOT NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','validated','deprecated','superseded')),

  -- Scope
  scope_level     text NOT NULL
                    CHECK (scope_level IN ('portal_form','portal','organization','country','global')),
  scope_portal_id text,
  scope_form_key  text,
  scope_org_id    uuid,
  scope_country   char(2),

  -- Metadata
  confidence      numeric(4,3) NOT NULL DEFAULT 0.5
                    CHECK (confidence >= 0 AND confidence <= 1),
  source_origin   text NOT NULL
                    CHECK (source_origin IN ('manual','learned','derived','imported','ai_generated','correction')),
  source_actor    text,
  source_evidence_ref text,
  tags            text[] NOT NULL DEFAULT '{}',
  supersedes      uuid REFERENCES knowledge_records(id),
  expires_at      timestamptz,

  -- Payload (kind-specific data as JSONB)
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Scope resolution: find records matching a context, ordered by specificity
CREATE INDEX IF NOT EXISTS idx_kr_scope_resolution
  ON knowledge_records (kind, scope_level, scope_portal_id, scope_form_key, scope_org_id, scope_country)
  WHERE status IN ('active','validated');

-- Lineage: find all versions of a record
CREATE INDEX IF NOT EXISTS idx_kr_lineage
  ON knowledge_records (lineage_id, version DESC);

-- Kind queries
CREATE INDEX IF NOT EXISTS idx_kr_kind
  ON knowledge_records (kind)
  WHERE status IN ('active','validated');

-- Supersedes lookups
CREATE INDEX IF NOT EXISTS idx_kr_supersedes
  ON knowledge_records (supersedes)
  WHERE supersedes IS NOT NULL;

-- Full-text search on payload (for field labels, synonyms, etc.)
CREATE INDEX IF NOT EXISTS idx_kr_payload_gin
  ON knowledge_records USING gin (payload jsonb_path_ops);

-- Uniqueness: only one active/validated version per lineage
-- (prevents two live records for the same logical knowledge)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kr_lineage_active
  ON knowledge_records (lineage_id)
  WHERE status IN ('active','validated');

-- Scope consistency enforcement via check constraints
ALTER TABLE knowledge_records
  ADD CONSTRAINT chk_scope_portal_form
    CHECK (scope_level != 'portal_form' OR (scope_portal_id IS NOT NULL AND scope_form_key IS NOT NULL)),
  ADD CONSTRAINT chk_scope_portal
    CHECK (scope_level != 'portal' OR scope_portal_id IS NOT NULL),
  ADD CONSTRAINT chk_scope_org
    CHECK (scope_level != 'organization' OR scope_org_id IS NOT NULL),
  ADD CONSTRAINT chk_scope_country
    CHECK (scope_level != 'country' OR scope_country IS NOT NULL);
