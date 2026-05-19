# GCP Server Structure

## GCP #1 — Parent Server (136.115.232.70)

**SSH:** `ssh gcp-worker`  
**User:** `bharattvv542`  
**OS:** Ubuntu 22.04, e2-micro (1GB RAM)  
**PM2 Process:** `cybercontrol-hub` → `/opt/cybercontrol-hub/backend/dist/index.js`

```
/opt/cybercontrol-hub/
├── .env                          ← Main environment variables (PORT, DB, JWT, GROQ, GOOGLE keys)
├── ecosystem.config.js           ← PM2 config
│
├── backend/
│   ├── .env                      ← Backend-specific env (same as parent .env)
│   ├── package.json              ← Node dependencies
│   ├── tsconfig.json             ← TypeScript config
│   ├── providers/
│   │   └── groq.js               ← Groq AI helper
│   ├── data/                     ← Legacy JSON data files (mostly unused now, DB is primary)
│   │   ├── adapters.json         ← Form field adapters for auto-fill
│   │   ├── corrections.json      ← User corrections history
│   │   ├── form_mappings.json    ← Form field mappings
│   │   ├── profiles.json         ← Legacy profiles (now in PostgreSQL)
│   │   ├── sessions.json         ← Legacy sessions
│   │   └── whatsapp-files.json   ← Legacy file list
│   └── dist/                     ← Compiled JavaScript (DO NOT EDIT — build from src/)
│       ├── index.js              ← ⭐ ENTRY POINT (PM2 runs this)
│       ├── config.js             ← Environment variables
│       ├── db.js                 ← Database pool
│       ├── middleware/
│       │   └── auth.js           ← JWT authentication
│       ├── modules/
│       │   ├── auth/routes.js        ← Login, register, refresh, Google OAuth
│       │   ├── drive/routes.js       ← Drive status, files, download, callback
│       │   ├── drive/service.js      ← Drive token management per workspace
│       │   ├── upload/routes.js      ← File upload from WhatsApp → Drive
│       │   ├── whatsapp/routes.js    ← WhatsApp proxy to GCP #2
│       │   ├── customers/routes.js   ← Customer CRUD
│       │   ├── jobs/routes.js        ← Jobs CRUD
│       │   └── dashboard/routes.js   ← Stats
│       ├── api/routes/
│       │   └── process.routes.js ← Photo Tool + AI Extraction (Groq Vision)
│       └── socket/
│           └── index.js          ← Socket.IO (workspace rooms, real-time events)
│
├── extension/                    ← Chrome Extension (auto-fill forms)
│   ├── manifest.json
│   ├── popup.js                  ← Extension popup UI
│   ├── background.js             ← Service worker
│   ├── content.js                ← Content script (injected into pages)
│   └── autofill/
│       ├── executor.js           ← Fills form fields
│       ├── extractor.js          ← Reads form structure
│       ├── mapper.js             ← Maps profile → form fields
│       └── planner.js            ← Plans fill sequence
│
└── data/
    └── adapters.json             ← Global adapters config
```

### Database (PostgreSQL on same server)

```
Database: cybercontrol
User: cybercontrol_app
Password: cybercontrol123
Port: 5432

Tables:
├── workspaces          ← Each cybercafe account
├── users               ← Operators per workspace
├── profiles            ← Customer profiles (extracted data)
├── jobs                ← Form-fill jobs
├── sessions            ← Login sessions
├── corrections         ← User corrections to AI extractions
├── mappings            ← Form field mappings
├── drive_files         ← Files received via WhatsApp (workspace-isolated)
├── workspace_secrets   ← Per-workspace Drive tokens
├── app_secrets         ← Global secrets (legacy)
└── audit_events        ← Activity log
```

### Nginx (reverse proxy)

```
Port 443 (HTTPS) → localhost:3000 (backend)
SSL: Let's Encrypt (auto-renew)
Config: /etc/nginx/sites-enabled/default
client_max_body_size: 50M
```

---

## GCP #2 — WhatsApp Server (34.100.147.20)

**SSH:** `gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a`  
**User:** `kishy`  
**OS:** Ubuntu 22.04, e2-micro (1GB RAM + 1GB swap)  
**PM2 Processes:** `whatsapp-service` (port 3100) + `whatsapp-resolver` (port 3200)

```
/opt/whatsapp/
├── service/                      ← Baileys WhatsApp (receives files)
│   ├── index.js                  ← ⭐ Main service
│   ├── package.json
│   ├── .env                      ← WA_PORT, PARENT_URL, SERVICE_SECRET, RESOLVER_URL
│   ├── sessions/                 ← Auth data per workspace (auto-created)
│   │   ├── fcae0309-.../         ← Ramishwar's WhatsApp session
│   │   └── 8295a4f7-.../        ← Kishynay's WhatsApp session
│   └── upload_queue/             ← Failed uploads saved here for retry
│
└── resolver/                     ← wwebjs (resolves LID → phone + DP)
    ├── index.js                  ← ⭐ Resolver service
    ├── package.json
    ├── .env                      ← PORT, SERVICE_SECRET
    └── session/                  ← wwebjs auth (Chromium session)
```

### Firewall

```
Ports open: 3100, 3200 (tag: whatsapp-service)
```

---

## How They Connect

```
User Browser
    │
    ├── https://app.cybercontrol.fun (Vercel)
    │       │
    │       └── API calls → https://api.cybercontrol.fun
    │                              │
    │                    ┌─────────▼──────────┐
    │                    │  GCP #1 (Backend)   │
    │                    │  Nginx → Node.js    │
    │                    │  PostgreSQL          │
    │                    │  Google Drive API    │
    │                    └─────────┬──────────┘
    │                              │
    │              WhatsApp proxy calls (HTTP)
    │                              │
    │                    ┌─────────▼──────────┐
    │                    │  GCP #2 (WhatsApp)  │
    │                    │  Baileys :3100       │
    │                    │  Resolver :3200      │
    │                    └─────────┬──────────┘
    │                              │
    │                    WhatsApp Web Protocol
    │                              │
    │                    ┌─────────▼──────────┐
    │                    │  WhatsApp Servers   │
    │                    └────────────────────┘
```

---

## Key Files to Edit

| To change... | Edit this file | Then... |
|---|---|---|
| Backend logic | `backend/src/modules/*/routes.ts` | `npx tsc` → scp dist → `pm2 restart` |
| Frontend UI | `frontend/src/features/*/` | `git push` (Vercel auto-deploys) |
| WhatsApp service | `whatsapp-service/index.js` | scp to GCP #2 → `pm2 restart` |
| Resolver | `whatsapp-resolver/index.js` | scp to GCP #2 → `pm2 restart` |
| Extension | `extension/` | Rebuild → load unpacked in Chrome |
| Environment vars | `.env` on GCP | `pm2 restart` |
| Database schema | Run SQL via `sudo -u postgres psql -d cybercontrol` | |
| Nginx config | `/etc/nginx/sites-enabled/default` on GCP #1 | `sudo nginx -t && sudo systemctl reload nginx` |
