-- Form lifecycle: open/closed dates for Find Form Phase 1
-- Adds lifecycle state and date columns to support filtering by form availability.

ALTER TABLE forms ADD COLUMN IF NOT EXISTS lifecycle TEXT DEFAULT 'open';
ALTER TABLE forms ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

-- Backfill: active → open, anything else → archived
UPDATE forms SET lifecycle = CASE
  WHEN status = 'active' THEN 'open'
  ELSE 'archived'
END WHERE lifecycle IS NULL OR lifecycle = 'open';

-- Index for lifecycle filtering + closing_soon queries
CREATE INDEX IF NOT EXISTS idx_forms_lifecycle ON forms (lifecycle);
CREATE INDEX IF NOT EXISTS idx_forms_closes_at ON forms (closes_at) WHERE closes_at IS NOT NULL;
