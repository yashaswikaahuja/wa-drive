# CyberControl — Product Requirements Document (PRD)

**Version:** 2.0  
**Date:** May 2026  
**Author:** CyberControl Team  
**Status:** Planning

---

## 1. Vision

CyberControl automates document handling and government form-filling for Indian cybercafes. Operators receive customer documents via WhatsApp, extract data using AI, build structured profiles, and auto-fill exam/government forms — reducing a 30-minute manual process to 2 minutes.

---

## 2. Target Users

| User Type | Who | Needs |
|-----------|-----|-------|
| **Operator** | Cybercafe staff (non-technical) | Simple UI, fast workflow, Hindi support |
| **Cafe Admin** | Cafe owner | Usage reports, operator management, billing |
| **Super Admin** | CyberControl company | System monitoring, analytics, revenue, health |

---

## 3. Core Value Proposition

- **For operators:** "Customer walks in → sends docs on WhatsApp → form filled in 2 minutes"
- **For cafe owners:** "More customers served per hour, fewer errors, no training needed"
- **For CyberControl:** "Recurring revenue per cafe, scalable SaaS model"

---

## 4. Product Architecture

### 4.1 Services

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                      │
│  Operator Dashboard | Admin Panel | Super Admin Panel    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│                   API GATEWAY                             │
│  Auth | Routing | Rate Limiting | Logging | WebSocket    │
└──┬─────────┬──────────┬──────────┬──────────┬──────────┘
   │         │          │          │          │
   ▼         ▼          ▼          ▼          ▼
┌──────┐ ┌───────┐ ┌────────┐ ┌───────┐ ┌────────┐
│  WA  │ │Storage│ │Extract │ │Profile│ │  Jobs  │
│Service│ │Service│ │Service │ │Service│ │Service │
└──────┘ └───────┘ └────────┘ └───────┘ └────────┘
```

### 4.2 Service Responsibilities

| Service | Responsibility | Does NOT do |
|---------|---------------|-------------|
| **API Gateway** | Auth, routing, WebSocket, rate limiting | Business logic |
| **WhatsApp Service** | Receive files, send messages, manage sessions | Store files, extract data |
| **Storage Service** | Upload/download files to Google Drive | Know about WhatsApp |
| **Extraction Service** | AI document reading (Groq Vision) | Store results |
| **Profile Service** | Customer CRUD, profile data | File handling |
| **Jobs Service** | Form-fill job management, sessions, corrections | Fill forms |
| **Frontend** | UI rendering | Business logic |
| **Extension** | Form detection, field filling | Store data |

### 4.3 Communication Rules

1. Frontend → API Gateway only
2. Extension → API Gateway only
3. WhatsApp Service → API Gateway only (webhook)
4. Services NEVER import code from each other
5. Services communicate via HTTP REST
6. Database accessed only through services (not directly)
7. Each service has its own error handling — failures don't cascade

---

## 5. Features by Phase

### Phase 1: Core (MVP) — "One cafe works perfectly"

#### F1.1 WhatsApp Document Receiving
- Operator connects WhatsApp via QR scan
- Customers send images/PDFs → appear in operator's inbox
- Show sender name, phone number, profile picture
- Support: images, PDFs, documents (no video/audio)
- Real-time: file appears within 3 seconds of sending

#### F1.2 File Storage
- Files uploaded to operator's Google Drive automatically
- Each workspace has isolated Drive storage
- Files organized by customer phone number
- Thumbnail generation for preview
- Download/print from dashboard

#### F1.3 Customer Profiles
- Create customer from WhatsApp chat (name + phone)
- One household = one phone, multiple persons (self, father, mother, etc.)
- Profile stores all extracted data (name, DOB, Aadhaar, address, etc.)
- Edit any field manually
- Search customers by name/phone

#### F1.4 Operator Dashboard
- Inbox: see all WhatsApp chats with documents
- Customer list: search, view profiles
- Settings: connect WhatsApp, connect Drive
- Simple, clean UI — works on 1366x768 screens

#### F1.5 Authentication
- Email + password login
- Google OAuth login
- JWT tokens (24h access, 7d refresh)
- Multi-workspace isolation

---

### Phase 2: Intelligence — "AI does the work"

#### F2.1 Document Extraction
- Select document(s) → click "Extract"
- AI reads: name, DOB, gender, Aadhaar number, PAN, address, education, etc.
- Operator reviews extracted fields → confirms → saved to profile
- Supports: Aadhaar, PAN, Voter ID, Passport, Marksheets, Admit Cards, Bank docs
- PDF conversion (pdftoppm) before extraction

#### F2.2 Chrome Extension — Form Auto-Fill
- Operator opens government form website
- Extension popup shows customer profiles
- Click "Fill" → form fields populated automatically
- Fuzzy matching: profile fields → form fields
- AI mapping for unknown fields (Groq)
- Cascade dropdown support (State → District → City)
- DOB date picker handling
- Session recording (what was filled, what failed)

#### F2.3 Photo Tool
- Passport photo grid (4x6, A4, various sizes)
- Background removal
- Aadhaar front+back layout
- Name/date/signature text on photos
- Print directly

---

### Phase 3: Scale — "10+ cafes"

#### F3.1 Cafe Admin Panel
- Add/remove operators
- View usage: files received, forms filled, per operator
- Subscription status
- Connect/disconnect WhatsApp and Drive

#### F3.2 Onboarding Flow
- New cafe signs up → creates workspace
- Guided setup: connect WhatsApp → connect Drive → add first customer
- Trial period (7 days free)

#### F3.3 Billing
- Plans: Free (5 customers), Basic (₹500/month, 50 customers), Pro (₹1000/month, unlimited)
- Razorpay integration
- Auto-renewal, invoice generation

---

### Phase 4: Company Operations — "Run the business"

#### F4.1 Super Admin Dashboard
- Total workspaces, active users, files processed today
- Revenue: MRR, churn, growth
- System health: all services status, uptime

#### F4.2 Workspace Management
- View all cafes: status, plan, last active, issues
- Impersonate operator (for debugging)
- Force disconnect/reconnect WhatsApp
- Feature flags per workspace

#### F4.3 Error Tracking
- All errors logged with: workspace, user, service, timestamp, stack trace
- Group by type: WhatsApp errors, Drive errors, extraction failures, extension errors
- Alert on spike (email/Telegram notification)

#### F4.4 Analytics
- Files received per day/week/month
- Extractions per day
- Forms filled per day
- Per-cafe breakdown
- Retention: how often operators use the app

#### F4.5 Release Management
- Version tracking per service
- Deploy history
- Rollback capability
- Changelog visible to operators

---

## 6. Database Schema

### 6.1 Core Tables

```sql
-- Multi-tenancy
workspaces (id, name, plan, status, created_at)
users (id, workspace_id, email, password_hash, name, role, status)

-- Customer data
profiles (id, workspace_id, phone, name, relationship, display_label, data JSONB)

-- Files
files (id, workspace_id, drive_file_id, file_name, mime_type, 
       sender_phone, sender_name, sender_dp, tag, extracted, created_at)

-- Form filling
jobs (id, workspace_id, profile_id, service_type, status, metadata JSONB)
sessions (id, workspace_id, user_id, profile_id, hostname, 
          total_filled, total_failed, records JSONB, created_at)
corrections (id, workspace_id, session_id, hostname, corrections JSONB)
mappings (id, workspace_id, hostname, form_key, mapping_data JSONB, confidence)

-- WhatsApp
whatsapp_connections (id, workspace_id, phone, status, connected_at)

-- Secrets (per workspace)
workspace_secrets (workspace_id, key, value, updated_at)

-- Admin
audit_log (id, workspace_id, user_id, action, entity, metadata JSONB, created_at)
error_log (id, service, workspace_id, error_type, message, stack, created_at)
```

### 6.2 Design Principles
- Every table has `workspace_id` for isolation
- JSONB for flexible data (profile fields, session records)
- No JSON files on disk — everything in PostgreSQL
- Soft deletes (`deleted_at`) for important data
- Indexes on frequently queried columns

---

## 7. API Design

### 7.1 Gateway Endpoints

```
Auth:
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/google
  POST   /api/auth/refresh
  GET    /api/auth/me

WhatsApp:
  GET    /api/whatsapp/status
  POST   /api/whatsapp/connect
  POST   /api/whatsapp/disconnect
  POST   /api/whatsapp/send

Files:
  GET    /api/files                    (list for workspace)
  GET    /api/files/:id/download
  PATCH  /api/files/:id/tag
  POST   /api/files/upload             (webhook from WhatsApp service)

Profiles:
  GET    /api/customers/households
  POST   /api/customers/persons
  PATCH  /api/customers/persons/:id
  GET    /api/profiles/:id

Extraction:
  POST   /api/extract                  (fileId → extracted fields)

Jobs:
  POST   /api/jobs
  GET    /api/jobs
  PATCH  /api/jobs/:id
  PATCH  /api/jobs/:id/progress

Sessions:
  POST   /api/sessions
  GET    /api/sessions
  GET    /api/sessions/:id

Mappings:
  GET    /api/mappings/:formKey
  POST   /api/mappings/:formKey

Photo Tool:
  POST   /api/photos/passport-sheet
  POST   /api/photos/aadhaar-layout
  POST   /api/photos/face-align

Settings:
  GET    /api/settings/drive/status
  GET    /api/settings/drive/auth
  GET    /api/settings/drive/callback

Admin (Super):
  GET    /api/admin/workspaces
  GET    /api/admin/health
  GET    /api/admin/errors
  GET    /api/admin/analytics
```

### 7.2 Internal Service APIs (not exposed to frontend)

```
WhatsApp Service (port 3100):
  POST   /sessions/start
  POST   /sessions/stop
  GET    /sessions/:id/status
  GET    /health

Storage Service (port 3200):
  POST   /upload          (buffer + metadata → Drive)
  GET    /download/:id    (Drive file → buffer)
  GET    /health

Extraction Service (port 3300):
  POST   /extract         (image buffer → JSON fields)
  GET    /health
```

---

## 8. Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React + Vite + Tailwind | Fast, modern, easy to maintain |
| API Gateway | Node.js + Express | Simple, proven, same language as services |
| WhatsApp | wwebjs (whatsapp-web.js) | Stable, resolves LID, gets DP, your experience with it |
| Storage | Node.js + googleapis | Official Google Drive SDK |
| Extraction | Node.js + Groq API | Fast, cheap, good with Indian docs |
| Database | PostgreSQL | Reliable, JSONB support, free |
| Hosting | GCP (2 instances) or 1 larger VPS | Cost-effective |
| Frontend hosting | Vercel | Free, auto-deploy from git |
| Extension | Chrome MV3 | Required for form filling |

---

## 9. Deployment Strategy

### 9.1 Development
```
Local: docker-compose up → all services run locally
Test: each service has its own test suite
```

### 9.2 Production
```
GCP #1: API Gateway + Storage + Extraction + Profile + Jobs + PostgreSQL
GCP #2: WhatsApp Service (isolated — if it crashes, nothing else affected)
Vercel: Frontend
```

### 9.3 Deploy Process
```
1. Edit code in service folder
2. Run tests for that service
3. Build
4. Deploy ONLY that service
5. Verify via health endpoint
```

---

## 10. Monitoring & Observability

| What | How |
|------|-----|
| Uptime | UptimeRobot (free) — ping /health every 5 min |
| Errors | error_log table + Super Admin panel |
| Performance | Response time logging in Gateway |
| Business metrics | Analytics queries on DB |
| Alerts | Email on downtime, Telegram bot for critical errors |

---

## 11. Security

| Concern | Solution |
|---------|----------|
| Auth | JWT with refresh tokens, bcrypt passwords |
| Data isolation | Every query filtered by workspace_id |
| Secrets | Environment variables, never in code |
| API abuse | Rate limiting on Gateway |
| Drive access | Per-workspace OAuth tokens |
| Extension | Communicates only via authenticated API |

---

## 12. Build Order & Timeline

| Week | What | Deliverable |
|------|------|-------------|
| 1 | WhatsApp Service (wwebjs) | Receives files, QR works, stable |
| 2 | Storage Service + Database | Files saved to Drive, metadata in DB |
| 3 | API Gateway + Auth | Login works, routes to services |
| 4 | Frontend (Operator) | Inbox, customers, settings |
| 5 | Extraction Service | AI reads documents |
| 6 | Extension | Form auto-fill |
| 7 | Photo Tool | Passport photos |
| 8 | Admin + Super Admin | Monitoring, billing |

---

## 13. Success Metrics

| Metric | Target (Month 1) | Target (Month 6) |
|--------|------------------|-------------------|
| Active cafes | 5 | 30 |
| Files processed/day | 50 | 500 |
| Forms filled/day | 10 | 100 |
| Uptime | 95% | 99% |
| Avg response time | <2s | <1s |
| Operator satisfaction | "It works" | "Can't work without it" |

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WhatsApp blocks number | High | Multiple numbers, official API as backup |
| Groq API down | Medium | Cache last extraction, retry queue |
| GCP instance dies | High | Auto-restart, monitoring alerts |
| Operator can't use UI | Medium | Simple design, Hindi tooltips, video tutorials |
| Drive token expires | Low | Auto-refresh, clear error message |
| Extension breaks on site update | Medium | AI mapping adapts, manual correction fallback |

---

## 15. Open Decisions

- [ ] Baileys vs wwebjs for WhatsApp (recommend: wwebjs based on your experience)
- [ ] Docker vs PM2 for service management
- [ ] Single repo (monorepo) vs separate repos per service
- [ ] Pricing model finalization
- [ ] Hindi language support priority

---

*This document is the single source of truth. Every feature we build must trace back to a requirement here. No random additions.*
