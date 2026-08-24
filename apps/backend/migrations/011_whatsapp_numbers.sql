-- WhatsApp number history per workspace.
-- Populated by the hub's /whatsapp/event 'connected' handler (workspaceId + phone). Lets the owner
-- panel show a café's CURRENT connected number plus every PAST number it has used.
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id),
  phone              VARCHAR(32) NOT NULL,
  first_connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at    TIMESTAMPTZ,                 -- set when the current number goes offline
  is_current         BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (workspace_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_wa_numbers_ws ON whatsapp_numbers(workspace_id);

-- Backfill the CURRENT number for already-connected workspaces from Baileys creds.
-- creds.me.id looks like "919876543210:12@s.whatsapp.net" → strip device suffix (:12) + JID domain.
INSERT INTO whatsapp_numbers (workspace_id, phone, is_current)
SELECT c.workspace_id::uuid,
       split_part(split_part(c.creds->'me'->>'id', '@', 1), ':', 1) AS phone,
       true
FROM wa_auth_creds c
WHERE c.creds->'me'->>'id' IS NOT NULL
  AND split_part(split_part(c.creds->'me'->>'id', '@', 1), ':', 1) <> ''
  AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = c.workspace_id::uuid)
ON CONFLICT (workspace_id, phone) DO NOTHING;
