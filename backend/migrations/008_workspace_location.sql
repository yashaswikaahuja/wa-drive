-- 008_workspace_location.sql
-- Owner-editable location for a cybercafé (workspace). Not captured at signup, so it's nullable and
-- filled in from the owner panel. Idempotent + additive → safe on the live DB.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS location TEXT;
