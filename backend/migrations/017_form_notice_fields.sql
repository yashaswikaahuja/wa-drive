-- Form catalog: notice URL and summary for owner-managed lifecycle metadata.
ALTER TABLE forms ADD COLUMN IF NOT EXISTS official_notice_url TEXT;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS notice_summary TEXT;
