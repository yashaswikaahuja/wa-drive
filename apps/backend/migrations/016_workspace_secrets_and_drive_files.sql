-- Missing core tables used by Drive OAuth + document uploads.
-- These were historically created outside numbered migrations (local stub /
-- manual GCP bootstrap) and were skipped on the AWS MVP fresh DB.

CREATE TABLE IF NOT EXISTS workspace_secrets (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS idx_workspace_secrets_key
  ON workspace_secrets(key);

-- Google Drive file id is the primary key (not a generated UUID).
CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  file_name VARCHAR(512),
  customer_id VARCHAR(64),
  customer_name VARCHAR(255),
  file_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  profile_pic_url TEXT,
  tag VARCHAR(64),
  drive_file_id VARCHAR(255),
  mime_type VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_files_workspace
  ON drive_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_uploaded
  ON drive_files(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_drive_files_customer
  ON drive_files(workspace_id, customer_id);
