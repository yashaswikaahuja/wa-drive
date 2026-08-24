-- Migration: 002_jobs_services
-- Created: 2026-05-14

-- Service types registry (platform-defined, not per-workspace)
CREATE TABLE service_types (
  id VARCHAR(50) PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  icon VARCHAR(10) NOT NULL,
  execution_type VARCHAR(50) NOT NULL,    -- form_filling | stitch | document_upload | xerox | manual
  requires_extension BOOLEAN DEFAULT false,
  requires_whatsapp BOOLEAN DEFAULT false,
  requires_documents BOOLEAN DEFAULT false,
  requires_review BOOLEAN DEFAULT true,
  config JSONB,                            -- service-specific config (form URLs, stitch settings)
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Jobs (the core product entity)
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  service_type VARCHAR(50) NOT NULL REFERENCES service_types(id),
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  metadata JSONB,                          -- service-specific runtime data
  session_id UUID REFERENCES sessions(id),
  notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_jobs_workspace ON jobs(workspace_id);
CREATE INDEX idx_jobs_status ON jobs(workspace_id, status);
CREATE INDEX idx_jobs_profile ON jobs(profile_id);
CREATE INDEX idx_jobs_user ON jobs(user_id);

-- Seed default service types
INSERT INTO service_types (id, label, icon, execution_type, requires_extension, requires_review, sort_order) VALUES
  ('form_filling', 'Government Form Filling', '📝', 'form_filling', true, true, 1),
  ('passport_photo', 'Passport Size Photo', '📷', 'stitch', false, false, 2),
  ('document_upload', 'Document Upload', '📤', 'document_upload', false, false, 3),
  ('xerox_print', 'Xerox / Print', '🖨️', 'manual', false, false, 4);
