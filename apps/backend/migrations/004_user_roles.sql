-- Migration: 004_user_roles
-- Created: 2026-07-01
-- Role-based accounts: multiple operators + admins per workspace.
--
-- Two changes:
--   1. email/phone become GLOBALLY unique (login looks them up globally, not per-workspace),
--      case-insensitive for email. Soft-deleted rows are ignored so a freed email can be reused.
--   2. role is constrained to the known set.
--
-- Apply manually (no auto-runner):  psql "$DATABASE_URL" -f backend/migrations/004_user_roles.sql

-- 1. Drop the old workspace-scoped unique constraints (login resolves an identity globally).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_workspace_id_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_workspace_id_phone_key;

-- 1b. De-duplicate existing rows so the unique indexes below can be created.
--     Registration used to create a new workspace per signup, so the same email/phone could exist
--     across workspaces. Keep the EARLIEST active account per email (case-insensitive) and per phone;
--     soft-delete the rest (their now-orphan workspaces are harmless).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at, id) AS rn
  FROM users WHERE email IS NOT NULL AND deleted_at IS NULL
)
UPDATE users u SET deleted_at = now(), updated_at = now()
FROM ranked r WHERE u.id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at, id) AS rn
  FROM users WHERE phone IS NOT NULL AND deleted_at IS NULL
)
UPDATE users u SET deleted_at = now(), updated_at = now()
FROM ranked r WHERE u.id = r.id AND r.rn > 1;

-- 2. Global partial-unique indexes — one live user per email (case-insensitive) / phone.
--    Partial (deleted_at IS NULL) so soft-deleting a user frees their email/phone for reuse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_live ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone_live ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- 3. Constrain role to the known set (existing rows are 'admin'/'operator', so this is safe).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','operator'));
