# extension-service

Standalone API service that powers the Chrome AutoFill extension. Runs separately from the main hub so extension changes never risk breaking the dashboard.

**Layout (after safe reorg):**

```text
index.js                 # source process entry
dist/                    # generated deployable service bundle (npm run build)
src/
  http/                  # auth middleware + Express routes
  ws/                    # WSS server, handlers, fill over socket
  db/                    # Postgres pool + store helpers
  engines/               # planning, mapping, learning, HIM, …
scripts/                 # migrators / seed (one-shots)
migrations/              # SQL
```

The root compatibility shims are retained only for legacy consumers; service code imports `src/` directly.
Repo map: `docs/REPO-MAP.md`.

## What it serves

| Path | Purpose | Auth | Storage |
|------|---------|------|---------|
| `GET  /api/profiles` | List profiles for the JWT's workspace (used by extension popup) | Bearer JWT | DB `profiles` table |
| `GET  /api/profiles/:id` | Full profile with `data` JSONB (used by autofill) | Bearer JWT | DB `profiles` |
| `GET  /api/mappings/:formKey` | Saved field → profileKey mappings | none (extension-only) | `data/form_mappings.json` |
| `POST /api/mappings/:formKey` | Update mapping confidence stats | none | `data/form_mappings.json` |
| `GET  /api/adapters` | All site adapters | none | `data/adapters.json` |
| `GET  /api/adapters/:hostname` | Adapters for a hostname | none | `data/adapters.json` |
| `POST /api/adapters/:hostname` | Save/update an adapter (component selectors) | none | `data/adapters.json` |
| `PATCH /api/adapters/:hostname/:componentClass` | Update success/failure stats | none | `data/adapters.json` |
| `DELETE /api/adapters/:hostname/:componentClass` | Remove an adapter | none | `data/adapters.json` |
| `GET  /health` | Health check | none | — |

## How requests reach this service

```
Browser (extension)
  └─ HTTPS GET https://api.cybercontrol.fun/api/profiles
      └─ nginx (GCP#1, port 443)
          └─ location /api/profiles { proxy_pass http://127.0.0.1:3300; }
              └─ extension-service (this service)
                  └─ Postgres (workspace-scoped)
```

Other paths (`/api/auth/*`, `/api/whatsapp/*`, `/api/customers/*`, etc.) continue to hit the main hub at port 3000.

## Local dev

```bash
cd extension-service
cp .env.example .env
# Edit .env — set DATABASE_URL + JWT_SECRET to match the hub
npm install
npm run dev
# now: curl http://localhost:3300/health
```

## Deployment (GCP#1)

```bash
# From local machine:
scp -r extension-service gcp-worker:/tmp/extension-service-new
ssh gcp-worker "sudo rm -rf /opt/extension-service && sudo mv /tmp/extension-service-new /opt/extension-service && cd /opt/extension-service && npm install --production && pm2 start index.js --name extension-service && pm2 save"
```

`.env` on GCP#1 lives at `/opt/extension-service/.env`. **Must contain:**
- `DATABASE_URL` (same value as `/opt/cybercontrol-hub/backend/.env`)
- `JWT_SECRET` (same value as the hub)

## Safety rules

1. **Don't add code to the main hub** that touches profiles/mappings/adapters. Edit this service.
2. **DATABASE_URL and JWT_SECRET must match the hub.** Mismatch = extension stops working.
3. **DATA_DIR survives deploys.** Don't accidentally delete `/opt/extension-service/data/*.json` — those are the learned mappings and adapters.
4. **Workspace isolation: profiles only.** Mappings + adapters are intentionally global (same site/form behaves the same for all operators).
