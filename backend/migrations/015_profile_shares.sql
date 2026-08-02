-- Profile sharing between workspaces
CREATE TABLE IF NOT EXISTS profile_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(32) UNIQUE NOT NULL,
  source_workspace_id UUID NOT NULL REFERENCES workspaces(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  phone VARCHAR(20) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days',
  used_by_workspace_id UUID REFERENCES workspaces(id),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_profile_shares_token ON profile_shares(token) WHERE used_at IS NULL;
