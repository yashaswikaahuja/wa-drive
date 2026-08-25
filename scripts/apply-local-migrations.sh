#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/apps/backend/migrations"
PSQL=(docker exec -i cybercontrol-postgres-1 psql -U cybercontrol_app -d cybercontrol -v ON_ERROR_STOP=1)

echo "=== STUB missing tables referenced by later migrations ==="
"${PSQL[@]}" <<'SQL'
CREATE TABLE IF NOT EXISTS drive_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  drive_file_id VARCHAR(255),
  file_name VARCHAR(512),
  mime_type VARCHAR(128),
  phone VARCHAR(32),
  sender_name VARCHAR(255),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drive_files_workspace ON drive_files(workspace_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_uploaded ON drive_files(uploaded_at);

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
SQL

FILES=(
  001_initial.sql
  002_jobs_services.sql
  003_household_persons.sql
  004_user_roles.sql
  005_pending_signups.sql
  006_contact_verification.sql
  007_workspace_lifecycle.sql
  008_workspace_location.sql
  009_pending_signup_location.sql
  010_workspace_geo.sql
  011_whatsapp_numbers.sql
  012_activity_events.sql
  013_workspace_health_state.sql
  014_workspace_settings.sql
  015_profile_shares.sql
  forms.sql
  forms_required_fields.sql
  extraction_cache.sql
  extraction_jobs.sql
  wa_auth.sql
  wa_instance_health.sql
  wa_instance_metrics.sql
)

for name in "${FILES[@]}"; do
  f="$MIG/$name"
  echo "=== APPLY $name ==="
  # Already-applied objects should not abort the whole run
  docker exec -i cybercontrol-postgres-1 \
    psql -U cybercontrol_app -d cybercontrol -v ON_ERROR_STOP=0 < "$f" \
    | grep -E 'ERROR|CREATE|ALTER|INSERT|NOTICE|DROP' || true
done

echo "=== VERIFY key tables ==="
docker exec cybercontrol-postgres-1 \
  psql -U cybercontrol_app -d cybercontrol -c \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('workspaces','users','profiles','app_secrets','drive_files','wa_assignments','wa_auth_creds','activity_events','workspace_settings') ORDER BY 1;"
