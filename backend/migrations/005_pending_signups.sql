-- Migration: 005_pending_signups
-- Created: 2026-07-02
-- Holds a self-serve signup until its email/phone OTP(s) are verified. Only on successful
-- verification is the real workspace+user created (so unverified signups never occupy a
-- users row / email / phone). Rows are short-lived (expires_at) and swept on verify/expiry.
--
-- Apply manually:  psql "$DATABASE_URL" -f backend/migrations/005_pending_signups.sql

CREATE TABLE IF NOT EXISTS pending_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255),
  phone VARCHAR(20),
  name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  email_code_hash VARCHAR(64),
  phone_code_hash VARCHAR(64),
  email_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_expiry ON pending_signups(expires_at);
