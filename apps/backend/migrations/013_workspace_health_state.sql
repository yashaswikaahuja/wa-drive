-- Last-known health band/score per workspace. Lets the daily monitor detect TRANSITIONS
-- (e.g. an active café dropping to at-risk) and de-duplicate owner alerts.
CREATE TABLE IF NOT EXISTS workspace_health_state (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id),
  band         TEXT NOT NULL,
  score        INT  NOT NULL,
  alerted_at   TIMESTAMPTZ,           -- last time the owner was alerted about THIS café
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily leader election: with 2 backend instances behind the LB, the first to insert today's
-- date "wins" and runs the sweep/alert; the other sees a conflict and skips → no duplicate alerts.
CREATE TABLE IF NOT EXISTS owner_monitor_runs (
  run_date DATE PRIMARY KEY,
  ran_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
