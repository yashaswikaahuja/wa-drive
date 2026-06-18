# WhatsApp Service — CyberControl

Multi-tenant WhatsApp session manager for CyberControl SaaS. Each workspace (cybercafe) gets its own independent WhatsApp connection. Runs on a **separate GCP instance** (GCP #2) dedicated to WhatsApp processing.

> ⚠️ **Current topology (2026-06-18) — see `deploy/docs/GHCR.md` §4 for the source of truth.**
> The diagrams below describe the older single-box layout (one GCP #2 holding both the resolver and
> the whatsapp-service shard at IP `34.100.147.20`). It has changed:
> - **resolver** (`:3200`) → runs on `cybercontrol-wa` (kishynay proj `cybercontrol-db-20260605`)
> - **whatsapp-service shard** (`:3100`) → runs on `cybercontrol-wa-2` (same project)
> - **backend/parent** → `cybercontrol-app` (kishynay), public at `api.cybercontrol.fun`
> Always address hosts by their **tailnet MagicDNS names** (`cybercontrol-wa`, `cybercontrol-app`,
> `cybercontrol-db`), never by IP — IPs change on rebuild.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  GCP #1 — Parent (136.115.232.70)                            │
│  ├─ Backend API (api.cybercontrol.fun:3000)                  │
│  ├─ PostgreSQL                                               │
│  ├─ Google Drive upload + storage                            │
│  └─ Proxies /api/whatsapp/* → GCP #2                         │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTPS (34.100.147.20:3100)
┌─────────────────────▼────────────────────────────────────────┐
│  GCP #2 — WhatsApp (34.100.147.20)                           │
│  ├─ WhatsApp Service (port 3100) — Baileys multi-session     │
│  │   ├─ Receives media from WhatsApp                         │
│  │   ├─ Resolves LID → real phone via Resolver               │
│  │   ├─ Uploads files to Parent API                          │
│  │   └─ Retry queue + disk persistence                       │
│  └─ WhatsApp Resolver (port 3200) — wwebjs + Chromium        │
│      ├─ Resolves LID → phone number                          │
│      ├─ Fetches profile pictures                             │
│      └─ Returns saved contact names                          │
└─────────────────────┬────────────────────────────────────────┘
                      │ WhatsApp Web Protocol
┌─────────────────────▼────────────────────────────────────────┐
│  WhatsApp Servers                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---------|-------------|
| Multi-tenant sessions | Each workspace has its own Baileys session in `./sessions/{workspaceId}/` |
| LID → Phone resolution | Automatically resolves WhatsApp's anonymous LIDs to real phone numbers via wwebjs resolver |
| Saved contact names | Shows the name saved in operator's phone contacts (not just pushName) |
| Profile picture fetch | Downloads sender's DP as base64 (permanent, never expires) |
| Auto-reconnect | Exponential backoff: 5s → 10s → 30s → 60s max |
| Auto-start on boot | All saved sessions start automatically when PM2 restarts |
| Retry queue | 3 in-memory retries, then saves to disk for later processing |
| File-based persistence | Failed uploads saved to `./upload_queue/` and retried every 5 minutes |
| QR web page | Scan QR from browser without SSH: `http://IP:3200/qr-page?secret=...` |
| Health monitoring | `/health` returns sessions, disk space, memory usage |
| Resolver health-check | Logs warning every 60s if resolver is unreachable |
| Send messages | Send text messages to customers (document request feature) |
| File filtering | Only images + documents (no videos/audio) |
| Original filenames | Documents keep their real name; images get `phone_timestamp_image.ext` |

---

## File Structure

```
whatsapp-service/
├── index.js              # Baileys multi-session service
├── package.json          # Dependencies
├── .env.example          # Environment config
├── ecosystem.config.cjs  # PM2 config
├── setup-gcp2.sh         # One-command deployment for new GCP instance
├── WHATSAPP_SERVICE.md   # This file
├── sessions/             # Auth data per workspace (gitignored)
│   └── {workspaceId}/
├── upload_queue/         # Failed uploads persisted to disk
│   ├── {id}.json         # Metadata (phone, name, workspace)
│   └── {id}.bin          # File binary
└── failed_uploads/       # Legacy fallback directory

whatsapp-resolver/
├── index.js              # wwebjs LID resolver service
├── package.json          # Dependencies
├── .env.example          # Environment config
└── session/              # wwebjs LocalAuth data (gitignored)
```

---

## Environment Variables

### WhatsApp Service (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `WA_PORT` | 3100 | Port this service listens on |
| `PARENT_URL` | https://api.cybercontrol.fun | Parent API base URL |
| `SERVICE_SECRET` | wa-service-secret-2024 | Shared secret for inter-service auth |
| `AUTH_DIR` | ./sessions | Directory for Baileys auth per workspace |
| `RESOLVER_URL` | http://localhost:3200 | URL of the LID resolver |

### WhatsApp Resolver (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3200 | Port resolver listens on |
| `SERVICE_SECRET` | wa-service-secret-2024 | Shared secret for auth |

---

## API Endpoints

All endpoints require header: `x-service-secret: <SERVICE_SECRET>`

### WhatsApp Service (port 3100)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Status, sessions, disk, memory |
| POST | `/sessions/start` | `{workspaceId}` | Start/resume a session |
| POST | `/sessions/stop` | `{workspaceId}` | Disconnect and remove session |
| GET | `/sessions/:id/status` | — | Connection status, QR, phone |
| GET | `/sessions/:id/qr` | — | Current QR code (null if connected) |
| GET | `/sessions` | — | List all active sessions |
| POST | `/sessions/:id/send` | `{phone, message}` | Send text message |

### WhatsApp Resolver (port 3200)

| Method | Endpoint | Params | Description |
|--------|----------|--------|-------------|
| GET | `/health` | — | Status + connected boolean |
| GET | `/resolve` | `?lid=140583356072067` | Resolve LID → phone + dpUrl + savedName |
| GET | `/dp` | `?phone=919876543210` | Get profile picture URL |
| GET | `/qr` | — | Current QR (for re-linking) |
| GET | `/qr-page` | `?secret=...` | Scannable QR web page |

### Resolver Response Example

```json
{
  "lid": "140583356072067",
  "phone": "919006615450",
  "dpUrl": "https://pps.whatsapp.net/...",
  "savedName": "Sudhir Prasad"
}
```

---

## Message Flow

```
Customer sends image/document on WhatsApp
  │
  ├─ Baileys receives message
  ├─ Skip if fromMe or video/audio
  ├─ Unwrap viewOnce / captioned wrappers
  │
  ├─ Identify sender:
  │   ├─ @s.whatsapp.net → use phone directly
  │   └─ @lid → call Resolver:
  │       ├─ GET /resolve?lid=xxx
  │       ├─ Returns: phone, savedName, dpUrl
  │       ├─ Use savedName as sender name
  │       └─ Download DP in background (async, non-blocking)
  │
  ├─ Download media buffer from WhatsApp
  ├─ Determine filename:
  │   ├─ Documents → original filename (e.g. "Aadhaar.pdf")
  │   └─ Images → "{phone}_{timestamp}_image.jpg"
  │
  ├─ Upload to parent (POST /api/worker/upload):
  │   ├─ Try 1 → success? Done ✓
  │   ├─ Try 2 (5s delay) → success? Done ✓
  │   ├─ Try 3 (10s delay) → success? Done ✓
  │   └─ All failed → save to ./upload_queue/ for later
  │
  └─ Parent receives → uploads to Google Drive → saves to DB → emits socket.io event → frontend updates
```

---

## Reliability Features

### Exponential Backoff on Disconnect

```
Attempt 1: reconnect in 5s
Attempt 2: reconnect in 10s
Attempt 3: reconnect in 30s
Attempt 4+: reconnect in 60s (max)
Reset to 5s on successful connection
```

### Upload Retry + Disk Queue

```
Upload attempt 1 → fail → retry in 5s
Upload attempt 2 → fail → retry in 10s
Upload attempt 3 → fail → save to ./upload_queue/{id}.json + {id}.bin
Queue processed: on boot (30s delay) + every 5 minutes
```

### Auto-Start on Boot

On PM2 restart, all sessions with saved auth in `./sessions/` are automatically started with 10-second staggering between each to prevent RAM spikes.

### Resolver Health Check

Every 60 seconds, the Baileys service pings the resolver's `/health`. If unreachable or disconnected, it logs a warning. LID resolution gracefully falls back to using the raw LID number.

---

## How Parent API Integrates

Parent backend proxies WhatsApp requests to GCP #2 (`34.100.147.20:3100`):

| Frontend calls | Parent proxies to |
|---|---|
| `GET /api/whatsapp/status` | `GET :3100/sessions/{workspaceId}/status` |
| `GET /api/whatsapp/qr` | `GET :3100/sessions/{workspaceId}/status` → `.qr` |
| `POST /api/whatsapp/connect` | `POST :3100/sessions/start` |
| `POST /api/whatsapp/send` | `POST :3100/sessions/{workspaceId}/send` |

---

## Deployment (GCP #2)

### Fresh Setup

```bash
# On a new GCP e2-micro (Ubuntu 22.04):
bash <(curl -s https://raw.githubusercontent.com/yashaswikaahuja/wa-drive/master/whatsapp-service/setup-gcp2.sh)
```

### Current Production

```
Instance: cybercontrol-whatsapp
Zone: asia-south1-a
IP: 34.100.147.20
Ports: 3100 (Baileys), 3200 (Resolver)
Swap: 1GB (total effective RAM: ~2GB)
```

### SSH Access

```bash
gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a
```

### Common Commands

```bash
pm2 list                          # Check status
pm2 restart whatsapp-service      # Restart Baileys
pm2 restart whatsapp-resolver     # Restart Resolver
pm2 logs whatsapp-service         # View logs
curl http://localhost:3100/health  # Health check
curl http://localhost:3200/health  # Resolver status
```

---

## Resolver QR Re-linking

If the resolver disconnects (rare), re-scan QR:

1. Open in browser: `http://34.100.147.20:3200/qr-page?secret=wa-service-secret-2024`
2. If connected: shows "✅ Connected"
3. If disconnected: shows scannable QR, auto-refreshes every 20s
4. Scan with WhatsApp → Linked Devices → Link a Device

**Do NOT log out from phone** — it's a linked device, stays connected permanently.

---

## Monitoring

### UptimeRobot (external)

- `http://34.100.147.20:3100/health` — Baileys service
- `http://34.100.147.20:3200/health` — Resolver
- `https://api.cybercontrol.fun/api/health` — Parent API

### Health Endpoint Response

```json
{
  "status": "ok",
  "sessions": 3,
  "sessionList": [
    {"id": "fcae0309", "status": "connected", "phone": "917209372901"},
    {"id": "8295a4f7", "status": "connected", "phone": "919006615450"}
  ],
  "diskFree": "22G",
  "memMB": 111
}
```

---

## Scaling

| Sessions | RAM needed | Instance |
|----------|-----------|----------|
| 1-3 | ~150MB Baileys + 40MB Resolver | e2-micro (1GB) with swap ✅ |
| 5-10 | ~400MB + 40MB | e2-micro with swap |
| 10-15 | ~600MB + 40MB | e2-micro tight, upgrade to e2-small |
| 15-30 | ~1GB + 40MB | e2-small (2GB) |
| 30+ | ~1.5GB+ | e2-medium (4GB) |

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| QR not appearing | Session already connected | Check `/sessions/{id}/status` |
| Upload failed: 500 | Parent's Drive token expired | Reconnect Drive from Settings page |
| Upload stuck/hanging | Drive API timeout | Restart parent; files saved in queue |
| LID not resolved | Resolver disconnected | Check `/qr-page`, re-scan if needed |
| Disconnected: 401 | WhatsApp logged out | Delete `sessions/{id}/`, restart |
| Disconnected: 408 | Network timeout | Auto-reconnects with backoff |
| Disconnected: 500 | WhatsApp server error | Auto-reconnects with backoff |
| Disconnected: 515 | WhatsApp server error | Auto-reconnects with backoff |
| Media error | File too large or encrypted | Check Baileys version |
| `require is not defined` | ESM module issue in code | Use `import` not `require` |
| Description too long | base64 DP in Drive metadata | DP stored in DB only, not Drive |
| Wrong workspace Drive | Global oauth client used | Fixed: per-workspace tokens from DB |
| Session not starting on boot | Auth dir empty or corrupted | Delete session dir, re-scan QR |

---

## Local Development (Full Stack)

### Prerequisites

- Node.js v20+
- PostgreSQL 14+
- Google Cloud OAuth credentials
- WhatsApp on your phone

### Quick Start

```bash
git clone https://github.com/yashaswikaahuja/wa-drive.git
cd wa-drive

# Terminal 1 — Backend
cd backend && npm install && cp .env.example .env && npm run dev

# Terminal 2 — WhatsApp Service
cd whatsapp-service && npm install && cp .env.example .env && node index.js

# Terminal 3 — WhatsApp Resolver
cd whatsapp-resolver && npm install && cp .env.example .env && node index.js

# Terminal 4 — Frontend
cd frontend && npm install && cp .env.example .env && npm run dev
```

### Local .env Files

**backend/.env:**
```
DATABASE_URL=postgresql://cybercontrol_app:password@localhost:5432/cybercontrol
JWT_SECRET=any-random-string
GROQ_API_KEY=your-key
GOOGLE_CLIENT_ID=your-id
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback
```

**whatsapp-service/.env:**
```
WA_PORT=3100
PARENT_URL=http://localhost:3000
SERVICE_SECRET=wa-service-secret-2024
RESOLVER_URL=http://localhost:3200
```

**whatsapp-resolver/.env:**
```
PORT=3200
SERVICE_SECRET=wa-service-secret-2024
```

**frontend/.env:**
```
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### Ports

| Service | Port |
|---------|------|
| Backend API | 3000 |
| WhatsApp Service | 3100 |
| WhatsApp Resolver | 3200 |
| Frontend | 5173 |
| PostgreSQL | 5432 |
