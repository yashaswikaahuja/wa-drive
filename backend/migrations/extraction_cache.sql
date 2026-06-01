-- Caches AI extraction results so Build Profile is instant (zero-effort prep)
CREATE TABLE IF NOT EXISTS extraction_cache (
  file_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL,
  suggested JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_extraction_cache_ws ON extraction_cache (workspace_id);
