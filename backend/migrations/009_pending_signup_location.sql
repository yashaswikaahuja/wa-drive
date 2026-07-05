-- 009_pending_signup_location.sql
-- Carry the café's location captured at signup through the pending-signup record until the
-- account is created on verification. Idempotent + additive.

ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS location TEXT;
