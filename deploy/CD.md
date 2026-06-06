# CD — Continuous Deployment

How code reaches production. See [`/GHCR.md`](../GHCR.md) for the overall architecture (images,
tailnet, decoupled DB). **Status: live and verified.**

## Pipeline at a glance
```
push to master ──► build image ──► push to GHCR (:latest + :<sha>)          (automatic CI)
you ──► Deploy (manual): pick service + version ──► VM: pull → recreate ──► health check ──► (auto-rollback on fail)   (manual CD)
```
- **CI** (automatic): `docker-publish*.yml` build each service image and push to GHCR on push to master,
  tagged `:latest` **and** `:<commit-sha>`.
- **CD** (manual): the **`Deploy (manual)`** workflow (`.github/workflows/deploy.yml`, `workflow_dispatch`)
  deploys one service via the reusable [`_deploy.yml`](../.github/workflows/_deploy.yml).
  **Deploys never run automatically** — *you* triggering the workflow is the gate (environment
  required-reviewers need a paid plan / public repo, so manual dispatch is the free-tier gate).
- **Strategy:** one-at-a-time **recreate** (stop → start), not blue-green. One version runs at a time.
- **Frontend** keeps its own CD via **Vercel** (auto-build on push + dashboard rollback) — not in this pipeline.

| Service | Build workflow | Deploys to | Health check |
|---|---|---|---|
| backend | `docker-publish.yml` | `cybercontrol-app` | `:3000/api/health` |
| extension-service | `docker-publish-extension.yml` | `cybercontrol-app` | `:3300/health` |
| whatsapp-service | `docker-publish-whatsapp.yml` | `cybercontrol-wa` | `:3100/health` |

> The **whatsapp-resolver stays on pm2** (not containerized, not in CD): whatsapp-web.js allows only one
> active session per account, so a copied session in a container logs the account out. It's a single
> non-scaling oracle. Its image is built for reference but never deployed.

## Deploy and roll back
**Actions tab → "Deploy (manual)" → Run workflow:**
- **Deploy newest:** pick the service, leave **`version`** = `latest` → Run.
- **Roll back to a previous version:** pick the service, set **`version`** to that build's **commit SHA**
  (every build is tagged `:<sha>`, so all prior versions are in GHCR) → Run. It redeploys that older image.

```
v2 deployed → bug found → re-run Deploy with version=<v1 sha> → only v1 runs again
```
Two rollback layers: (1) **manual** — redeploy any prior SHA as above; (2) **automatic** — if a fresh
deploy fails its health check, `_deploy.yml` retags the previously-running image and brings it back, then
fails the run.

**Manual fallback** (if Actions is down), from your machine:
```bash
ssh deploy@cybercontrol-app "cd /opt/cybercontrol-docker && IMAGE_TAG=<tag> \
  docker compose -f docker-compose.app.yml pull backend && \
  docker compose -f docker-compose.app.yml stop backend && \
  docker compose -f docker-compose.app.yml rm -f backend && \
  docker compose -f docker-compose.app.yml create backend && \
  docker compose -f docker-compose.app.yml start backend"
```

## How `_deploy.yml` works
1. **Validates `image_tag`** against the Docker tag charset (`[A-Za-z0-9._-]`, ≤128) — rejects anything
   else, so a free-form version value can't inject shell commands over SSH.
2. Joins your **tailnet** ephemerally (`tailscale/github-action`) so the runner reaches the VM by name.
3. SSHes in as the `deploy` user and runs `IMAGE_TAG=<version> docker compose pull` → stop/rm/**create**/**start**
   the service (this host's Compose CLI rejects `up -d`). Compose images are `:${IMAGE_TAG:-latest}`.
4. Polls `health_url` for ~90s; **auto-rollback** to the previous image on failure.

## GitHub secrets (all set + verified)
| Secret | What |
|---|---|
| `TS_AUTHKEY` | Tailscale **reusable + ephemeral** auth key (Keys tab; no tag) — runner joins the tailnet |
| `DEPLOY_SSH_KEY` | Private key for the `deploy` user, authorized on both VMs |
| `DEPLOY_SSH_USER` | `deploy` (a user in the `docker` group on both VMs) |
| `APP_ENV` | full `.env` for the app VM (DATABASE_URL, JWT_*, WA_SECRET, GROQ, GOOGLE_*) |
| `WA_ENV` | full `.env` for the WA VM (DATABASE_URL, WA_SECRET, WA_AUTH_BACKEND, PARENT_URL, RESOLVER_URL) |

> **Env is provisioned automatically.** Each deploy writes the VM's `/opt/cybercontrol-docker/.env`
> from `APP_ENV` / `WA_ENV` (via `scp`) before `docker compose` runs — so a fresh VM needs no manual
> `.env`. GitHub is the source of truth; update the secret to change a VM's env. (`/opt/cybercontrol-docker`
> is owned by the `deploy` user so it can write the file.)

A `production` environment exists (the deploy job records to it). Required-reviewer approval isn't used
(needs a paid plan / public repo); the **manual trigger is the gate**.

## Status — done
- [x] 3 secrets set + verified (`deploy` user SSHs into both VMs with docker access).
- [x] `production` environment created; Tailscale via reusable+ephemeral auth key.
- [x] Compose files at `/opt/cybercontrol-docker/` on each VM.
- [x] Cutover complete: backend + extension-service (app VM) and whatsapp-service (WA VM) run as
      containers; resolver on pm2; pm2 entries for the containerized services removed (`pm2 save`).
- [x] CD verified end-to-end (a real backend deploy succeeded: pull → recreate → health 200).

## How the cutover was done (reference)
**App VM (`cybercontrol-app`):** placed `docker-compose.app.yml` + `.env` at `/opt/cybercontrol-docker/`,
then `pm2 stop cybercontrol-hub extension-service` → `docker compose -f docker-compose.app.yml create` →
`start` → verified `:3000/api/health` → `pm2 delete … && pm2 save`.
**WA VM (`cybercontrol-wa`):** placed `docker-compose.wa.yml` + `.env` (`WA_AUTH_BACKEND=files`), seeded a
volume from the existing `/opt/whatsapp/service/sessions` so accounts reconnect with **no QR re-scan**,
then `pm2 stop whatsapp-service` → `create`/`start`. (Resolver left on pm2.)

## Notes / limits
- One-at-a-time recreate → a brief blip during deploy/rollback (acceptable). Zero-downtime would need
  blue-green, which doesn't fit the stateful WhatsApp services anyway.
- whatsapp-service deploy restarts the socket (brief reconnect); with DB-backed auth it reconnects
  without re-scanning QR.
- GHCR pulls on the VMs use the `deploy` user's `docker login`. **If you rotate the GHCR PAT, re-run
  `docker login ghcr.io` as `deploy` on both VMs** or CD pulls will fail.
