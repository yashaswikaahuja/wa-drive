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
- **Processes:** `cybercontrol-hub`, `extension-service`
- **Hub backend dist:** `/opt/cybercontrol-hub/backend/dist/`
- **Hub .env:** `/opt/cybercontrol-hub/.env` ⚠️ (NOT `backend/.env` — PM2 starts hub with cwd=`/opt/cybercontrol-hub`, so dotenv reads from there)
- **extension-service:** `/opt/extension-service/` (port 3300)
- **extension-service .env:** `/opt/extension-service/.env` (must share `JWT_SECRET` and `DATABASE_URL` with hub)

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

### Saved contact name not showing on dashboard
The resolver (whatsapp-web.js) provides operator's saved contact names. If names show as WA push names (sender's display name) or just phone numbers:

1. **Check resolver is logged in:**
   ```bash
   gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="curl -s http://localhost:3200/health"
   ```
   Should show `"connected":true`. If false, scan QR at:
   `http://34.100.147.20:3200/qr-page?secret=wa-service-secret-2024`

2. **Check worker for ReferenceError or other silent failures:**
   ```bash
   gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="sudo -u kishy pm2 logs whatsapp-service --nostream --lines 30 --err"
   ```
   `WA_SECRET is not defined` means worker code references undefined var — redeploy `whatsapp-service/index.js` from master.

3. **Verify resolver returns the name directly:**
   ```bash
   gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="curl -s 'http://localhost:3200/contact?phone=919006615450' -H 'x-service-secret: wa-service-secret-2024'"
   ```
   Should return `{"phone":"...","name":"<saved name>"}`. If `name:null`, the operator hasn't saved that contact in their phone book.

4. **Backfill old customers:** Run `node /opt/cybercontrol-hub/backend/backfill-saved-names.cjs` (reads `scripts/backfill-saved-names.js` from repo).

### Resolver stuck — won't init Chromium
Symptom: `[Resolver] Init failed: The browser is already running for /opt/whatsapp/resolver/session/session`

Cause: orphan Chrome process holding the userDataDir, OR stale SingletonLock files from a crashed previous run.

**Fix:** `bash recover-resolver.sh` — kills orphans, removes locks, restarts cleanly.

### Same WhatsApp number receives messages twice (duplicate uploads)
Two workspaces are paired to the same WA number. Each Baileys session is its own linked device, so both receive every message.

**Diagnose:** `health-check.sh` flags this. Or query DB:
```sql
SELECT phone_number, count(*) FROM whatsapp_sessions
WHERE status='connected' GROUP BY phone_number HAVING count(*) > 1;
```

**Fix:** Decide which workspace keeps the number, delete the other's session creds:
```bash
gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="sudo rm -rf /opt/whatsapp/service/sessions/<WORKSPACE_ID> && sudo -u kishy pm2 restart whatsapp-service"
```

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



## Extension (Chrome AutoFill v5.47+)

### Repository layout

```
extension/                      ← runs IN THE BROWSER (operator's Chrome)
├── manifest.json, background.js, content.js, popup.{html,js}
├── autofill/
│   ├── extractor.js, mapper.js, planner.js, executor.js
│   └── plugins/                ← per-component-type adapters
│       ├── interface.js, cascade-select.js, ng-dropdown.js, button-click.js
└── scripts/
    ├── fixes/                  ← historical Python patches (already applied)
    └── tests/                  ← node-runnable autofill smoke tests

extension-service/              ← runs ON THE SERVER (GCP#1, port 3300)
├── index.js, db.js, auth.js
└── routes/
    ├── profiles.js             ← workspace-scoped profile list + autofill data
    ├── mappings.js             ← global form_field → profileKey mappings
    └── adapters.js             ← global per-site component selectors
```

The frontend Sidebar shows extension status: 🟢 connected, 🟡 connecting, 🔴 off.

### Connection status indicator (sidebar)
The frontend shows a colored dot at the bottom of the sidebar:
- 🟢 Green = extension connected, version shown
- 🟡 Yellow pulsing = trying to connect (cold service worker)
- 🔴 Red = extension off / not installed
- ⚫ Gray = checking

The bridge auto-retries forever (3s, 6s, ..., capped at 15s). Once connected, it pings every 60s to refresh the token in case the service worker restarted.

### Extension shows only one profile (or wrong profiles)
**Cause:** `/api/profiles` is reading from the legacy JSON file (`backend/data/profiles.json`) instead of the workspace-scoped DB.

**Fix:**
1. Ensure latest code is deployed:
   ```bash
   ssh gcp-worker "grep -c 'workspace_id' /opt/cybercontrol-hub/backend/dist/api/routes/profiles.routes.js"
   ```
   Must be ≥ 2 (DB-backed). If 0, the legacy version is deployed — rebuild + scp.

2. Test the endpoint directly:
   ```bash
   # Get a token by logging in
   TOKEN=$(curl -s -X POST https://api.cybercontrol.fun/api/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}' | jq -r .accessToken)
   # Should return JSON array of profiles for that workspace, NOT a static list
   curl -s https://api.cybercontrol.fun/api/profiles -H "Authorization: Bearer $TOKEN" | jq length
   ```

3. If a stale `profiles.json` exists on server, move it aside:
   ```bash
   ssh gcp-worker "sudo mv /opt/cybercontrol-hub/backend/data/profiles.json /opt/cybercontrol-hub/backend/data/profiles.json.legacy 2>/dev/null"
   ```

### Extension doesn't connect to frontend at all
**Symptom:** sidebar dot stays red, popup says "Please login again" or fails.

1. **Verify content script is injected**: open DevTools console on `app.cybercontrol.fun`, run:
   ```js
   console.log('Bridge:', window._ccCSBridgeInit, 'chrome:', !!chrome?.runtime);
   ```
   - `Bridge: undefined` → content script not running. Reload extension at `chrome://extensions`.
   - `chrome: false` → no chrome runtime API exposed; means extension isn't installed or page URL doesn't match manifest.

2. **Verify manifest matches the URL**: extension only injects on `app.cybercontrol.fun`. If you changed domains, update `extension/manifest.json` `content_scripts[0].matches`.

3. **Reload extension**: after editing extension code, you MUST reload it at `chrome://extensions` — Chrome doesn't hot-reload extension code.

4. **Service worker dead**: Chrome MV3 SW can sleep. The 60s keepalive in extensionBridge.ts handles this — first message after wake takes ~1-2s. Sidebar will briefly show 🟡 then go 🟢.

### Form fields don't autofill on a govt site
- Verify the site URL is in `extension/manifest.json` `content_scripts[0].matches`
- Open the form, click extension icon → select profile → Fill button
- Check browser console for `[CC]` errors
- If a new field type isn't filling, the autofill plugins (`extension/autofill/plugins/`) need an adapter

### Where the legacy JSON store lived
`backend/src/api/routes/profiles.routes.ts` originally read/wrote `backend/data/profiles.json`. That file is now deprecated — moved to `.legacy` extension and the route reads the DB. Don't restore the JSON-backed version.