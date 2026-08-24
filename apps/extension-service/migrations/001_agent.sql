-- Agent plans + traces (Phase 2 of AI agent integration)
-- Run on the cybercontrol Postgres instance.

CREATE TABLE IF NOT EXISTS agent_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  user_id         uuid,
  goal            text NOT NULL,
  snapshot        jsonb,
  profile_id      uuid,
  plan            jsonb NOT NULL,        -- { actions, reasoning, model, durationMs, ... }
  model           text,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_plans_workspace ON agent_plans(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_plans_created ON agent_plans(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_traces (
  id                text PRIMARY KEY,    -- agent_<base36 ts>_<rand>
  workspace_id      uuid NOT NULL,
  user_id           uuid,
  goal              text NOT NULL,
  plan              jsonb NOT NULL,      -- proposed actions
  results           jsonb NOT NULL,      -- driver call results (one per action)
  snapshot_before   jsonb,
  snapshot_after    jsonb,
  profile_id        uuid,
  created_at        timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_workspace ON agent_traces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created ON agent_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_traces_profile ON agent_traces(profile_id);
