-- Shared document store for the extension-service.
-- Moves form_mappings.json + adapters.json off local disk into Postgres so the extension-service
-- can run as MULTIPLE instances behind a load balancer without diverging state.
-- The extension-service also creates this in-process on boot (store.js ensureSchema); this file lets
-- the backend migration runner provision it centrally too.

CREATE TABLE IF NOT EXISTS ext_kv_store (
  key        text PRIMARY KEY,            -- 'form_mappings', 'adapters'
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
