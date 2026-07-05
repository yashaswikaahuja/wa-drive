-- 007_workspace_lifecycle.sql
-- Owner control panel — Level-1 customer (workspace = cybercafé) metrics.
-- Adds a lifecycle status + a last-activity timestamp so the owner dashboard can tell
-- LIVE customers from dormant signups. Idempotent + additive → safe to run on the live DB.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Backfill last_active_at from the strongest available activity signal per workspace:
-- most recent WhatsApp connection, file upload, user update, or (fallback) creation time.
UPDATE workspaces w SET last_active_at = GREATEST(
  COALESCE((SELECT max(ws.connected_at) FROM whatsapp_sessions ws WHERE ws.workspace_id = w.id), 'epoch'::timestamptz),
  COALESCE((SELECT max(df.uploaded_at)  FROM drive_files df       WHERE df.workspace_id = w.id), 'epoch'::timestamptz),
  COALESCE((SELECT max(u.updated_at)    FROM users u              WHERE u.workspace_id = w.id), 'epoch'::timestamptz),
  COALESCE(w.created_at, 'epoch'::timestamptz)
)
WHERE last_active_at IS NULL;

-- Soft-deleted workspaces are churned customers.
UPDATE workspaces SET status = 'churned' WHERE deleted_at IS NOT NULL AND status <> 'churned';

CREATE INDEX IF NOT EXISTS idx_workspaces_last_active ON workspaces(last_active_at);
CREATE INDEX IF NOT EXISTS idx_workspaces_status      ON workspaces(status);
