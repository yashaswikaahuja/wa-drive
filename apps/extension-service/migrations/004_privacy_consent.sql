-- Privacy consent lifecycle and single-use operation authorizations.
-- The extension-service also creates these tables at boot for deployments that
-- do not run SQL migrations centrally. Keep this migration in sync with service.ts.

CREATE TABLE IF NOT EXISTS privacy_consents (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  purpose text NOT NULL,
  recipient_id text,
  recipient_endpoint text,
  source_origin text,
  data_categories jsonb NOT NULL,
  fields jsonb,
  affirmative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_privacy_consents_scope
  ON privacy_consents (workspace_id, user_id, action, purpose, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS privacy_authorizations (
  id uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  operation_id text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  request_json jsonb NOT NULL,
  consent_id uuid NOT NULL REFERENCES privacy_consents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  UNIQUE (workspace_id, user_id, operation_id)
);
CREATE INDEX IF NOT EXISTS idx_privacy_authorizations_expiry
  ON privacy_authorizations (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS privacy_audit_events (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  event_type text NOT NULL,
  operation_id text,
  consent_id uuid,
  action text,
  purpose text,
  recipient_id text,
  source_origin text,
  data_categories jsonb,
  decision text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_audit_scope
  ON privacy_audit_events (workspace_id, created_at DESC);
