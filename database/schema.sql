-- CyberControl Database Schema
-- Run: sudo -u postgres psql -d cybercontrol -f schema.sql

-- Workspaces (each cybercafe)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Users (operators per workspace)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email VARCHAR(255),
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'operator',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Auth sessions (refresh tokens)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- Customer profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  phone VARCHAR(20),
  name VARCHAR(255),
  relationship VARCHAR(50) DEFAULT 'self',
  display_label VARCHAR(255),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_workspace ON profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(workspace_id, phone);

-- Files (received via WhatsApp, stored in Drive)
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  drive_file_id VARCHAR(100),
  file_name VARCHAR(500),
  mime_type VARCHAR(100),
  file_size INTEGER,
  sender_phone VARCHAR(50),
  sender_name VARCHAR(255),
  sender_dp TEXT,
  tag VARCHAR(50),
  thumbnail_url TEXT,
  extracted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_files_sender ON files(workspace_id, sender_phone);

-- Workspace secrets (Drive tokens, etc.)
CREATE TABLE IF NOT EXISTS workspace_secrets (
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  key VARCHAR(100) NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, key)
);

-- Jobs (form-fill tasks)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID REFERENCES users(id),
  profile_id UUID REFERENCES profiles(id),
  service_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'queued',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id);

-- Fill sessions (extension records)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID REFERENCES users(id),
  profile_id UUID REFERENCES profiles(id),
  hostname VARCHAR(255),
  form_key VARCHAR(255),
  total_filled INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  records JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);

-- Corrections (operator fixes)
CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  session_id UUID REFERENCES sessions(id),
  hostname VARCHAR(255),
  form_key VARCHAR(255),
  corrections JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Form field mappings (learned)
CREATE TABLE IF NOT EXISTS mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  hostname VARCHAR(255),
  form_key VARCHAR(255) NOT NULL,
  mapping_data JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(50) DEFAULT 'fuzzy',
  confidence REAL DEFAULT 0.5,
  fill_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mappings_key ON mappings(workspace_id, form_key);

-- Error log (for super admin)
CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service VARCHAR(50) NOT NULL,
  workspace_id UUID,
  error_type VARCHAR(100),
  message TEXT,
  stack TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_errors_service ON error_log(service, created_at DESC);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_log(workspace_id, created_at DESC);
