-- Migration: 006_contact_verification
-- Created: 2026-07-02
-- Track whether an existing user's email/phone are verified, and hold per-user OTPs for
-- verifying them post-login (existing/unverified accounts get nudged to verify).
--
-- Apply manually:  psql "$DATABASE_URL" -f backend/migrations/006_contact_verification.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- Google-provisioned accounts (empty password_hash) already have a Google-verified email.
UPDATE users SET email_verified = true
  WHERE email IS NOT NULL AND coalesce(password_hash,'') = '' AND email_verified = false;

CREATE TABLE IF NOT EXISTS contact_otps (
  user_id UUID NOT NULL REFERENCES users(id),
  channel VARCHAR(10) NOT NULL,          -- 'email' | 'phone'
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);
