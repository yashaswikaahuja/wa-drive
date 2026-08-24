-- Add settings JSONB column to workspaces for AI model config, etc.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
