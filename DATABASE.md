# Database Structure — CyberControl

**Engine:** PostgreSQL 14  
**Host:** localhost:5432 on GCP #1  
**Database:** `cybercontrol`  
**User:** `cybercontrol_app` / Password: `cybercontrol123`

---

## Access

```bash
# Direct via SSH
ssh gcp-worker "sudo -u postgres psql -d cybercontrol"

# SSH tunnel for GUI tools (DBeaver/pgAdmin)
ssh -L 5433:localhost:5432 gcp-worker
# Then connect to localhost:5433
```

---

## Tables Overview

| Table | Purpose | Owner |
|-------|---------|-------|
| `workspaces` | Each cybercafe account | cybercontrol_app |
| `users` | Operators per workspace | cybercontrol_app |
| `profiles` | Customer profiles (extracted document data) | cybercontrol_app |
| `drive_files` | Files received via WhatsApp (per workspace) | postgres |
| `workspace_secrets` | Per-workspace Drive tokens | postgres |
| `app_secrets` | Global secrets (legacy) | cybercontrol_app |
| `jobs` | Form-fill jobs | cybercontrol_app |
| `sessions` | Extension fill sessions | cybercontrol_app |
| `episodes` | Fill episodes (steps within a session) | cybercontrol_app |
| `corrections` | User corrections to AI fills | cybercontrol_app |
| `mappings` | Form field mappings (learned) | cybercontrol_app |
| `workflows` | Multi-step form workflows | cybercontrol_app |
| `auth_sessions` | Login refresh tokens | cybercontrol_app |
| `audit_events` | Activity log | cybercontrol_app |
| `whatsapp_sessions` | WhatsApp connection state | cybercontrol_app |
| `service_types` | Available services (form types) | cybercontrol_app |

---

## Table Details

### workspaces
Each cybercafe is a workspace. All data is isolated per workspace.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Workspace ID |
| name | varchar | Cafe name |
| plan | varchar | 'free' (default) |
| created_at | timestamp | |

### users
Operators who login to the app.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | Which workspace |
| email | varchar | Login email |
| phone | varchar | Optional |
| password_hash | varchar | bcrypt hash |
| name | varchar | Display name |
| role | varchar | 'admin' or 'operator' |
| status | varchar | 'active' |

### profiles
Customer data extracted from documents. One profile per person.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| primary_contact_phone | varchar | Household phone |
| name | varchar | Person name |
| relationship | varchar | 'self', 'father', 'mother', etc. |
| display_label | varchar | Shown in UI |
| data | jsonb | **All extracted fields** (name, dob, aadhaar_number, etc.) |
| created_by | uuid | Who created |

### drive_files
Every file received via WhatsApp, stored per workspace.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | Google Drive file ID |
| workspace_id | uuid (FK) | |
| file_name | varchar | Original or generated filename |
| mime_type | varchar | image/jpeg, application/pdf, etc. |
| customer_id | varchar | Phone number of sender |
| customer_name | varchar | Sender's name (saved contact name) |
| file_url | text | Drive thumbnail URL |
| profile_pic_url | text | Sender's WhatsApp DP (base64) |
| tag | varchar | Manual category tag (Aadhaar, PAN, etc.) |
| uploaded_at | timestamp | |

### workspace_secrets
Per-workspace credentials (Drive OAuth tokens).

| Column | Type | Description |
|--------|------|-------------|
| workspace_id | uuid | |
| key | varchar | 'drive_access_token' or 'drive_refresh_token' |
| value | text | Token value |
| updated_at | timestamp | |

### app_secrets
Global secrets (legacy, used as fallback).

| Column | Type | Description |
|--------|------|-------------|
| key | varchar (PK) | 'drive_access_token', 'drive_refresh_token' |
| value | text | |
| updated_at | timestamp | |

### jobs
Form-fill jobs created by operators.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| user_id | uuid | Who created |
| profile_id | uuid | Which customer profile |
| service_type | varchar | 'ssc_registration', 'rrb_ntpc', etc. |
| status | varchar | 'queued', 'in_progress', 'review_required', 'completed' |
| metadata | jsonb | Extra job data |
| session_id | uuid | Linked fill session |
| notes | text | Operator notes |

### sessions
Extension auto-fill sessions (one per form fill attempt).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| user_id | uuid | |
| profile_id | uuid | Which profile was used |
| hostname | varchar | Website filled (e.g. ssc.nic.in) |
| semantic_form_key | varchar | Form identifier |
| total_filled | integer | Fields successfully filled |
| total_failed | integer | Fields that failed |
| records | jsonb | Detailed fill log |

### corrections
When operator corrects an AI-filled field.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| session_id | uuid | Which fill session |
| hostname | varchar | Which website |
| semantic_form_key | varchar | Which form |
| corrections | jsonb | `{field: {old, new, selector}}` |

### mappings
Learned form field mappings (profile field → form selector).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| semantic_form_key | varchar | Form identifier |
| hostname | varchar | Website |
| mapping_data | jsonb | `{profile_field: {selector, type, ...}}` |
| source | varchar | 'ai', 'correction', 'manual' |
| confidence | float | 0-1 |
| fill_count | integer | Times used successfully |

### audit_events
Activity log for compliance.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| workspace_id | uuid (FK) | |
| user_id | uuid | |
| event_type | varchar | 'login', 'fill', 'extract', etc. |
| entity_type | varchar | 'profile', 'job', 'session' |
| entity_id | uuid | |
| metadata | jsonb | Extra context |

---

## Relationships

```
workspaces
  ├── users (many)
  ├── profiles (many)
  ├── drive_files (many)
  ├── workspace_secrets (many)
  ├── jobs (many)
  ├── sessions (many)
  ├── corrections (many)
  ├── mappings (many)
  └── audit_events (many)

profiles
  ├── jobs (many) — profile_id
  └── sessions (many) — profile_id

jobs
  └── sessions (one) — session_id
```

---

## Common Queries

```sql
-- All files for a workspace
SELECT * FROM drive_files WHERE workspace_id = 'xxx' ORDER BY uploaded_at DESC;

-- Customer profiles for a workspace
SELECT id, name, display_label, relationship, primary_contact_phone 
FROM profiles WHERE workspace_id = 'xxx' AND deleted_at IS NULL;

-- Profile data (extracted fields)
SELECT name, data->>'aadhaar_number' as aadhaar, data->>'dob' as dob 
FROM profiles WHERE workspace_id = 'xxx';

-- Drive tokens for a workspace
SELECT key, LEFT(value, 20) FROM workspace_secrets WHERE workspace_id = 'xxx';

-- Recent activity
SELECT event_type, entity_type, created_at FROM audit_events 
WHERE workspace_id = 'xxx' ORDER BY created_at DESC LIMIT 10;

-- Job status counts
SELECT status, COUNT(*) FROM jobs WHERE workspace_id = 'xxx' GROUP BY status;
```
