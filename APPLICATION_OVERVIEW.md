# CyberControl — Application Overview

> Complete reference for developers picking up this project. Last updated: May 5, 2026 (v2.0).

---

## 1. Project Summary

CyberControl is a cybercafe management tool for operators near Patna, Bihar. Customers send photos/documents to the cybercafe WhatsApp number. The system receives them, uploads to Google Drive, and displays in a real-time dashboard. Staff can preview, print, download, and process files.

**Key features added in v2.0:**
- AI document extraction (Groq Vision) — auto-fills form fields from Aadhaar, PAN, Voter ID, Admit Cards
- Student profile management — save extracted data, reuse for multiple form applications
- Chrome extension — auto-fills SSC/Railway/NEET/UPSC/IBPS govt forms from saved profiles
- Profiles page — view, edit, delete student profiles

---

## 2. Architecture

```
GCP VM (34.134.111.239)
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌──────────────────┐    localhost:3000             │
│  │  Baileys Worker  │──────────────────────────┐   │
│  │  (PM2 id:3)      │  POST /api/worker/upload  │   │
│  └──────────────────┘                           ▼   │
│                                  ┌──────────────────┐│
│                                  │  Express Hub     ││
│                                  │  (PM2 id:2)      ││
│                                  │  port 3000       ││
│                                  └──────────────────┘│
│                                           │          │
│  ┌──────────────────┐                     │          │
│  │  Cloudflare      │◀────────────────────┘          │
│  │  Tunnel (PM2 id:4│  HTTPS proxy                   │
│  └──────────────────┘                               │
│           │                                         │
└───────────┼─────────────────────────────────────────┘
            │ HTTPS
            ▼
  https://strings-broker-minimal-cut.trycloudflare.com
            │
            ▼
  Vercel Frontend (https://frontend-pi-ochre-71.vercel.app)
```

### Services

| Service | Location | URL | Notes |
|---------|----------|-----|-------|
| Dashboard | Vercel | https://frontend-pi-ochre-71.vercel.app | Auto-deploys from `frontend/` |
| API Hub | GCP VM (PM2) | https://strings-broker-minimal-cut.trycloudflare.com | Express + Socket.IO, port 3000 |
| WA Worker | GCP VM (PM2) | internal only | Baileys, connects to hub via localhost |
| Cloudflare Tunnel | GCP VM (PM2) | — | HTTPS proxy for hub, free quick tunnel |

> ⚠️ **Cloudflare quick tunnel URL changes on restart.** When it changes, update `VITE_API_URL` and `VITE_SOCKET_URL` in Vercel and redeploy frontend.

---

## 3. GCP VM Details

| Property | Value |
|----------|-------|
| VM Name | `whatsapp-worker` |
| Zone | `us-central1-f` |
| Machine | `e2-micro` (1 vCPU, 1 GB RAM) |
| Disk | 30 GB standard persistent |
| OS | Debian 12 |
| External IP | `34.134.111.239` (static — promote if it changes) |
| SSH | `ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239` |
| SSH alias | `ssh gcp-worker` |

### PM2 Processes

| id | name | path | port |
|----|------|------|------|
| 2 | `cybercontrol-hub` | `/opt/cybercontrol-hub/backend/dist/server.js` | 3000 |
| 3 | `whatsapp-worker` | `/opt/whatsapp-worker/worker/` (npm start) | 3002 (health) |
| 4 | `cloudflare-tunnel` | `cloudflared tunnel --url http://localhost:3000` | — |

### PM2 Commands
```bash
pm2 list                          # show all processes
pm2 logs cybercontrol-hub         # hub logs
pm2 logs whatsapp-worker          # worker logs
pm2 logs cloudflare-tunnel        # get current tunnel URL
pm2 restart cybercontrol-hub      # restart hub
pm2 restart whatsapp-worker       # restart worker
pm2 save                          # persist process list across reboots
```

---

## 4. Repository Structure

```
wa/
├── backend/                    # Express + Socket.IO hub
│   ├── src/
│   │   ├── server.ts           # Main: routes, Socket.IO, Drive upload
│   │   ├── api/routes/
│   │   │   ├── whatsapp.routes.ts   # GET /api/whatsapp/status
│   │   │   └── files.routes.ts      # GET/DELETE /api/files
│   │   └── db.ts               # In-memory file index
│   ├── Dockerfile              # (legacy, no longer used for deployment)
│   └── package.json
│
├── worker/                     # Baileys WhatsApp worker
│   ├── worker.ts               # WA client, media handler, hub uploader
│   ├── .env                    # HUB_URL, WORKER_SECRET, PORT
│   ├── auth_info/              # Baileys session (persists across restarts)
│   └── package.json
│
└── frontend/                   # React dashboard (Vercel)
    └── src/
        ├── pages/WhatsAppInboxPage.tsx
        ├── components/
        │   ├── dashboard/      # header, file-card, files-grid, filter-bar, preview-modal
        │   ├── GoogleDriveLogin.tsx
        │   └── ui/             # shadcn/ui primitives
        ├── stores/
        │   ├── whatsappStore.ts   # Zustand: files, connected, loading
        │   └── authStore.ts       # Zustand: Drive OAuth token + expiry (persisted)
        └── utils/helpers.ts       # getPreviewUrl, API_BASE_URL, SOCKET_URL
```

---

## 5. Backend Hub — `backend/`

### Key Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/drive/token` | Frontend sends Google OAuth token; stored in memory, forwarded to worker socket |
| `GET` | `/api/drive/files` | Lists all files from Drive `customers/` folder |
| `DELETE` | `/api/drive/files/:id` | Deletes a Drive file |
| `POST` | `/api/worker/upload` | Worker POSTs file buffer here; hub uploads to Drive, emits socket event |
| `POST` | `/api/whatsapp/reinit` | Clears QR, tells worker to restart Baileys |
| `POST` | `/api/whatsapp/logout` | Tells worker to disconnect WhatsApp |
| `GET` | `/api/whatsapp/qr` | Returns last QR code (base64 PNG) |
| `GET` | `/api/health` | Health check → `{"status":"ok"}` |

### Environment Variables (GCP VM)
```
PORT=3000
WORKER_SECRET=cybercontrol-worker-secret-2024
```

### Deploying Hub Updates
```bash
# 1. Build locally (tsc OOMs on e2-micro)
cd backend && npm run build

# 2. Copy dist to VM
scp -r backend/dist gcp-worker:/opt/cybercontrol-hub/backend/dist

# 3. Restart
ssh gcp-worker "pm2 restart cybercontrol-hub"
```

---

## 6. Worker — `worker/`

### Environment Variables (`/opt/whatsapp-worker/worker/.env`)
```
HUB_URL=http://localhost:3000
WORKER_SECRET=cybercontrol-worker-secret-2024
PORT=3002
```

### Phone Number Resolution
Always uses `msg.key.remoteJid`:
```ts
const jid = msg.key.remoteJid ?? '';
// For @lid JIDs, resolve via getContact()
if (jid.endsWith('@lid')) {
  const contact = await sock.getContact(jid);
  phone = contact?.id?._serialized?.replace(/@c\.us|@s\.whatsapp\.net/g, '') ?? '';
}
// Fallback: strip suffix directly
phone = jid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '').replace(/[^0-9+]/g, '');
```

### Media Upload Flow
```ts
const form = new FormData();
form.append('file', new Blob([buffer], { type: mimetype }), fileName);
form.append('phone', phone);
form.append('senderName', customerName);
form.append('profilePicUrl', profilePicUrl ?? '');
form.append('mimetype', mimetype);
form.append('fileName', fileName);
await fetch(`${HUB_URL}/api/worker/upload`, { method: 'POST', body: form });
```

### Keep-Alive
Worker pings hub every 10 minutes to prevent hub from going idle:
```ts
setInterval(() => fetch(`${HUB_URL}/api/health`).catch(() => {}), 10 * 60 * 1000);
```

### Auth Session
Saved to `worker/auth_info/` — persists across PM2 restarts. Delete this folder to force a new QR scan.

### Deploying Worker Updates
```bash
scp worker/worker.ts gcp-worker:/opt/whatsapp-worker/worker/worker.ts
ssh gcp-worker "pm2 restart whatsapp-worker"
```

---

## 7. Frontend — `frontend/`

### Environment Variables (Vercel)
| Variable | Current Value |
|----------|---------------|
| `VITE_API_URL` | `https://strings-broker-minimal-cut.trycloudflare.com/api` |
| `VITE_SOCKET_URL` | `https://strings-broker-minimal-cut.trycloudflare.com` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

> Update these when Cloudflare tunnel URL changes.

### Google Drive Login
- Uses `@react-oauth/google` with `useGoogleLogin`
- Token stored in `authStore` (Zustand, persisted to localStorage)
- Token synced to hub immediately on login and every 10 minutes (hub restart recovery)
- Token cleared automatically when expired — user must re-click "Connect Google Drive"
- OAuth token lasts ~1 hour; user must reconnect after expiry

### File Filters
All, Images, Videos, Audio, PDFs, Documents

Supported formats:
- **Images:** jpg, jpeg, png, gif, webp, bmp, svg, heic, heif, tiff
- **Videos:** mp4, 3gp, mov, avi, mkv, webm, flv, wmv, m4v
- **Audio:** mp3, ogg, wav, aac, m4a, flac, opus, wma, amr
- **Documents:** doc, docx, xls, xlsx, ppt, pptx, txt, csv, rtf, odt

### Preview Modal
| Type | Renderer |
|------|----------|
| Image | `<img>` contain |
| Video | Google Drive iframe (`/file/d/ID/preview`) |
| Audio | `<audio controls>` |
| PDF | Google Drive iframe viewer |

### Deploying Frontend
```bash
cd frontend
npx vercel --prod --yes
```

---

## 8. Google Drive Integration

### Folder Structure
```
My Drive/
└── customers/
    └── {phone}/          e.g. 919006615450/
        ├── 919006615450_20260501_photo.jpg
        └── 919006615450_20260501_audio.mp3
```

### File Metadata
Each file's Drive `description` field stores:
```json
{ "customerName": "Ravi Kumar", "profilePicUrl": "https://..." }
```
This is read back by `GET /api/drive/files` to restore names and profile pics.

### Thumbnail URLs
```
https://drive.google.com/thumbnail?id=FILE_ID&sz=w200   # dashboard display
https://drive.google.com/thumbnail?id=FILE_ID&sz=w800   # full preview
https://drive.google.com/file/d/FILE_ID/preview          # video/PDF embed
```

---

## 9. Known Issues & Gotchas

| Issue | Status | Notes |
|-------|--------|-------|
| Cloudflare tunnel URL changes on restart | Known | Update Vercel env vars + redeploy frontend |
| Drive token expires after ~1 hour | Handled | User must re-click "Connect Google Drive" |
| Hub loses Drive token on restart | Handled | Frontend re-syncs every 10 min |
| `@lid` phone numbers | Handled | Resolved via `sock.getContact()` |
| tsc OOM on e2-micro | Known | Build locally, copy `dist/` to VM |
| WhatsApp session lost if `auth_info/` deleted | Known | Scan QR again after deletion |

---

## 10. Updating the Hub URL (when Cloudflare tunnel restarts)

```bash
# 1. Get new URL
ssh gcp-worker "pm2 logs cloudflare-tunnel --lines 30 --nostream | grep trycloudflare"

# 2. Update Vercel
cd frontend
npx vercel env rm VITE_API_URL production --yes
npx vercel env rm VITE_SOCKET_URL production --yes
echo 'https://NEW-URL.trycloudflare.com/api' | npx vercel env add VITE_API_URL production
echo 'https://NEW-URL.trycloudflare.com' | npx vercel env add VITE_SOCKET_URL production
npx vercel --prod --yes
```

---

## 11. Full Pipeline Test

1. Open dashboard → click "Connect Google Drive" → sign in
2. Send a photo/document to the cybercafe WhatsApp number
3. Worker receives it → POSTs to `http://localhost:3000/api/worker/upload`
4. Hub uploads to Drive → emits `new_whatsapp_file` via Socket.IO
5. Dashboard shows file with Drive thumbnail in real time

---

## 12. AI Document Extraction

### Endpoint
 — Body: 

Downloads file from Drive, sends to Groq Vision AI, returns structured JSON.

### Supported Documents
Aadhaar, PAN, Voter ID (EPIC), Passport, Health ID (ABHA), Admit Cards, Marksheets, PDFs

### Extracted Fields
name, dob, gender, aadhaar_number, pan_number, epic_number, passport_number, abha_number, abha_address, address, father_name, mother_name, mobile, email, nationality, category, roll_no_10th, roll_no_12th, board_10th, board_12th, place_of_birth, issue_date, expiry

### Environment Variable


---

## 13. Student Profiles API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/profiles | List all profiles |
| GET | /api/profiles/:phone | Get profile by phone |
| POST | /api/profiles | Save/update profile |
| DELETE | /api/profiles/:phone | Delete profile |

Profiles stored in: 

---

## 14. Chrome Extension

Location:  folder in repo

### Files
-  — extension config, version number
-  — extension UI
-  — field matching logic + profile loader
-  — page context listener

### Auto-update Flow
1. Bump version in 
2. Repackage: 
3. Upload: 
4. Update version in  line: 
5. Restart hub: 

### Field Matching
- **Fuzzy**: matches field id/name/label/placeholder against known aliases
- **AI fallback**: sends unmatched fields to Groq for intelligent mapping
- **Exclusions**: skips education table rows, assembly constituency, spouse name

---

## 15. Updating the Extension Version



---

## 12. AI Document Extraction

### Endpoint
`POST /api/process/extract` — Body: `{ fileId: string }`

Downloads file from Drive, sends to Groq Vision AI, returns structured JSON.

### Supported Documents
Aadhaar, PAN, Voter ID (EPIC), Passport, Health ID (ABHA), Admit Cards, Marksheets, PDFs

### Extracted Fields
name, dob, gender, aadhaar_number, pan_number, epic_number, passport_number, abha_number, abha_address, address, father_name, mother_name, mobile, email, nationality, category, roll_no_10th, roll_no_12th, board_10th, board_12th, place_of_birth, issue_date, expiry

### Environment Variable
```
GROQ_API_KEY=gsk_...   # in ecosystem.config.cjs
```

---

## 13. Student Profiles API

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/profiles | List all profiles |
| GET | /api/profiles/:phone | Get profile by phone |
| POST | /api/profiles | Save/update profile |
| DELETE | /api/profiles/:phone | Delete profile |

Profiles stored in: `/opt/cybercontrol-hub/backend/data/profiles.json`

---

## 14. Chrome Extension

Location: `extension/` folder in repo

### Files
- `manifest.json` — extension config, version number
- `popup.html` — extension UI
- `popup.js` — field matching logic + profile loader
- `content.js` — page context listener

### Auto-update Flow
1. Bump version in `manifest.json` and `CURRENT_VERSION` in `popup.js`
2. Repackage zip and upload to `/opt/cybercontrol-hub/extension.zip` on GCP
3. Update version string in `backend/dist/server.js` extension/version endpoint
4. Restart hub: `pm2 restart cybercontrol-hub`
5. All installed extensions show purple update banner on next open

### Field Matching
- **Fuzzy**: matches field id/name/label/placeholder against known aliases
- **AI fallback**: sends unmatched fields to Groq for intelligent mapping
- **Exclusions**: skips education table rows, assembly constituency, spouse name
- **Accuracy**: 100% on SSC CGL, Railway RRB, NEET, UPSC, IBPS PO, UP Police, CRPF, BPSC, RTPS Bihar, Bank KYC, NTA CUET
