-- Durable extraction ledger — a SAFETY NET over the in-memory extraction queue.
--
-- The backend extracts documents via an in-memory queue (fast path). That queue is lost on a
-- restart/deploy, silently dropping any in-flight extraction (the file is in Drive + drive_files,
-- but extraction_cache never gets the row → the profile never populates). This table records each
-- extraction as a durable job so a recovery sweeper can re-process anything the in-memory path
-- didn't finish (re-downloading the bytes from Drive by file_id).
--
-- Non-breaking: the in-memory fast path is unchanged. If this table is absent, all the new code
-- no-ops (every access is wrapped in try/catch), so migration order doesn't matter.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS extraction_jobs (
  file_id      text PRIMARY KEY,                 -- one job per uploaded file (idempotent)
  workspace_id uuid NOT NULL,
  phone        text,
  status       text NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of work the sweeper should pick up.
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_pending
  ON extraction_jobs (created_at)
  WHERE status = 'pending';
