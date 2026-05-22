# CyberControl — Operations Runbook

> The single document that tells you who owns what, how QR delivery works, and how to fix it when it breaks.

## Architecture

```
┌──────────────┐    HTTPS    ┌──────────────────────┐    HTTP     ┌─────────────────────┐
│  Vercel      │────────────▶│  GCP #1 (Hub)        │────────────▶│  GCP #2 (Worker)    │
│  Frontend    │   nginx     │  136.115.232.70      │  internet   │  34.100.147.20      │
│  app.        │   :443      │  api.cybercontrol.fun│  :3100      │  /opt/whatsapp/     │
│  cyber...    │             │  PM2: cybercontrol-  │             │  PM2 (kishy):        │
│              │             │  hub (bharattvv542)  │             │  whatsapp-service   │
└──────────────┘             └──────────────────────┘             │  whatsapp-resolver  │
                                                                  └─────────────────────┘
```

## QR Delivery Flow (HTTP polling, no socket.io)

1. Frontend calls `POST /api/whatsapp/connect` (with JWT)
2. Hub forwards to GCP#2 `POST /sessions/start` (with `x-service-secret`)
3. Worker creates Baileys session, generates QR, POSTs to hub `/api/worker/event`
4. Hub caches QR per workspace in memory (`workspaceQRs` Map)
5. Frontend polls `GET /api/whatsapp/status` every 3s
6. Hub returns cached QR + worker's live status. Auto-restarts session if QR is stuck >45s.

## Server Ownership (DO NOT CHANGE)

### GCP #1 — `136.115.232.70` (cybercontrol-worker)
- **PM2 daemon owner:** `bharattvv542` (yes, this is correct)
- **systemd unit:** `pm2-bharattvv542.service` (enabled)
- **Processes:** `cybercontrol-hub` only
- **Backend dist:** `/opt/cybercontrol-hub/backend/dist/`
- **Backend env:** `/opt/cybercontrol-hub/backend/.env`

### GCP #2 — `34.100.147.20` (cybercontrol-whatsapp)
- **PM2 daemon owner:** `kishy` (NOT yasha)
- **systemd unit:** `pm2-kishy.service` (enabled)
- **Processes:** `whatsapp-service` (port 3100), `whatsapp-resolver` (port 3200)
- **Worker code:** `/opt/whatsapp/service/index.js`
- **Sessions dir:** `/opt/whatsapp/service/sessions/<workspaceId>/` (owned by `kishy:kishy`)
- **Chrome binary:** `/home/kishy/.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome`

### Vercel
- **Auto-deploys** on push to `master` branch
- **Domain:** `app.cybercontrol.fun`
- **Build command:** `cd frontend && npm run build`
- **Output:** `frontend/dist/`

## Critical Environment Variables

### GCP #1 — `/opt/cybercontrol-hub/backend/.env` (must include)
```
WA_SECRET=wa-service-secret-2024
WA_SERVICE=http://34.100.147.20:3100
JWT_SECRET=<random>
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GROQ_API_KEY=...
```

### GCP #2 — Worker env (set via PM2)
```
WA_PORT=3100
PARENT_URL=https://api.cybercontrol.fun
SERVICE_SECRET=wa-service-secret-2024  (or WA_SECRET — must match hub's WA_SECRET)
AUTH_DIR=/opt/whatsapp/service/sessions
RESOLVER_URL=http://localhost:3200
```

**Rule:** `WA_SECRET` (hub) and `SERVICE_SECRET` (worker) MUST be identical. Hub logs show first 4 chars on startup: `[Hub] WA_SECRET starts with: wa-s***`.

## Common Failures & Fixes

### QR not appearing on dashboard

1. **Check hub logs:** `ssh gcp-worker "pm2 logs cybercontrol-hub --nostream --lines 20"`
   - Look for `[Hub] QR cached for workspace XXX` — if missing, worker isn't sending QRs
2. **Check worker:** `gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="curl -s http://localhost:3100/health"`
   - `sessions: 0` + worker logs show `EACCES` → run `sudo chown -R kishy:kishy /opt/whatsapp/service/sessions`
   - `sessions: 0` + frontend hangs on `/connect` → secret mismatch, check both `.env` files
3. **Check sockets in room:** `curl https://api.cybercontrol.fun/api/whatsapp/debug/<workspaceId>` (with auth header)

### Port already in use (EADDRINUSE)
This was today's bug. Caused by **two PM2 daemons** (kishy + yasha) running and competing.
```bash
gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a
ps aux | grep PM2.*God
# If you see TWO daemons, kill the wrong one:
pm2 kill   # kills the one for the user you SSHed as
# Then verify:
sudo -u kishy pm2 list   # should show whatsapp-service and whatsapp-resolver online
```

### QR appears but never refreshes
The hub auto-restarts when QR is stuck >45s. If still stuck:
- Worker session probably crashed in `qr_pending`
- Look for `ReferenceError` or any thrown error in worker logs
- If found: `cd /opt/whatsapp/service && sudo -u kishy pm2 restart whatsapp-service`

### User scans QR, sees "Disconnected" in logs
**Reason 408 (timeout) repeatedly** = phone-side issue, not our code:
- WhatsApp's "Linked Devices" limit hit on phone (max 4)
- User needs to remove old linked devices on phone
- Or the account is rate-limited — wait 15 min before retry

**Reason 401 (loggedOut)** = user logged out from phone. Just rescan QR.

**Reason 515 (restartRequired)** = normal Baileys handoff after pairing — followed by Connected event.

### Hub session permissions broken (after manual SSH/chown)
```bash
gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="sudo chown -R kishy:kishy /opt/whatsapp/service/sessions /opt/whatsapp/service/upload_queue && sudo -u kishy pm2 restart whatsapp-service"
```

## Deployment Cheatsheet

### Backend code change
```bash
cd backend && npx tsc --skipLibCheck     # build (TS errors are non-blocking)
scp -r dist gcp-worker:/tmp/dist-new
ssh gcp-worker "sudo rm -rf /opt/cybercontrol-hub/backend/dist && sudo mv /tmp/dist-new /opt/cybercontrol-hub/backend/dist && sudo chown -R bharattvv542:bharattvv542 /opt/cybercontrol-hub/backend/dist && pm2 restart cybercontrol-hub"
```

### Worker code change
```bash
gcloud compute scp whatsapp-service/index.js cybercontrol-whatsapp:/tmp/index.js.new --zone=asia-south1-a
gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="sudo cp /tmp/index.js.new /opt/whatsapp/service/index.js && sudo chown kishy:kishy /opt/whatsapp/service/index.js && sudo -u kishy pm2 restart whatsapp-service"
```

### Frontend code change
```bash
git push origin master   # Vercel auto-deploys in ~1 min
```

## Health Checks

Run anytime: `bash health-check.sh` (in repo root)

Checks:
- Hub /api/health returns ok
- GCP#2 worker /health returns ok (sessions count visible)
- GCP#2 resolver /health returns ok
- Both PM2 daemons stable (no high restart counts)
- WA_SECRET matches between hub and worker (first 4 chars)
- No port conflicts on 3100/3200

## Rules That Saved Us From Loops

1. **Never run two PM2 daemons on the same VM.** Pick ONE user, save its config, enable systemd unit. Kill any others.
2. **Source code is the source of truth, not /opt/.** Always edit `backend/src/`, build, scp. Live patches to `/opt/.../dist/` get reverted on git checkout.
3. **All deploys go through git.** Frontend especially — Vercel rebuilds on push.
4. **Secrets must match exactly.** WA_SECRET on hub == SERVICE_SECRET on worker. Hub prints the prefix on startup; worker should too.
5. **Sessions dir must be owned by the PM2 user.** If you ever `chown` it, make sure target user matches the PM2 daemon user.

## Service Tracking

| Service | VM | User | Port | Purpose | Critical? |
|---------|-----|------|------|---------|-----------|
| cybercontrol-hub | GCP#1 | bharattvv542 | 3000 | Express API + Socket.IO | YES |
| postgresql | GCP#1 | postgres | 5432 | Database | YES |
| nginx | GCP#1 | www-data | 80/443 | TLS + reverse proxy | YES |
| whatsapp-service | GCP#2 | kishy | 3100 | Baileys WhatsApp | YES |
| whatsapp-resolver | GCP#2 | kishy | 3200 | wwebjs LID resolver | LOW (only for @lid → phone) |
| Vercel | Cloud | — | — | Frontend hosting | YES |
