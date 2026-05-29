# CyberControl — Product Architecture

## Core Philosophy

CyberControl is a **customer memory system** for Indian cybercafe operators. It remembers every customer's documents, data, and history — so the operator never asks the same question twice, never says "ye nahi hoga", and never gets a form rejected.

The form-filling is the output. The real value is: **you know your customers better than any other cafe on the street.**

---

## User Mental Model

The operator thinks in 3 concepts:
1. **Customer** — a person he knows by name/face
2. **Form** — the government website he needs to fill
3. **Done / Not done** — did I finish this person's work?

The app must map to this mental model. No jargon (profiles, extraction, sessions, mappings).

---

## Habit Formation Design

```
CUE:        Customer walks in (or sends docs on WhatsApp)
CRAVING:    "I don't want to look incompetent"
RESPONSE:   Search customer → everything is there → fill
REWARD:     Customer impressed ("sab yaad hai aapko!")
LOCK-IN:    Going back to manual = losing professionalism
```

Key principles:
- Value is realized on the SECOND visit, not the first
- The app is the operator's memory — not a speed tool
- Trust builds through accuracy, not features
- First 3 experiences must be FLAWLESS

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vercel)                         │
│                    app.cybercontrol.fun                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Home /  │  │ Customer │  │  Photo   │  │  Form    │      │
│  │  Queue   │  │  Detail  │  │  Tool    │  │ Directory│      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│  │ WhatsApp │  │ Settings │  │  Admin   │                     │
│  │  Inbox   │  │          │  │  Panel   │                     │
│  └──────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
         │                              │
         │ REST API + WebSocket         │
         ▼                              ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│   BACKEND (GCP #1)      │   │  WHATSAPP (GCP #2)      │
│   api.cybercontrol.fun  │   │  34.100.147.20          │
│                         │   │                         │
│  • Auth (JWT)           │   │  • Baileys (port 3100)  │
│  • Customers/Profiles   │   │  • wwebjs resolver      │
│  • Form Directory       │   │    (port 3200)          │
│  • Extraction (Groq)    │   │  • File upload to Drive │
│  • Global Mappings      │   │  • Message dedup        │
│  • Sessions/Corrections │   │  • LID→Phone resolve    │
│  • Drive integration    │   │                         │
│  • Photo processing     │   │                         │
│                         │   │                         │
│  PostgreSQL             │   │  Session files          │
└─────────────────────────┘   └─────────────────────────┘
         │
         │
         ▼
┌─────────────────────────┐
│  CHROME EXTENSION       │
│                         │
│  • Form field detection │
│  • Profile → Field map  │
│  • Auto-fill execution  │
│  • Session recording    │
│  • Correction tracking  │
│  • Global mapping sync  │
└─────────────────────────┘
```

---

## Database Schema (Key Tables)

### customers (profiles)
```sql
profiles (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  primary_contact_phone TEXT,
  name TEXT,
  display_label TEXT,
  relationship TEXT,          -- self, spouse, child, parent
  data JSONB,                 -- all extracted fields with provenance
  created_by UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP
)
```

### forms (NEW — Form Directory)
> **IMPLEMENTATION NOTE (shipped):** The live table is missing 3 spec'd columns —
> `required_fields TEXT[]`, `deadline DATE`, `doc_specs JSONB`. The `steps` column
> exists but is not yet seeded. These are needed for: Customer Readiness Check
> (`required_fields`), deadline alerts (`deadline`), and document upload validation
> (`doc_specs`). Add via `ALTER TABLE` before building those features.
```sql
forms (
  id UUID PRIMARY KEY,
  name TEXT,                  -- "SSC CHSL 2025"
  short_name TEXT,            -- "SSC CHSL"
  portal TEXT,                -- "SSC"
  url TEXT,                   -- exact registration URL
  search_keywords TEXT[],     -- ["ssc", "chsl", "10+2", "ldc", "deo"]
  steps JSONB,                -- [{step: 1, title: "Register", description: "..."}]
  required_fields TEXT[],     -- ["name", "dob", "father_name", "aadhaar_number", ...]
  required_documents TEXT[],  -- ["Aadhaar", "10th Marksheet", "Photo", "Signature"]
  fee JSONB,                  -- {general: 100, obc: 50, sc_st: 0}
  deadline DATE,
  photo_specs JSONB,          -- {width: 100, height: 120, minKB: 4, maxKB: 12, format: "jpg", bg: "white"}
  signature_specs JSONB,      -- {width: 140, height: 60, minKB: 1, maxKB: 6, format: "jpg", bg: "white"}
  doc_specs JSONB,            -- [{name: "ID Proof", maxKB: 1000, formats: ["jpg","pdf"]}]
  fill_count INTEGER DEFAULT 0,
  last_filled_at TIMESTAMP,
  status TEXT DEFAULT 'active', -- active, expired, upcoming
  created_at TIMESTAMP
)
```

### global_mappings (NEW — Shared across workspaces)
```sql
global_mappings (
  id UUID PRIMARY KEY,
  semantic_form_key TEXT,     -- fingerprint of the form's fields
  form_id UUID REFERENCES forms(id),
  field_label TEXT,           -- normalized label from the form
  profile_key TEXT,           -- which profile field maps to it
  confidence FLOAT,           -- 0-1, based on how many operators confirmed this
  fill_count INTEGER,         -- how many times this mapping was used successfully
  correction_count INTEGER,   -- how many times operators corrected this
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(semantic_form_key, field_label)
)
```

### sessions (existing — enhanced)
```sql
sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  user_id UUID,
  form_id UUID REFERENCES forms(id),
  hostname TEXT,
  semantic_form_key TEXT,
  total_filled INTEGER,
  total_failed INTEGER,
  records JSONB,
  created_at TIMESTAMP
)
```

---

## Feature Modules

### 1. Home Screen — Work Queue

**Purpose:** Answer "Who needs my attention right now?"

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search form or customer...                   │
├─────────────────────────────────────────────────┤
│                                                 │
│ PENDING (needs action)                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ Rahul Kumar · sent 3 docs · not extracted   │ │
│ │ [Process Now]                               │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ READY (can fill anytime)                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ Shubham Kumar · SSC ready (95%)             │ │
│ │ [Fill SSC]                                  │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ RECENT                                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ Priya Devi · filled RRB · 2 hours ago       │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2. Form Directory — "Can I fill this?"

**Purpose:** Operator searches any form name → gets everything needed.

```
Search: "railway group d"

Result:
┌─────────────────────────────────────────────────┐
│ RRB Group D (CEN 02/2024)                       │
│ rrbcdg.gov.in                                   │
│                                                 │
│ Filled 234 times · Confidence: 95%              │
│ Deadline: 15 June 2026                          │
│                                                 │
│ Required Documents:                             │
│ • Aadhaar card                                  │
│ • 10th Marksheet                                │
│ • Passport photo (3.5×4.5cm, 20-50KB, JPG)     │
│ • Signature (3.5×1.5cm, 10-20KB, JPG)          │
│ • Caste certificate (if OBC/SC/ST)             │
│                                                 │
│ Fee: ₹500 (Gen) / ₹250 (OBC) / Free (SC/ST)  │
│                                                 │
│ Steps:                                          │
│ 1. Register on portal                           │
│ 2. Login → New Application                      │
│ 3. Personal Details ← auto-fill                 │
│ 4. Education Details ← auto-fill                │
│ 5. Upload Photo & Signature ← Photo Tool        │
│ 6. Pay fee                                      │
│ 7. Submit & Print                               │
│                                                 │
│ [Open Form]  [Check Customer Readiness]         │
└─────────────────────────────────────────────────┘
```

### 3. Photo Tool — Form-Aware Presets

**Purpose:** One-click photo/signature processing to exact specs.

```
┌─────────────────────────────────────────────────┐
│ Photo Tool                                      │
│                                                 │
│ PRESETS (from Form Directory):                  │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐     │
│ │ SSC Photo │ │ SSC Sign  │ │ RRB Photo │     │
│ │ 100×120px │ │ 140×60px  │ │ 3.5×4.5cm │     │
│ │ 4-12 KB   │ │ 1-6 KB    │ │ 20-50 KB  │     │
│ └───────────┘ └───────────┘ └───────────┘     │
│                                                 │
│ Drop image → auto-crop → auto-resize →         │
│ auto-compress → download ready file             │
│                                                 │
│ Live preview:                                   │
│ ┌─────────┐  Size: 11.2 KB ✓                  │
│ │         │  Dimensions: 100×120 ✓             │
│ │  Photo  │  Format: JPG ✓                     │
│ │         │  Background: White ✓               │
│ └─────────┘                                    │
│                                                 │
│ [Download] [Upload to Form]                     │
└─────────────────────────────────────────────────┘
```

### 4. Customer Detail — Memory View

**Purpose:** Everything about one customer in one place.

```
┌─────────────────────────────────────────────────┐
│ ← Shubham Kumar                                 │
│ +91 72093 72901 · Customer since March 2024     │
│                                                 │
│ READINESS                                       │
│ SSC ████████░░ 85%  [Fill Now]                  │
│ RRB ██████░░░░ 60%  Missing: 10th marksheet     │
│ Passport ███░░░░░░░ 30%  Missing: address proof │
│                                                 │
│ PROFILE DATA                                    │
│ Name: Shubham Kumar                             │
│ Father: Rajesh Kumar                            │
│ DOB: 15/03/1999                                 │
│ Aadhaar: 8234 5678 9012                         │
│ ... (expandable sections)                       │
│                                                 │
│ DOCUMENTS (4)                                   │
│ [Aadhaar Front] [Aadhaar Back] [10th] [Photo]  │
│                                                 │
│ HISTORY                                         │
│ • SSC CHSL filled — 15 Mar 2024                 │
│ • RRB Group D filled — 22 Jan 2024             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5. WhatsApp Inbox — Document Receiver

**Purpose:** Receive documents, auto-categorize, link to customers.

```
┌─────────────────────────────────────────────────┐
│ Inbox · 12 customers                            │
│                                                 │
│ [Search customers...]                           │
│                                                 │
│ Taruni Pandey · 3 new docs · 1h ago            │
│ Shubham Kumar · 1 new doc · 3h ago             │
│ ...                                             │
│                                                 │
│ ─── Chat View ───                               │
│                                                 │
│ [Aadhaar Front]  [Aadhaar Back]  [Greeting]    │
│  ✓ Categorized    ✓ Categorized   ✗ Not a doc  │
│                                                 │
│ [Select IDs] [Build Profile] [View Profile]     │
└─────────────────────────────────────────────────┘
```

### 6. Extension Popup — Fill Interface

**Purpose:** Select customer → fill form in 2 keystrokes.

```
┌─────────────────────────────────────────────────┐
│ ⚡ CyberControl          ● Connected            │
│                                                 │
│ 🏛 SSC — ssc.gov.in                            │
│ Filled 234 times · Confidence: 95%             │
│                                                 │
│ [Search customer...]                            │
│                                                 │
│ RECENT                                          │
│ ● Shubham Kumar · 7209372901                   │
│                                                 │
│ ⚠️ 85% complete — will skip: roll number       │
│                                                 │
│ [⚡ Fill Form]  [↩ Undo]                        │
│                                                 │
│ RESULTS                                         │
│ ✓ 12 Filled  ⚠ 2 Skipped  ✗ 1 Failed          │
│ ████████████░░░                                 │
│ Skipped: roll_number, passing_year              │
│ [Complete Profile →]                            │
└─────────────────────────────────────────────────┘
```

### 7. Global Mappings — Network Effect

**Purpose:** Every operator's experience benefits every other operator.

```
How it works:

Operator A fills SSC form for first time
  → Extension detects form fields
  → Maps profile fields to form fields
  → Saves mapping to global_mappings table
  → Records: "name" → input#applicant_name (confidence: 1.0)

Operator B (different city) opens same SSC form
  → Extension detects same semanticFormKey
  → Finds existing mapping (filled 234 times)
  → Auto-fills with 95% confidence
  → No AI needed, no fuzzy matching — exact mapping

Corrections improve the system:
  → If Operator B corrects a field, correction_count++
  → If correction_count > fill_count * 0.3 → mapping flagged for review
  → System gets better with every fill
```

---

## Data Flow — Complete Pipeline

```
STEP 1: Document Arrival
─────────────────────────
Customer sends photo on WhatsApp
  → WhatsApp service (GCP #2) receives
  → Uploads to Google Drive
  → Notifies backend via webhook
  → Backend stores file reference
  → Frontend shows notification
  → [FUTURE] Auto-categorize (Aadhaar/PAN/Photo/Junk)

STEP 2: Data Extraction
─────────────────────────
Operator selects documents → clicks "Build Profile"
  → Frontend sends files to POST /process/extract (parallel)
  → Backend downloads from Drive → sends to Groq Vision
  → Groq returns structured fields (name, DOB, address, etc.)
  → Frontend shows review modal
  → Operator confirms → PATCH /customers/persons/:id
  → Profile data stored with provenance (source, documentId, confidence)

STEP 3: Form Search & Readiness
─────────────────────────────────
Customer asks for a form
  → Operator searches in Form Directory
  → App shows: form details, required docs, photo specs, fee
  → App checks customer profile against required_fields
  → Shows readiness: "85% ready — missing: roll number"
  → Operator knows exactly what to ask customer for

STEP 4: Photo/Signature Preparation
─────────────────────────────────────
Operator opens Photo Tool
  → Selects form preset (e.g., "SSC Photo")
  → Drops customer's photo
  → Auto-crop to face, resize to 100×120px, compress to 4-12KB
  → Live preview with spec validation (✓ size, ✓ dimensions, ✓ format)
  → Download or direct upload to form

STEP 5: Form Filling
──────────────────────
Operator opens govt form website
  → Opens extension popup
  → Searches/selects customer
  → Sees completeness warning if profile incomplete
  → Clicks "Fill Form"
  → Extension:
    1. Detects form fields (semanticFormKey)
    2. Checks global_mappings for this form
    3. If found: uses proven mapping (high confidence)
    4. If not found: fuzzy match + AI mapping (lower confidence)
    5. Fills fields sequentially with proper events
    6. Shows results: filled/skipped/failed with field names
  → Operator verifies (form is filled but NOT submitted)
  → Operator submits manually (keeps control)

STEP 6: Learning & Improvement
────────────────────────────────
After fill:
  → Session recorded (which fields filled, which skipped)
  → Mapping saved/updated in global_mappings
  → If operator corrects a field → correction recorded
  → Next time same form is filled → mapping is better
  → Network effect: all operators benefit from each fill
```

---

## Resistance Elimination Design

### First-time on a new form:
```
"First time filling this form with CyberControl.
 Filled 234 times by other operators. Confidence: 95%.
 I'll fill fields I'm sure about. You verify the rest."
```

### First-time ever (new operator):
```
Conservative mode:
- Only fill 100% confidence fields (name, DOB from Aadhaar)
- Leave ambiguous fields empty (better empty than wrong)
- Show exactly what was filled
- Build trust through accuracy, not completeness
```

### After a mistake:
```
"Last time: 2 fields needed correction.
 I've learned from that. This time filling 18/20 fields."
```

---

## Photo/Signature Specs Database (Initial Seed)

| Form | Photo | Signature |
|------|-------|-----------|
| SSC (all exams) | 100×120px, 4-12KB, JPG, white bg | 140×60px, 1-6KB, JPG, white bg |
| RRB (all exams) | 3.5×4.5cm (413×531px), 20-50KB, JPG | 3.5×1.5cm (413×177px), 10-20KB, JPG |
| UPSC | 2×2 inch (600×600px), 20-300KB, JPG | 2×1 inch, 1-40KB, JPG |
| NTA (JEE/NEET) | 3.5×4.5cm, 10-200KB, JPG, white bg | 3.5×1.5cm, 4-30KB, JPG, white bg |
| Passport | 2×2 inch (600×600px), 10-300KB, JPG, white bg | 2×0.7 inch, 10-300KB, JPG |
| Bihar Board | 200×230px, 50-100KB, JPG | 200×70px, 20-50KB, JPG |
| UP Board | 3.5×4.5cm, 10-100KB, JPG | 3.5×1.5cm, 5-40KB, JPG |
| IBPS (Bank) | 200×230px, 20-50KB, JPG, white bg | 140×60px, 10-20KB, JPG, white bg |
| Indian Army | 3.5×4.5cm, 10-50KB, JPG | 3.5×1.5cm, 10-20KB, JPG |
| Railway (NTPC) | 3.5×4.5cm, 20-50KB, JPG | 3.5×1.5cm, 10-20KB, JPG |
| State PSC | varies by state | varies by state |
| Digilocker | 200×200px, <100KB, JPG/PNG | — |
| PAN Card | 2×2 inch, <100KB, JPG | 2×1 inch, <100KB, JPG |
| Voter ID | 4.5×3.5cm, <100KB, JPG | — |
| Ration Card | varies by state | varies by state |

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| AI/Vision | Groq (Llama 4 Scout) |
| WhatsApp | Baileys + wwebjs |
| File Storage | Google Drive API |
| Extension | Chrome MV3 (service worker) |
| Hosting | GCP (2 instances) + Vercel |
| Domain | cybercontrol.fun (Hostinger) |

---

## Success Metrics

| Metric | What it measures |
|--------|-----------------|
| Forms filled / day / operator | Is the tool being used? |
| Correction rate | Is the fill accurate? (lower = better) |
| New form types filled | Is the directory growing? |
| Returning customer fills | Is the "memory" value working? |
| "First fill" success rate | Is onboarding smooth? |
| Time from doc received → profile ready | Is extraction fast enough? |
| Forms the operator couldn't fill before | Is capability expanding? |

---

## Build Priority

### Phase 1 — Foundation (Current)
- [x] WhatsApp document receiving
- [x] AI extraction (Groq Vision)
- [x] Customer profiles with provenance
- [x] Chrome extension form filling
- [x] Photo Tool (crop, resize, print)
- [x] Session recording

### Phase 2 — Form Directory & Presets
- [x] `forms` table + seed top 15 forms (with photo/signature specs)
- [x] Form search API (`/api/forms/search`) + UI (`/app/forms`)
- [x] Home search + nav wired to Form Directory
- [x] Photo/signature processor per form (`/app/forms/photo` — auto resize+compress to exact specs)
- [ ] Customer readiness check (profile vs form required_fields)
- [ ] "Filled X times" confidence badge in extension
- [ ] Form steps + deadline fields (seeded, not yet shown in UI)

### Phase 2.5 — Customer-Centric Restructure (THE core reframe)
> The app is reorganized around CUSTOMERS, not features. Operator thinks
> "Customer aaya → kaam karo → done." Home = work queue, not a stats dashboard.
- [x] Home screen = work queue (`/api/dashboard/queue`) — customers grouped by status
- [x] Status states: new (blue, just arrived) / pending (yellow, not extracted) / ready (green, can fill)
- [x] Unified search on home: forms AND customers in one box
- [x] Nav relabeled: Today / Customers / Find Form / Documents / Photo Tool (removed Jobs, Dashboard, separate Documents page)
- [x] CustomerDetail = Memory View (readiness bar, profile data, docs, inline edit)
- [x] Per-customer per-form readiness ("SSC 85%, missing 10th marksheet") — `/api/forms/readiness/:phone`
- [x] Auto-extract on doc arrival (background, cached) — Build Profile is now instant; operator still reviews (trust preserved)

### Phase 3 — Network Effect
- [x] Global mappings (already cross-workspace — single shared form_mappings.json keyed by semanticFormKey)
- [x] Live fill_count + confidence per form (matches session hostnames across ALL workspaces)
- [x] "Filled X times · 95%" social-proof badge in Form Directory + `/api/forms/confidence` for extension
- [x] Extension popup confidence badge ("filled 29× · 100%" / "first time — I'll fill what I'm sure about")
- [x] Post-fill "see what was filled" summary (label → value list, builds trust — "show, don't just do")
- [ ] "First time on this form" conservative mode (autofill engine: only high-confidence fields on new forms)
- [ ] Correction-based learning (confidence drops when corrections rise)

### Phase 4 — Habit Formation
- [x] Home screen = work queue (PENDING / READY sections with action buttons)
- [x] Auto-extract on document arrival (cached, instant Build Profile)
- [ ] "What's missing" proactive notifications
- [ ] Form deadline alerts
- [ ] Daily stats (forms filled, accuracy)

### Phase 5 — Scale
- [ ] Multi-operator per workspace
- [ ] Operator onboarding flow
- [ ] Form directory crowdsourcing
- [ ] Regional form support (state-specific)
- [ ] Hindi/regional language UI
