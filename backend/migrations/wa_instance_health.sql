-- WhatsApp instance health tracking (heartbeats) for the sticky-shard ruleset.
-- Each whatsapp-service instance heartbeats periodically; the hub uses last_seen to decide
-- whether an instance is alive on the tailnet. A workspace stays on its assigned instance as
-- long as that instance is alive; failover to another instance happens ONLY when the assigned
-- instance stops heartbeating (i.e. disconnected from the tailnet / dead).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS wa_instances (
  instance   text PRIMARY KEY,                 -- tailnet hostname, e.g. cybercontrol-wa-1
  last_seen  timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'up'
);

CREATE INDEX IF NOT EXISTS idx_wa_instances_last_seen ON wa_instances (last_seen);
