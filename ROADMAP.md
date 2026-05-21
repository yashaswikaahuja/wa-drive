# CyberControl — Build Roadmap

## Isolation Rules (NEVER break these)

### Rule 1: One folder = One service
```
cybercontrol/
├── gateway/        ← ONLY auth, routing, websocket
├── whatsapp/       ← ONLY WhatsApp connection + file receiving
├── storage/        ← ONLY Google Drive upload/download
├── extraction/     ← ONLY AI document reading
├── profiles/       ← ONLY customer data CRUD
├── frontend/       ← ONLY UI
├── extension/      ← ONLY form filling
└── shared/         ← ONLY types + constants (NO logic)
```

### Rule 2: Services talk via HTTP only
- Service A NEVER imports code from Service B
- Service A calls Service B via `fetch('http://service-b:port/endpoint')`
- If Service B is down, Service A handles the error gracefully

### Rule 3: One service at a time
- Build service completely
- Test it alone (without other services)
- Only then connect it to the next service
- Never work on 2 services simultaneously

### Rule 4: Each service has its own
- `package.json` (own dependencies)
- `.env` (own config)
- `Dockerfile` or start script
- Health endpoint (`GET /health`)
- Error handling (never crashes, always responds)

### Rule 5: Database access
- Only `gateway` and `profiles` service touch PostgreSQL directly
- Other services send data TO gateway, gateway saves it
- This prevents 5 services fighting over DB connections

---

## Build Order

### Step 1: WhatsApp Service (Week 1)

**What it does:**
- Connects to WhatsApp via QR (using wwebjs)
- Receives images/PDFs from customers
- Sends received files to Gateway via webhook
- Manages multiple sessions (one per cafe)

**Inputs:**
- Start session command (workspace ID)
- Stop session command

**Outputs:**
- QR code (for frontend to display)
- Connection status (connected/disconnected)
- File webhook: `POST /gateway/webhook/file` with file buffer + sender info

**Does NOT:**
- Upload to Drive (that's Storage service's job)
- Save to database (that's Gateway's job)
- Know about customers or profiles

**Test alone:**
```
1. Start service
2. Connect WhatsApp (scan QR)
3. Send a photo from phone
4. Verify: service logs "received file from +91XXXXXXXXXX"
5. Verify: service calls webhook URL with file data
```

**Files:**
```
whatsapp/
├── src/
│   ├── index.js          ← Express server + health endpoint
│   ├── session.js        ← Create/destroy wwebjs sessions
│   └── handlers.js       ← On message received → call webhook
├── package.json
├── .env.example
└── README.md
```

---

### Step 2: Storage Service (Week 2)

**What it does:**
- Receives file buffer → uploads to Google Drive
- Downloads file from Drive by ID
- Manages OAuth tokens per workspace (refresh automatically)

**Inputs:**
- Upload: file buffer + workspace ID + metadata
- Download: file ID + workspace ID

**Outputs:**
- Upload result: Drive file ID + thumbnail URL
- Download result: file buffer

**Does NOT:**
- Know about WhatsApp
- Know about customers
- Save metadata to database (Gateway does that)

**Test alone:**
```
1. Start service
2. Call POST /upload with a test image + workspace ID
3. Verify: file appears in Google Drive
4. Call GET /download/:id
5. Verify: get the image back
```

**Files:**
```
storage/
├── src/
│   ├── index.js          ← Express server + health endpoint
│   ├── drive.js          ← Google Drive upload/download
│   └── tokens.js         ← OAuth token management per workspace
├── package.json
├── .env.example
└── README.md
```

---

### Step 3: API Gateway + Database (Week 3)

**What it does:**
- Authenticates users (login, register, JWT)
- Routes requests to correct service
- Saves metadata to PostgreSQL
- WebSocket for real-time updates to frontend
- Receives webhooks from WhatsApp service

**Inputs:**
- Frontend API calls (authenticated)
- WhatsApp webhook (new file received)

**Outputs:**
- JSON responses to frontend
- WebSocket events (new file, status change)

**Does NOT:**
- Connect to WhatsApp directly
- Upload files to Drive directly
- Run AI extraction

**Test alone:**
```
1. Start service + PostgreSQL
2. Register a user
3. Login → get JWT
4. Call authenticated endpoints
5. Simulate webhook from WhatsApp → verify DB entry created
```

**Files:**
```
gateway/
├── src/
│   ├── index.js          ← Express + WebSocket server
│   ├── auth.js           ← Login, register, JWT, refresh
│   ├── routes/
│   │   ├── files.js      ← File list, tag, metadata
│   │   ├── whatsapp.js   ← Proxy to WhatsApp service
│   │   ├── storage.js    ← Proxy to Storage service
│   │   ├── profiles.js   ← Customer CRUD (direct DB)
│   │   ├── jobs.js       ← Job management
│   │   └── admin.js      ← Super admin endpoints
│   ├── middleware/
│   │   ├── auth.js       ← JWT verification
│   │   └── rateLimit.js  ← Rate limiting
│   ├── webhook.js        ← Handle incoming webhooks
│   ├── socket.js         ← WebSocket room management
│   └── db.js             ← PostgreSQL pool
├── migrations/
│   └── 001_initial.sql
├── package.json
├── .env.example
└── README.md
```

---

### Step 4: Frontend — Operator Dashboard (Week 4)

**What it does:**
- Login/register screen
- WhatsApp inbox (see received files)
- Customer list + profiles
- Settings (connect WhatsApp, connect Drive)

**Talks to:** API Gateway ONLY (one URL)

**Does NOT:**
- Call WhatsApp service directly
- Call Storage service directly
- Have any business logic

**Test alone:**
```
1. Start frontend dev server
2. Mock API responses
3. Verify all screens render
4. Connect to real Gateway → verify full flow
```

**Files:**
```
frontend/
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Inbox.tsx
│   │   ├── Customers.tsx
│   │   ├── Settings.tsx
│   │   └── Profile.tsx
│   ├── components/       ← Reusable UI pieces
│   ├── hooks/            ← API calls, auth state
│   └── lib/              ← Utilities
├── package.json
└── vite.config.ts
```

---

### Step 5: Extraction Service (Week 5)

**What it does:**
- Receives image/PDF buffer
- Sends to Groq Vision API
- Returns structured JSON (name, DOB, Aadhaar, etc.)
- Handles PDF→image conversion

**Inputs:**
- Image buffer OR file ID (downloads from Storage service)

**Outputs:**
- JSON with extracted fields

**Does NOT:**
- Save results (Gateway does that)
- Know about customers
- Access database

**Test alone:**
```
1. Start service
2. POST /extract with an Aadhaar card image
3. Verify: returns {name: "...", aadhaar_number: "...", ...}
```

**Files:**
```
extraction/
├── src/
│   ├── index.js          ← Express server
│   ├── extract.js        ← Groq API call + response parsing
│   └── pdf.js            ← PDF to image conversion
├── package.json
├── .env.example
└── README.md
```

---

### Step 6: Extension (Week 6)

**What it does:**
- Detects form fields on government websites
- Maps profile fields → form fields (fuzzy + AI)
- Fills fields sequentially
- Records what was filled/failed

**Talks to:** API Gateway ONLY

**Does NOT:**
- Access database
- Know about WhatsApp or Drive
- Store data locally (except auth token)

**Test alone:**
```
1. Load extension in Chrome
2. Open a test form
3. Click Fill → verify fields populated
4. Check session recorded in backend
```

---

### Step 7: Photo Tool (Week 7)

**What it does:**
- Passport photo grid generation
- Background removal
- Aadhaar layout (front + back)

**Lives inside:** Gateway (as a route) OR separate service

**Test alone:**
```
1. Upload a photo
2. Call /photos/passport-sheet
3. Verify: get a 4x6 grid image back
```

---

### Step 8: Admin + Super Admin (Week 8)

**What it does:**
- Super Admin: view all workspaces, health, errors, analytics
- Cafe Admin: manage operators, view usage

**Lives inside:** Frontend (separate pages, same app)

---

## Connection Diagram (Final State)

```
Phone sends WhatsApp message
    │
    ▼
[WhatsApp Service] receives file
    │
    │ POST /webhook/file (buffer + sender info)
    ▼
[API Gateway] receives webhook
    │
    ├─── POST to [Storage Service]: "upload this file"
    │         │
    │         └─── Returns: {driveId, thumbnailUrl}
    │
    ├─── Saves metadata to PostgreSQL
    │
    └─── Emits WebSocket event to frontend
              │
              ▼
         [Frontend] shows new file in inbox
```

```
Operator clicks "Extract"
    │
    ▼
[Frontend] → POST /api/extract {fileId}
    │
    ▼
[API Gateway]
    │
    ├─── GET from [Storage Service]: download file
    │
    ├─── POST to [Extraction Service]: extract from image
    │         │
    │         └─── Returns: {name, dob, aadhaar_number, ...}
    │
    └─── Returns extracted fields to frontend
```

```
Operator clicks "Fill Form"
    │
    ▼
[Extension] → GET /api/profiles/:id (get customer data)
    │
    ├─── GET /api/mappings/:formKey (get saved mappings)
    │
    ├─── Fills form fields
    │
    └─── POST /api/sessions (save fill record)
```

---

## Deployment Map

| Service | Where | Port | Start command |
|---------|-------|------|---------------|
| WhatsApp | GCP #2 | 3100 | `node src/index.js` |
| Storage | GCP #1 | 3200 | `node src/index.js` |
| Extraction | GCP #1 | 3300 | `node src/index.js` |
| Gateway | GCP #1 | 3000 | `node src/index.js` |
| Frontend | Vercel | 443 | auto-deploy |
| PostgreSQL | GCP #1 | 5432 | system service |

---

## How to NOT get intermixed

| Temptation | What to do instead |
|-----------|-------------------|
| "Let me just add Drive upload inside WhatsApp service" | NO. WhatsApp sends to Gateway. Gateway calls Storage. |
| "Let me import the auth module in extraction service" | NO. Gateway handles auth. Extraction trusts Gateway's internal call. |
| "Let me save to DB from WhatsApp service" | NO. WhatsApp sends webhook. Gateway saves. |
| "Let me call Groq from the frontend" | NO. Frontend calls Gateway. Gateway calls Extraction. |
| "Let me add a quick fix to production" | NO. Edit source → test → build → deploy. |

---

## Definition of Done (per service)

Before moving to next service, current one must have:
- [ ] Health endpoint working
- [ ] All endpoints tested manually
- [ ] Error handling (never crashes)
- [ ] README with setup instructions
- [ ] .env.example with all required variables
- [ ] Can start and stop independently
- [ ] Logs clearly (what happened, when, for which workspace)
