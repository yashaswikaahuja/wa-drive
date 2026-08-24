-- DB-backed WhatsApp (Baileys) auth state + workspace shard map.
-- Keystone for sharding whatsapp-service across multiple VMs:
--  * auth state decoupled from any VM's local disk (enables move/failover, no QR re-scan)
--  * wa_assignments maps each workspace to exactly one whatsapp-service instance
-- Safe to run multiple times.

-- Per-workspace Baileys credentials (one row per workspace)
CREATE TABLE IF NOT EXISTS wa_auth_creds (
  workspace_id text PRIMARY KEY,
  creds        jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Per-workspace Baileys signal keys (pre-key | session | sender-key | app-state-sync-key | ...)
CREATE TABLE IF NOT EXISTS wa_auth_keys (
  workspace_id text NOT NULL,
  key_type     text NOT NULL,
  key_id       text NOT NULL,
  value        jsonb NOT NULL,
  PRIMARY KEY (workspace_id, key_type, key_id)
);

-- Shard map: which whatsapp-service instance (tailnet hostname) owns each workspace.
-- Exactly one owner per workspace guarantees a single live WhatsApp connection.
CREATE TABLE IF NOT EXISTS wa_assignments (
  workspace_id text PRIMARY KEY,
  instance     text NOT NULL,            -- tailnet host, e.g. cybercontrol-wa-1
  assigned_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_assignments_instance ON wa_assignments (instance);
