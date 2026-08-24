-- Append-only activity stream (product-analytics pattern: actor · action · timestamp · properties).
-- Powers the owner panel's per-café activity timeline + engagement signals. Low-cardinality
-- Object.Action names. NO end-customer PII in properties (a café's OWN business number is fine).
CREATE TABLE IF NOT EXISTS activity_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  actor_user_id UUID,                       -- NULL = system/hub-originated
  action        TEXT NOT NULL,              -- e.g. 'workspace.signed_up', 'whatsapp.connected'
  properties    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_ws_time ON activity_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action  ON activity_events (action);

-- ── Backfill from existing data so every café has a populated timeline immediately ──
-- (idempotent: guard each backfill so re-running doesn't duplicate)

-- signup
INSERT INTO activity_events (workspace_id, actor_user_id, action, created_at)
SELECT w.id, NULL, 'workspace.signed_up', w.created_at
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.workspace_id = w.id AND e.action = 'workspace.signed_up');

-- operators added (skip each workspace's first user — that's the signup admin)
INSERT INTO activity_events (workspace_id, actor_user_id, action, created_at)
SELECT u.workspace_id, u.id, 'operator.added', u.created_at
FROM users u
WHERE u.deleted_at IS NULL
  AND u.id <> (SELECT u2.id FROM users u2 WHERE u2.workspace_id = u.workspace_id AND u2.deleted_at IS NULL ORDER BY u2.created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.workspace_id = u.workspace_id AND e.action = 'operator.added' AND e.actor_user_id = u.id);

-- whatsapp connections (from the number history added in migration 011)
INSERT INTO activity_events (workspace_id, actor_user_id, action, properties, created_at)
SELECT wn.workspace_id, NULL, 'whatsapp.connected', jsonb_build_object('phone', wn.phone), wn.first_connected_at
FROM whatsapp_numbers wn
WHERE NOT EXISTS (
  SELECT 1 FROM activity_events e
  WHERE e.workspace_id = wn.workspace_id AND e.action = 'whatsapp.connected'
    AND e.properties->>'phone' = wn.phone
);

-- first document processed (the "activation" moment)
INSERT INTO activity_events (workspace_id, actor_user_id, action, created_at)
SELECT df.workspace_id, NULL, 'file.first_processed', min(df.uploaded_at)
FROM drive_files df
WHERE df.uploaded_at IS NOT NULL
GROUP BY df.workspace_id
HAVING NOT EXISTS (SELECT 1 FROM activity_events e WHERE e.workspace_id = df.workspace_id AND e.action = 'file.first_processed');
