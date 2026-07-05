-- 010_workspace_geo.sql
-- Location-capture waterfall: precise coords (tier1 GPS / tier3 manual) + how it was captured.
-- location already exists (008). Idempotent + additive.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS location_source VARCHAR(10);  -- 'gps' | 'ip' | 'manual'
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS detected_ip VARCHAR(64);

-- Existing rows that already have a location were set by the owner/signup → treat as manual.
UPDATE workspaces SET location_source = 'manual' WHERE location IS NOT NULL AND location_source IS NULL;
