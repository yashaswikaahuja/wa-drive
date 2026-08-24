-- CyberControl Platform Schema v1.0
-- Migration: 001_initial
-- Created: 2026-05-14

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORE IDENTITY LAYER
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email VARCHAR(255),
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'operator',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(workspace_id, email),
  UNIQUE(workspace_id, phone)
);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token VARCHAR(512) NOT NULL,
  device_info JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  phone_number VARCHAR(20),
  session_data JSONB,
  status VARCHAR(20) DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPERATIONAL LAYER
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  primary_contact_phone VARCHAR(20),
  name VARCHAR(255),
  data JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  profile_id UUID REFERENCES profiles(id),
  hostname VARCHAR(255),
  semantic_form_key VARCHAR(255),
  runtime_version VARCHAR(20),
  schema_version VARCHAR(10) DEFAULT '1.0',
  total_filled INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  records JSONB,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  source_session_id UUID NOT NULL REFERENCES sessions(id),
  schema_version VARCHAR(10) NOT NULL DEFAULT '1.0',
  runtime_version VARCHAR(20),
  hostname VARCHAR(255),
  semantic_form_key VARCHAR(255),
  total_filled INTEGER,
  total_failed INTEGER,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  session_id UUID REFERENCES sessions(id),
  episode_id UUID REFERENCES episodes(id),
  user_id UUID REFERENCES users(id),
  profile_id UUID REFERENCES profiles(id),
  hostname VARCHAR(255),
  semantic_form_key VARCHAR(255),
  trigger VARCHAR(20),
  runtime_version VARCHAR(20),
  schema_version VARCHAR(10) DEFAULT '1.0',
  corrections JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  semantic_form_key VARCHAR(255) NOT NULL,
  hostname VARCHAR(255),
  mapping_data JSONB NOT NULL,
  source VARCHAR(30) NOT NULL,
  confidence REAL DEFAULT 0.5,
  mapping_version INTEGER DEFAULT 1,
  provider VARCHAR(50),
  runtime_version VARCHAR(20),
  schema_version VARCHAR(10) DEFAULT '1.0',
  fill_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(workspace_id, semantic_form_key, source)
);

CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  semantic_form_key VARCHAR(255) NOT NULL,
  hostname VARCHAR(255),
  steps JSONB NOT NULL,
  workflow_version INTEGER DEFAULT 1,
  taught_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INFRASTRUCTURE LAYER
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX idx_sessions_hostname ON sessions(hostname);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_episodes_workspace ON episodes(workspace_id);
CREATE INDEX idx_episodes_source_session ON episodes(source_session_id);
CREATE INDEX idx_corrections_workspace ON corrections(workspace_id);
CREATE INDEX idx_corrections_session ON corrections(session_id);
CREATE INDEX idx_corrections_hostname ON corrections(hostname);
CREATE INDEX idx_mappings_workspace_key ON mappings(workspace_id, semantic_form_key);
CREATE INDEX idx_profiles_workspace ON profiles(workspace_id);
CREATE INDEX idx_workflows_workspace_key ON workflows(workspace_id, semantic_form_key);
CREATE INDEX idx_audit_workspace ON audit_events(workspace_id);
CREATE INDEX idx_audit_type ON audit_events(event_type);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
