-- Migration: 003_household_persons
-- Allow multiple profiles (persons) per phone (household), with relationship metadata.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS relationship VARCHAR(30) DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS display_label VARCHAR(255);

-- Drop the unique-per-phone constraint that was preventing multiple persons per household.
DROP INDEX IF EXISTS idx_profiles_workspace_phone;

-- Replace with non-unique index for fast household lookups.
CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles(workspace_id, primary_contact_phone) WHERE deleted_at IS NULL;

-- Backfill display_label from name where missing.
UPDATE profiles SET display_label = name WHERE display_label IS NULL AND name IS NOT NULL;
