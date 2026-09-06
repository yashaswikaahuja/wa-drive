-- Persist cafe WhatsApp address-book names so sender labels survive WA service restarts.
-- `name` is the saved contact-list name only (never pushname / OCR profile name).

CREATE TABLE IF NOT EXISTS workspace_wa_contacts (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_workspace_wa_contacts_phone
  ON workspace_wa_contacts(phone);
