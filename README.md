# CyberControl — WhatsApp Inbox + AI Form Autofill

> ⚠️ **This README's "Architecture / Services / GCP VM" sections below are OUTDATED** (they describe
> the old Cloudflare-Tunnel + PM2/Baileys single-VM setup). The current system is containerized
> (GHCR images), runs over a **Tailscale** mesh, and is split across `cybercontrol-app` (backend +
> extension-service + nginx, public at `https://api.cybercontrol.fun`), `cybercontrol-db` (Postgres),
> `cybercontrol-wa` (resolver), and `cybercontrol-wa-2` (whatsapp-service shard) — all in the kishynay
> project `cybercontrol-db-20260605`. The frontend is on Vercel at `app.cybercontrol.fun`.
> **Source of truth for topology: `deploy/docs/GHCR.md` §4 and `deploy/docs/NETWORKING.md`.**

A cybercafe management tool for operators near Patna, Bihar. Customers send documents via WhatsApp → AI extracts data → staff fills govt forms (SSC/Railway/NEET/UPSC) automatically using the Chrome extension.

## What It Does

1. **WhatsApp Inbox** — Customers send Aadhaar, PAN, photos, admit cards via WhatsApp
2. **AI Extraction** — Groq Vision AI reads documents and extracts name, DOB, address, ID numbers etc.
3. **Student Profiles** — Extracted data saved as reusable profiles
4. **Chrome Extension** — Auto-fills SSC/Railway/NEET/UPSC/IBPS govt forms from saved profiles

## Architecture

```
GCP VM (34.134.111.239)
┌──────────────────────────────────────────────┐
│                                              │
│  Baileys Worker ──localhost:3000──▶ Hub      │
│  (PM2: whatsapp-worker)    (PM2: cybercontrol-hub)
│                                      │       │
│  Cloudflare Tunnel ◀─────────────────┘       │
│  (PM2: cloudflare-tunnel)                    │
│  Tunnel URL Updater (PM2: tunnel-url-updater)│
└──────────────────────────────────────────────┘
         │ HTTPS
         ▼
  https://cursor-reservoir-surrounding-city.trycloudflare.com
         │
         ▼
  Vercel Frontend (https://frontend-pi-ochre-71.vercel.app)

Chrome Extension (installed on cybercafe PC)
  ↕ fetches profiles from backend
  ↕ auto-fills govt form websites
```

## Services

| Service | URL | Platform |
|---------|-----|----------|
| Dashboard | https://frontend-pi-ochre-71.vercel.app | Vercel |
| API Hub | https://cursor-reservoir-surrounding-city.trycloudflare.com | GCP VM |
| WA Worker | internal (localhost) | GCP VM |
| Chrome Extension | installed locally | Cybercafe PC |

## GCP VM

- **IP:** `34.134.111.239` (static)
- **SSH alias:** `ssh gcp-worker`
- **PM2 processes:** `cybercontrol-hub` (port 3000), `whatsapp-worker`, `cloudflare-tunnel`, `tunnel-url-updater`

## Project Structure

> **Canonical map:** [`docs/REPO-MAP.md`](docs/REPO-MAP.md)  
> **Prod topology:** [`deploy/docs/GHCR.md`](deploy/docs/GHCR.md) §4, [`deploy/docs/NETWORKING.md`](deploy/docs/NETWORKING.md)

```
cybercontrol/
├── architecture/         # Normative contracts, ADRs, fixtures
├── docs/                 # Human docs + REPO-MAP.md
├── deploy/               # Prod compose, CD, LB (canonical ops)
├── backend/              # Hub API — auth mint/refresh, WA, profiles
├── frontend/             # Operator dashboard
├── extension/            # Chrome MV3 — eyes + hands + thin UI
├── extension-service/    # Fill brain — plan, knowledge, WSS
├── extension-legacy-best/# Read-only freeze of last-good legacy fill
├── extension-dev/        # Tests + debug CLI (cli/out gitignored)
├── cyb-cli/              # Operator CLI (cyb live, sessions)
├── whatsapp-service/     # WA shards
└── docker-compose*.yml   # Local/dev stacks (prod = deploy/compose)
```

**HTTPS** = login/token mint, profile CRUD, health. **WSS** = presence, fill plan/session, live debug (see REPO-MAP).

## Quick Start

### Deploy Hub (GCP VM)
```bash
# Build locally (tsc OOMs on e2-micro)
cd backend && npm run build
scp -r backend/dist gcp-worker:/opt/cybercontrol-hub/backend/dist
ssh gcp-worker "pm2 restart cybercontrol-hub"
```

### Deploy Frontend (Vercel via GitHub Actions)
Push any change to `frontend/**` on master → GitHub Actions auto-deploys to Vercel.

### Install Chrome Extension
1. Download zip from: `https://<tunnel-url>/api/extension/download`
2. Extract zip
3. Chrome → `chrome://extensions` → Developer Mode → Load unpacked → select folder

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/process/extract | AI extract fields from Drive file |
| GET | /api/profiles | List all student profiles |
| POST | /api/profiles | Save/update student profile |
| DELETE | /api/profiles/:phone | Delete profile |
| GET | /api/extension/version | Extension version check |
| GET | /api/extension/download | Download latest extension zip |
| POST | /api/drive/token | Set Google Drive OAuth token |
| GET | /api/drive/files | List files from Drive |
| POST | /api/worker/upload | Worker uploads file to Drive |

## Environment Variables

### Backend (ecosystem.config.cjs)
```
PORT=3000
WORKER_SECRET=cybercontrol-worker-secret-2024
GROQ_API_KEY=gsk_...
```

### Frontend (Vercel project settings)
```
VITE_API_URL=https://<tunnel-url>/api
VITE_SOCKET_URL=https://<tunnel-url>
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

## When Cloudflare Tunnel URL Changes

The `tunnel-url-updater` PM2 process handles this automatically:
- Detects new URL from cloudflared logs
- Updates `frontend/src/utils/helpers.ts` fallback URL
- Pushes to GitHub → GitHub Actions redeploys frontend

Manual update if needed:
```bash
ssh gcp-worker "pm2 logs cloudflare-tunnel --lines 30 --nostream | grep trycloudflare"
# Then update helpers.ts and push
```

## Releasing Extension Updates

```bash
# 1. Edit extension/manifest.json — bump version (e.g. 1.2 → 1.3)
# 2. Edit extension/popup.js — update CURRENT_VERSION constant
# 3. Repackage
python3 -c "
import zipfile
with zipfile.ZipFile('/tmp/ext.zip','w') as z:
    for f in ['manifest.json','popup.html','popup.js','content.js','icon.png']:
        z.write(f'extension/{f}', f)
"
# 4. Upload to GCP
scp /tmp/ext.zip gcp-worker:/opt/cybercontrol-hub/extension.zip
# 5. Update server version
ssh gcp-worker "sed -i \"s/version: '1.2'/version: '1.3'/\" /opt/cybercontrol-hub/backend/dist/server.js && pm2 restart cybercontrol-hub"
```

## Google Drive Setup

1. Open dashboard → click **Connect Google Drive** → sign in
2. Token stored in browser, synced to hub automatically
3. Files uploaded to `customers/{phone}/` in your Drive
4. Token expires after ~1 hour — click again to reconnect

## See Also

- `APPLICATION_OVERVIEW.md` — detailed technical reference
- `CHANGELOG.md` — version history
- `GCP_PM2_OPS.md` — PM2 operations guide
