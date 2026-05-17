# WhatsApp Service — CyberControl

Multi-tenant WhatsApp session manager for CyberControl SaaS. Each workspace (cybercafe) gets its own independent WhatsApp connection.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Parent API (api.cybercontrol.fun:3000)                  │
│  - Proxies /api/whatsapp/* to this service               │
│  - Receives uploaded files via POST /api/worker/upload    │
│  - Emits socket.io events to frontend on new files       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (localhost:3100)
┌──────────────────────▼──────────────────────────────────┐
│  WhatsApp Service (this)                                 │
│  - Manages N Baileys sessions (one per workspace)        │
│  - Downloads media from WhatsApp                         │
│  - Uploads files to Parent API                           │
│  - Sends messages on behalf of workspaces                │
└──────────────────────┬──────────────────────────────────┘
                       │ WhatsApp Web Protocol (Baileys)
┌──────────────────────▼──────────────────────────────────┐
│  WhatsApp Servers                                        │
│  - Each workspace = one linked device session            │
└─────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---------|-------------|
| Multi-tenant sessions | Each workspace has its own Baileys session stored in `./sessions/{workspaceId}/` |
| QR code generation | Generates QR for new connections, sends to parent via webhook |
| Auto-reconnect | Reconnects automatically on disconnect (except logout) |
| Media download | Downloads images and documents from WhatsApp messages |
| File upload to parent | Uploads received files to parent API for Drive storage |
| Profile picture fetch | Gets sender's WhatsApp DP URL |
| Send messages | Sends text messages to customers (for document requests) |
| File filtering | Only accepts images + documents (no videos/audio to save bandwidth) |
| Session cleanup | Deletes auth data on logout for fresh QR re-pair |

---

## File Structure

```
whatsapp-service/
├── index.js              # Main service (single file)
├── package.json          # Dependencies
├── .env.example          # Environment config template
├── ecosystem.config.cjs  # PM2 deployment config
├── README.md             # Quick start guide
├── WHATSAPP_SERVICE.md   # This file (full documentation)
└── sessions/             # Runtime: auth data per workspace (gitignored)
    └── {workspaceId}/    # Baileys multi-file auth state
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WA_PORT` | 3100 | Port this service listens on |
| `PARENT_URL` | https://api.cybercontrol.fun | Parent API base URL |
| `SERVICE_SECRET` | wa-service-secret-2024 | Shared secret for auth between parent ↔ this service |
| `AUTH_DIR` | ./sessions | Directory to store Baileys auth per workspace |

---

## API Endpoints

All endpoints require header: `x-service-secret: <SERVICE_SECRET>`

### Session Management

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/sessions/start` | `{workspaceId}` | Start/resume a WhatsApp session |
| POST | `/sessions/stop` | `{workspaceId}` | Disconnect and remove session |
| GET | `/sessions/:workspaceId/status` | — | Get connection status, QR, phone |
| GET | `/sessions/:workspaceId/qr` | — | Get current QR code (null if connected) |
| GET | `/sessions` | — | List all active sessions |
| GET | `/health` | — | Service health + session count |

### Messaging

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/sessions/:workspaceId/send` | `{phone, message}` | Send text message to a phone number |

### WebSocket

Connect to `ws://host:3100/ws?workspaceId=xxx` for real-time events:
- `{type: 'qr', qr: '...', workspaceId}` — New QR code available
- `{type: 'status', connected: true/false, phone, workspaceId}` — Connection state changed

---

## Logic & Conditions

### Session Lifecycle

```
startSession(workspaceId)
  │
  ├─ Load auth from ./sessions/{workspaceId}/
  ├─ Create Baileys socket
  │
  ├─ on 'connection.update':
  │   ├─ qr received → emit to parent + WebSocket
  │   ├─ connection = 'open' → notify parent "connected"
  │   └─ connection = 'close':
  │       ├─ loggedOut=true → delete session dir, stop
  │       └─ loggedOut=false → reconnect after 5s
  │
  └─ on 'messages.upsert':
      ├─ Skip own messages (fromMe)
      ├─ Unwrap viewOnce / captioned messages
      ├─ Filter: only imageMessage or documentMessage
      ├─ Skip videos and audio (bandwidth)
      ├─ Download media buffer
      ├─ Detect extension from message type
      ├─ Fetch sender's profile picture URL
      └─ Upload to parent API
```

### Message Type Detection

```javascript
// Unwrap nested message types
innerMsg = msg.message.viewOnceMessage?.message
        || msg.message.viewOnceMessageV2?.message
        || msg.message.documentWithCaptionMessage?.message
        || msg.message

// Only process these:
✅ innerMsg.imageMessage        → extension: .jpg
✅ innerMsg.documentMessage     → extension from fileName or .pdf
❌ innerMsg.videoMessage        → SKIPPED (too large)
❌ innerMsg.audioMessage        → SKIPPED (not useful)
```

### File Extension Detection

```javascript
imageMessage  → 'jpg'
videoMessage  → 'mp4' (skipped but defined)
audioMessage  → 'ogg' (skipped but defined)
documentMessage → extract from fileName (e.g. "doc.pdf" → "pdf")
fallback      → 'bin'
```

### Upload to Parent

Uses `form-data` package piped through `http.request`:
- `file` — binary buffer with original filename
- `phone` — sender's WhatsApp number (without @s.whatsapp.net)
- `senderName` — push name from WhatsApp
- `workspaceId` — which workspace this file belongs to
- `fileName` — constructed as `{phone}_{timestamp}_file.{ext}`
- `profilePicUrl` — sender's WhatsApp DP (may be null)

### Send Message

```javascript
// Formats phone for WhatsApp JID
jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
socket.sendMessage(jid, { text: message })
```

---

## How Parent API Integrates

The parent backend (`/backend/dist/server.js`) proxies WhatsApp requests:

| Frontend calls | Parent proxies to |
|---|---|
| `GET /api/whatsapp/status` | `GET localhost:3100/sessions/{workspaceId}/status` |
| `GET /api/whatsapp/qr` | `GET localhost:3100/sessions/{workspaceId}/status` → returns `.qr` |
| `POST /api/whatsapp/connect` | `POST localhost:3100/sessions/start` |
| `POST /api/whatsapp/send` | `POST localhost:3100/sessions/{workspaceId}/send` |

The parent identifies the workspace from the JWT token in the user's Authorization header.

---

## Notifications to Parent

When events occur, this service POSTs to `{PARENT_URL}/api/worker/event`:

```json
{ "workspaceId": "...", "event": "qr", "qr": "..." }
{ "workspaceId": "...", "event": "connected", "phone": "919876543210" }
{ "workspaceId": "...", "event": "disconnected", "loggedOut": true/false }
```

The parent then emits these via Socket.IO to connected frontends.

---

## Deployment

### On same GCP instance as parent:

```bash
cd /opt/cybercontrol-hub/whatsapp-service
npm install
pm2 start index.js --name whatsapp-service
pm2 save
```

### On separate GCP instance (future):

```bash
git clone https://github.com/yashaswikaahuja/wa-drive.git
cd wa-drive/whatsapp-service
npm install
# Edit .env with PARENT_URL pointing to parent API
pm2 start ecosystem.config.cjs
```

Then update parent's `WA_SERVICE` constant from `localhost:3100` to the new instance's IP.

---

## Security

- All endpoints require `x-service-secret` header
- Session auth data stored locally (not in DB) — isolated per workspace
- Parent validates workspace ownership via JWT before proxying
- No direct internet exposure — only parent communicates with this service

---

## Scaling

- Each Baileys session uses ~30-50MB RAM
- A single GCP e2-medium (4GB) can handle ~50 concurrent sessions
- To scale beyond: run multiple instances, route by workspace hash
- Sessions are stateful — a workspace must always hit the same instance

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| QR not appearing | Session already connected | Check `/sessions/{id}/status` |
| Upload failed: 500 | Parent's Drive token expired | Force refresh on parent |
| Upload failed: 404 | `/api/worker/upload` or `/api/drive/download` endpoint missing on parent | Parent backend was reverted/restarted without patches. Re-apply the endpoint additions or redeploy from git |
| 404 on `/api/whatsapp/*` | Old whatsapp routes still active or proxy endpoints not added | Ensure parent has `WA_SERVICE` proxy endpoints and old `whatsappRoutes` is disabled |
| 404 on `/sessions/:id/send` | WhatsApp service doesn't have send endpoint | Update service code from latest git |
| Disconnected: 401 | WhatsApp logged out | Delete `sessions/{id}/`, restart |
| Disconnected: 408 | Network timeout | Auto-reconnects in 5s |
| Disconnected: 515 | WhatsApp server error | Auto-reconnects in 5s |
| Media error | File too large or encrypted | Check Baileys version compatibility |
| CORS error on frontend | Backend is down (502) or nginx misconfigured | Check `pm2 status`, ensure backend is running |
| `wss://https/socket.io/` error | Old cached frontend bundle | Clear browser cache/service worker |


---

## Local Development (Full Stack)

Run the entire CyberControl platform on your local machine:

### Prerequisites

- Node.js v20+
- PostgreSQL 14+
- Google Cloud OAuth credentials (for Drive)
- WhatsApp on your phone (for QR scan)

### 1. Clone the repo

```bash
git clone https://github.com/yashaswikaahuja/wa-drive.git
cd wa-drive
```

### 2. Setup PostgreSQL

```sql
CREATE DATABASE cybercontrol;
CREATE USER cybercontrol_app WITH PASSWORD 'your_password';
GRANT ALL ON DATABASE cybercontrol TO cybercontrol_app;
```

Run migrations (tables auto-create on first backend start).

### 3. Backend (`/backend`)

```bash
cd backend
npm install
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://cybercontrol_app:your_password@localhost:5432/cybercontrol
#   JWT_SECRET=any-random-string
#   GROQ_API_KEY=your-groq-key
#   GOOGLE_CLIENT_ID=your-google-client-id
#   GOOGLE_CLIENT_SECRET=your-google-client-secret
#   GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback

npm run dev
# Runs on http://localhost:3000
```

### 4. WhatsApp Service (`/whatsapp-service`)

```bash
cd whatsapp-service
npm install
cp .env.example .env
# Edit .env:
#   WA_PORT=3100
#   PARENT_URL=http://localhost:3000
#   SERVICE_SECRET=wa-service-secret-2024

node index.js
# Runs on http://localhost:3100
```

### 5. Frontend (`/frontend`)

```bash
cd frontend
npm install
cp .env.example .env
# .env should have:
#   VITE_API_URL=http://localhost:3000/api
#   VITE_SOCKET_URL=http://localhost:3000

npm run dev
# Runs on http://localhost:5173
```

### 6. Connect WhatsApp

1. Open http://localhost:5173 → Login
2. Go to WhatsApp page → QR code appears
3. Scan with your phone → Connected
4. Send a document to the connected number → appears in chat

### 7. Connect Google Drive

1. Go to Settings → Click "Connect Drive"
2. Google account chooser opens → Select account
3. Authorize → Drive connected
4. Files sent via WhatsApp now upload to your Drive

### Quick Start (all in one terminal)

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — WhatsApp Service  
cd whatsapp-service && node index.js

# Terminal 3 — Frontend
cd frontend && npm run dev
```

### Ports Summary

| Service | Port | URL |
|---------|------|-----|
| Backend API | 3000 | http://localhost:3000/api |
| WhatsApp Service | 3100 | http://localhost:3100 |
| Frontend | 5173 | http://localhost:5173 |
| PostgreSQL | 5432 | — |

