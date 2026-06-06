# CD — Continuous Deployment

How code reaches production. See [`GHCR.md`](GHCR.md) for the overall architecture (images,
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
1. Runs in the per-service **GitHub Environment** (`backend` | `extension-service` | `whatsapp-service`),
   which supplies that service's private secrets.
2. **Validates `image_tag`** against the Docker tag charset (`[A-Za-z0-9._-]`, ≤128) — rejects anything
   else, so a free-form version value can't inject shell commands over SSH.
3. **Assembles a minimal `.env`** for that service from shared secrets + its environment's private
   secrets + config vars (empty values skipped), and `scp`s it to `/opt/cybercontrol-docker/<service>.env`.
4. Joins your **tailnet** ephemerally, then SSHes in as the `deploy` user and runs
   `docker compose --env-file <service>.env … pull` → stop/rm/**create**/**start** (this host's Compose
   CLI rejects `up -d`). Per-service env files mean co-located services never clobber each other's env.
5. Polls `health_url` for ~90s; **auto-rollback** to the previous image on failure.

## Secrets, environments & variables (ownership split)
Organized by *who owns each value*, so a service can move to an isolated VM with only what it needs.

**Repo-level secrets (shared, single source of truth):**
| Secret | What |
|---|---|
| `TS_AUTHKEY` | Tailscale reusable + ephemeral auth key — runner joins the tailnet |
| `DEPLOY_SSH_KEY` / `DEPLOY_SSH_USER` | `deploy` user key + name (authorized on both VMs) |
| `DATABASE_URL` | DB connection (shared by every service hitting the DB) |
| `JWT_SECRET` | shared by backend ⇄ extension-service (must match) |
| `JWT_REFRESH_SECRET` | refresh-token signing |
| `WA_SECRET` | shared by backend ⇄ whatsapp-service ⇄ resolver |

**Per-service Environment secrets (private):**
| Environment | Private secrets |
|---|---|
| `backend` | `GROQ_API_KEY`, `GOOGLE_CLIENT_SECRET` |
| `extension-service` | _(none)_ |
| `whatsapp-service` | _(none)_ |

**Variables (config, not secret):** repo `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`; `whatsapp-service`
env `WA_AUTH_BACKEND=files` (overrides the compose default of `postgres`). Everything else
(`WA_SERVICE`, `PARENT_URL`, `RESOLVER_URL`, `WA_INSTANCES`, ports) uses compose defaults.

> **Env is provisioned automatically + least-privilege.** Each deploy writes only that service's
> `/opt/cybercontrol-docker/<service>.env` — the sensitive `GROQ`/`GOOGLE_CLIENT_SECRET` creds only ever
> land on the backend's box. GitHub is the source of truth; a fresh VM needs no manual `.env`.

The deploy job runs in its per-service environment. Required-reviewer approval isn't used (needs a paid
plan / public repo); the **manual trigger is the gate**.

## Status — done
- [x] Repo + per-service-environment secrets/variables set and verified.
- [x] `deploy` user SSHs into both VMs with docker access; owns `/opt/cybercontrol-docker`.
- [x] Compose files at `/opt/cybercontrol-docker/` on each VM; images use `:${IMAGE_TAG:-latest}`.
- [x] Cutover complete: backend + extension-service (app VM) and whatsapp-service (WA VM) run as
      containers; resolver on pm2; pm2 entries for the containerized services removed (`pm2 save`).
- [x] CD verified end-to-end: backend, extension-service, and whatsapp-service deploys each
      pull → assemble minimal `.env` → recreate → health 200 (co-located env files don't clobber).


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
