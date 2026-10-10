-- Document-centric profile linking: each extraction belongs to a person on a phone.
-- Without these columns, AutoProfile create may succeed but linking/deriveProfile breaks.

ALTER TABLE extraction_cache
  ADD COLUMN IF NOT EXISTS person_key TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE INDEX IF NOT EXISTS idx_extraction_cache_phone_person
  ON extraction_cache (workspace_id, phone, person_key);
