# CyberControl — Containers, GHCR & Deployment Guide

This document describes every container image, how they are built and published to **GHCR**
(GitHub Container Registry), how the services connect to each other over **Tailscale**, and
the **runbooks for moving any service to a different VM / cloud**.

> ⚠️ **Secrets:** this file uses placeholders like `<DB_PASSWORD>` for sensitive values.
> Real values live in each host's `.env` (e.g. `/opt/cybercontrol-docker/.env`,
> `/opt/cybercontrol-hub/backend/.env`). **Do not commit real secrets into this file.**

---

## 1. The big picture

Two kinds of things:

- **Stateless compute** — the application containers. Disposable. Kill / move / recreate freely.
- **Stateful data** — the Postgres database and the WhatsApp login sessions. Must be preserved
  when you move instances, or restored from backup.

Everything talks to everything else over a **private Tailscale network (tailnet)** using stable
**MagicDNS hostnames** (never public IPs). So when you replace a VM, the new one just joins the
tailnet under the **same hostname** and all connections re-establish automatically.

```
                         Tailscale tailnet  (suffix: taild72c71.ts.net)
   ┌───────────────────────────────────────────────────────────────────────────┐
   │                                                                             │
   │   cybercontrol-app            cybercontrol-wa            cybercontrol-db     │
   │   (backend :3000)             (whatsapp :3100            (Postgres :5432)    │
   │                                + resolver :3200)                            │
   │        │  ──────► cybercontrol-wa:3100 (WA_SERVICE)        ▲                 │
   │        │  ──────────────────────────────► cybercontrol-db:5432 (DATABASE_URL)│
   │        ▲                                                                     │
   │        └────────── cybercontrol-app:3000 (PARENT_URL) ◄── whatsapp-service   │
   │                                          whatsapp-service ──► localhost:3200 │
   └───────────────────────────────────────────────────────────────────────────┘

   Frontend (Vercel today, or GHCR nginx image) ──► https://api.cybercontrol.fun/api
                                                      (public domain → backend)
```

---

## 2. Container images (GHCR)

All under `ghcr.io/yashaswikaahuja/`. Registry is **private** — hosts must `docker login ghcr.io`
with a token that has `read:packages` (or make a package public).

| Image | Source dir | Port | Tech | Stateful? |
|-------|-----------|------|------|-----------|
| `cybercontrol-backend:latest`          | `./backend`           | 3000 | Node/Express + tsc | no (state in DB) |
| `cybercontrol-frontend:latest`         | `./frontend`          | 80   | Vite/React + nginx | no |
| `cybercontrol-whatsapp-service:latest` | `./whatsapp-service`  | 3100 | Baileys             | **yes** — `/app/sessions` |
| `cybercontrol-whatsapp-resolver:latest`| `./whatsapp-resolver` | 3200 | whatsapp-web.js + Chromium | **runs on pm2, NOT containerized** (see note) |
| `cybercontrol-extension-service:latest` | `./extension-service` | 3300 | Node | minor — `DATA_DIR` files (mappings/adapters) |

Each image is also tagged with the commit SHA (`:<git-sha>`) for rollback.

> **Resolver runs on pm2, not in a container.** whatsapp-web.js allows only one active session per
> account; starting a container with a copied session triggers WhatsApp's duplicate-session logout
> (which forces a QR re-scan). The resolver is a single, non-scaling lookup oracle, so it stays as a
> pm2 process on `cybercontrol-wa`. Its image is still built for reference but is never deployed by CD.

### Verify an image exists
```bash
docker manifest inspect ghcr.io/yashaswikaahuja/cybercontrol-backend:latest
```

---

## 3. Build pipeline (GitHub Actions → GHCR)

Images are **built off-box in CI**, never on the small VMs (building tsc/Chromium OOM-kills a 1 GB VM).
Each workflow triggers on push to `master` that touches the relevant dir, uses the built-in
`GITHUB_TOKEN` (no PAT needed for *pushing*), builds `linux/amd64`, and pushes `:latest` + `:<sha>`.

| Workflow file | Builds | Triggers on |
|---------------|--------|-------------|
| `.github/workflows/docker-publish.yml`           | backend            | `backend/**` |
| `.github/workflows/docker-publish-frontend.yml`  | frontend           | `frontend/**` |
| `.github/workflows/docker-publish-whatsapp.yml`  | wa-service + resolver | `whatsapp-service/**`, `whatsapp-resolver/**` |
| `.github/workflows/docker-publish-extension.yml` | extension-service  | `extension-service/**` |

**To rebuild:** push a change under the relevant dir, or run the workflow manually
(`workflow_dispatch`) — e.g. `gh run list --workflow=docker-publish.yml`.

### Frontend build note
The frontend bakes its API target **at build time** (Vite). The values are passed as build-args /
defaults in `frontend/Dockerfile`:
```
VITE_API_URL=https://api.cybercontrol.fun/api
VITE_SOCKET_URL=https://api.cybercontrol.fun
VITE_GOOGLE_CLIENT_ID=62092486976-jhsn62q3ufj4dvr42c1hpubnujasaqok.apps.googleusercontent.com
```
These are public client-side values. If you want a frontend that talks to a *co-located* backend,
rebuild with `--build-arg VITE_API_URL=http://<host>:3000/api` or add an nginx `/api` proxy.

---

## 4. The hosts (current deployment)

| Tailnet name (MagicDNS) | Tailnet IP | Role | GCP instance / account | Region |
|-------------------------|-----------|------|------------------------|--------|
| `cybercontrol-app` | 100.101.187.24 | Backend (+ extension-service) | `whatsapp-worker` / **bharattvv542** | us-central1-f |
| `cybercontrol-db`  | 100.76.185.22  | Postgres 15 | `cybercontrol-db` / **kishynay** (proj `cybercontrol-db-20260605`) | us-central1-a |
| `cybercontrol-wa`  | 100.64.23.97   | whatsapp-service + resolver | `cybercontrol-whatsapp` / **bharattvv542** | asia-south1-a |

> Note: the backend VM is confusingly named `whatsapp-worker` in GCP — it is the **app/backend** host.
> The frontend currently runs on **Vercel** at `app.cybercontrol.fun`; the GHCR frontend image lets you
> self-host it anywhere.

---

## 5. How services connect (env vars)

All cross-host addresses are **tailnet MagicDNS names**, so they survive instance changes.

### backend (`cybercontrol-app`)
```
PORT=3000
DATABASE_URL=postgresql://cybercontrol_app:<DB_PASSWORD>@cybercontrol-db:5432/cybercontrol
WA_SERVICE=http://cybercontrol-wa:3100      # env-driven (default in config.ts)
WA_SECRET=<WA_SECRET>
JWT_SECRET=<JWT_SECRET>
JWT_REFRESH_SECRET=<JWT_REFRESH_SECRET>
GROQ_API_KEY=<GROQ_API_KEY>                 # + GROQ_API_KEY_2 (fallback)
GOOGLE_CLIENT_ID=<...>  GOOGLE_CLIENT_SECRET=<...>  GOOGLE_REDIRECT_URI=<...>
```
> The Google **Drive token is NOT an env var** — it lives in the DB (`app_secrets` /
> `workspace_secrets`). It travels with the database automatically.

### whatsapp-service (`cybercontrol-wa`, port 3100)
```
WA_PORT=3100
PARENT_URL=http://cybercontrol-app:3000     # backend over tailnet
RESOLVER_URL=http://localhost:3200          # resolver is co-located
WA_SECRET=<WA_SECRET>
AUTH_DIR=/app/sessions                       # (container) — Baileys session state
```

### whatsapp-resolver (`cybercontrol-wa`, port 3200)
```
PORT=3200
SERVICE_SECRET=<WA_SECRET>
# whatsapp-web.js session stored in ./session (LocalAuth)
```
**Resolver QR**: served over HTTP, reachable from any tailnet device at
`http://cybercontrol-wa:3200/qr-page?secret=<WA_SECRET>`. A QR only appears when the resolver is
**not** connected (i.e. session lost / needs re-linking).

### frontend (nginx, port 80)
API target baked in at build time (see §3). No runtime env needed.

---

## 6. Database (decoupled) + backups

- **Host:** `cybercontrol-db` · Postgres 15 · db `cybercontrol` · user `cybercontrol_app`.
- **Network:** listens on `localhost` + the tailnet IP only (NOT the public internet).
  `pg_hba.conf` allows the tailnet range `100.64.0.0/10` with `scram-sha-256`.
- **Connection string:** `postgresql://cybercontrol_app:<DB_PASSWORD>@cybercontrol-db:5432/cybercontrol`
  (the MagicDNS name; the tailnet IP `100.76.185.22` also works).

### Backups (on `cybercontrol-db`)
- **Logical dump** — `/usr/local/bin/cybercontrol-backup.sh`, cron `30 20 * * *` (UTC),
  writes `/var/backups/cybercontrol/cybercontrol-<ts>.sql.gz`, 7-day retention. Portable `.sql`.
- **Disk snapshots** — GCP resource policy `cybercontrol-db-daily`, daily 21:00 UTC, 14-day
  retention, attached to the boot disk. Survives VM deletion.

### Manual backup / restore
```bash
# backup
sudo -u postgres pg_dump --no-owner --no-acl cybercontrol | gzip > backup.sql.gz
# restore into a fresh DB
zcat backup.sql.gz | psql -U cybercontrol_app -h cybercontrol-db -d cybercontrol
```

---

## 7. Stateful data to preserve when moving instances

| Data | Where | If lost |
|------|-------|---------|
| Database (incl. Drive tokens) | `cybercontrol-db` Postgres | restore from `pg_dump` / snapshot |
| whatsapp-service sessions | `cybercontrol-wa:/opt/whatsapp/service/sessions` (or container `/app/sessions`) | re-scan WhatsApp QR per workspace (in the app UI) |
| whatsapp-resolver session | `cybercontrol-wa:/opt/whatsapp/resolver/session` | re-scan QR at `http://cybercontrol-wa:3200/qr-page?secret=...` |

---

## 8. Runbook — shifting a service to a different VM

### Universal prerequisites on any new VM
```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh
# 2. Tailscale — join with the SAME hostname the old node used
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=<TAILSCALE_AUTHKEY> --hostname=<service-name>
# 3. Login to GHCR (private registry)
echo <GHCR_TOKEN> | docker login ghcr.io -u yashaswikaahuja --password-stdin
```
> **MagicDNS gotcha:** if the OLD node is still registered with that hostname, Tailscale gives the
> new one a `-1` suffix (e.g. `cybercontrol-app-1`). **Delete/rename the old node** in the Tailscale
> admin console first so the new VM gets the exact name other services expect.

---

### 8a. Move the BACKEND (`cybercontrol-app`) — stateless, easiest
```bash
sudo tailscale up --hostname=cybercontrol-app          # same name
docker pull ghcr.io/yashaswikaahuja/cybercontrol-backend:latest
docker run -d --restart unless-stopped --network host \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://cybercontrol_app:<DB_PASSWORD>@cybercontrol-db:5432/cybercontrol" \
  -e WA_SERVICE="http://cybercontrol-wa:3100" \
  -e WA_SECRET=<WA_SECRET> -e JWT_SECRET=<...> -e JWT_REFRESH_SECRET=<...> \
  -e GROQ_API_KEY=<...> -e GOOGLE_CLIENT_ID=<...> -e GOOGLE_CLIENT_SECRET=<...> -e GOOGLE_REDIRECT_URI=<...> \
  ghcr.io/yashaswikaahuja/cybercontrol-backend:latest
curl -s http://localhost:3000/api/health     # expect {"status":"ok"}
```
Then point DNS `api.cybercontrol.fun` → the new VM's public IP (for the frontend & Google OAuth redirect).
No data migration needed — it reads everything from the DB over the tailnet.

`--network host` is used so the container can reach the tailnet (`100.x` / MagicDNS) directly.

---

### 8b. Move the DATABASE (`cybercontrol-db`) — stateful
```bash
# On NEW db VM:
sudo apt-get install -y postgresql
sudo -u postgres psql -c "CREATE ROLE cybercontrol_app LOGIN PASSWORD '<DB_PASSWORD>';"
sudo -u postgres createdb -O cybercontrol_app cybercontrol
# restore latest dump (copy it over first)
zcat cybercontrol-<ts>.sql.gz | psql -U cybercontrol_app -h localhost -d cybercontrol
# network: listen on localhost + tailnet IP, allow tailnet in pg_hba
#   listen_addresses = 'localhost,<new-tailnet-ip>'
#   host cybercontrol cybercontrol_app 100.64.0.0/10 scram-sha-256
sudo systemctl restart postgresql
sudo tailscale up --hostname=cybercontrol-db          # same name → backend finds it unchanged
```
Re-create the backup cron + snapshot schedule on the new box.

---

### 8c. Move the WHATSAPP host (`cybercontrol-wa`) — stateful (sessions!)
```bash
sudo tailscale up --hostname=cybercontrol-wa
# Option A (preserve login): copy the session dirs from the old host first
#   /opt/whatsapp/service/sessions   and   /opt/whatsapp/resolver/session
docker pull ghcr.io/yashaswikaahuja/cybercontrol-whatsapp-service:latest
docker pull ghcr.io/yashaswikaahuja/cybercontrol-whatsapp-resolver:latest
docker run -d --restart unless-stopped --network host \
  -e WA_PORT=3100 -e PARENT_URL="http://cybercontrol-app:3000" \
  -e RESOLVER_URL="http://localhost:3200" -e WA_SECRET=<WA_SECRET> \
  -v wa_sessions:/app/sessions \
  ghcr.io/yashaswikaahuja/cybercontrol-whatsapp-service:latest
docker run -d --restart unless-stopped --network host \
  -e PORT=3200 -e SERVICE_SECRET=<WA_SECRET> \
  -v wa_resolver_auth:/app/.wwebjs_auth \
  ghcr.io/yashaswikaahuja/cybercontrol-whatsapp-resolver:latest
```
- **Option A** (copy session dirs into the volumes): reconnects silently, no QR.
- **Option B** (fresh): re-link by scanning QR codes — workspaces in the app UI (service),
  and `http://cybercontrol-wa:3200/qr-page?secret=<WA_SECRET>` (resolver).

---

### 8d. Move / self-host the FRONTEND
```bash
docker pull ghcr.io/yashaswikaahuja/cybercontrol-frontend:latest
docker run -d --restart unless-stopped -p 80:80 ghcr.io/yashaswikaahuja/cybercontrol-frontend:latest
```
It serves the SPA and calls `https://api.cybercontrol.fun/api` (baked at build). Just make sure that
domain resolves to a live backend. (Currently the frontend is hosted on Vercel.)

---

### 8e. Move / run the EXTENSION-SERVICE
Runs alongside the backend on `cybercontrol-app` (nginx routes `/api/profiles*`, `/api/mappings*`,
`/api/adapters*` → port 3300). Shares the **same DB and JWT_SECRET** as the backend.
```bash
docker pull ghcr.io/yashaswikaahuja/cybercontrol-extension-service:latest
docker run -d --restart unless-stopped --network host \
  -e PORT=3300 \
  -e DATABASE_URL="postgresql://cybercontrol_app:<DB_PASSWORD>@cybercontrol-db:5432/cybercontrol" \
  -e JWT_SECRET=<JWT_SECRET> \
  -e DATA_DIR=/app/data \
  -v ext_data:/app/data \
  ghcr.io/yashaswikaahuja/cybercontrol-extension-service:latest
```
`JWT_SECRET` **must match the backend's** (it verifies tokens the hub issued). The `DATA_DIR` volume
holds the legacy `mappings.json` / `adapters.json` file stores — preserve it when moving.

---

## 9. Quick reference

```bash
# tailnet status / IPs
sudo tailscale status
# is a tailnet host reachable by name?
sudo tailscale ping cybercontrol-db
# backend health
curl -s http://cybercontrol-app:3000/api/health
# db reachable + connected clients
psql "postgresql://cybercontrol_app:<DB_PASSWORD>@cybercontrol-db:5432/cybercontrol" -c '\dt'
# resolver connection state
curl -s http://cybercontrol-wa:3200/health      # {"status":"ok","connected":true}
# watch a CI build
gh run list --workflow=docker-publish.yml
```

---

## 10. Known gaps / TODO
- WhatsApp host is in `asia-south1` while app/db are in `us-central1` → ~270 ms cross-region latency
  over the tailnet. Co-locate regions if WhatsApp throughput becomes a concern.
- Automate WhatsApp **session-dir backups** so a moved WA host restores instead of re-scanning QR.
- **Revoke** any Tailscale auth key that was shared in chat once nodes are joined.
