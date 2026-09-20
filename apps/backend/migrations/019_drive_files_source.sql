-- File provenance: WA received-media must not include editor/manual/generated files (#318).
-- Existing rows are historically WhatsApp inbound → backfill source = 'whatsapp'.

ALTER TABLE drive_files
  ADD COLUMN IF NOT EXISTS source VARCHAR(32),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB;

UPDATE drive_files
SET source = 'whatsapp'
WHERE source IS NULL;

ALTER TABLE drive_files
  ALTER COLUMN source SET DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_drive_files_source
  ON drive_files (workspace_id, source);

CREATE INDEX IF NOT EXISTS idx_drive_files_customer_source
  ON drive_files (workspace_id, customer_id, source);

COMMENT ON COLUMN drive_files.source IS
  'Provenance: whatsapp | photo-editor | pdf-editor | manual-upload | generated';
