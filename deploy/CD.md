# CD — Continuous Deployment

How code reaches production after this pipeline is activated. See [`/GHCR.md`](../GHCR.md) for the
overall architecture (images, tailnet, decoupled DB).

## Pipeline at a glance
```
push to master ──► build image ──► push to GHCR        (automatic CI)
you click "Run workflow" ──► Deploy (manual) ──► VM: pull + recreate ──► health check ──► (rollback on fail)   (manual CD)
```
- **CI** (automatic): `docker-publish*.yml` build each service image and push to GHCR on push to master.
- **CD** (manual): the **`Deploy (manual)`** workflow (`.github/workflows/deploy.yml`, `workflow_dispatch`)
  lets you pick a service and deploy it via the reusable [`_deploy.yml`](../.github/workflows/_deploy.yml).
  **Deploys never run automatically** — *you* triggering the workflow is the gate. (Environment
  required-reviewers need a paid plan or a public repo, so manual dispatch is the free-tier gate.)
- **Frontend** keeps its own CD via **Vercel** (auto-build on push) — not in this pipeline.

To deploy: Actions tab → **Deploy (manual)** → **Run workflow** → choose the service → Run.

| Service | Build workflow | Deploys to | Health check |
|---|---|---|---|
| backend | `docker-publish.yml` | `cybercontrol-app` | `:3000/api/health` |
| extension-service | `docker-publish-extension.yml` | `cybercontrol-app` | `:3300/health` |
| whatsapp-service | `docker-publish-whatsapp.yml` | `cybercontrol-wa` | `:3100/health` |

> The **whatsapp-resolver stays on pm2** on `cybercontrol-wa` (not containerized, not in CD). It uses
> whatsapp-web.js, which permits only one active session per account — a copied session in a container
> logs the account out. It's a single non-scaling oracle, so pm2 is the right home. Its image is still
> built for reference, but never auto-deployed.

## How `_deploy.yml` works
1. Joins your **tailnet** ephemerally (`tailscale/github-action`) so the runner can reach the VM by name.
2. SSHes to the target VM and runs: `docker compose pull` → stop/rm/**create**/**start** the service
   (this host's Compose CLI rejects `up -d`).
3. Polls `health_url` for ~90s. **On failure it rolls back** by retagging the previously-running
   image and bringing the service back up, then fails the run.

## Required GitHub secrets (Settings → Secrets and variables → Actions)
| Secret | What |
|---|---|
| `TS_AUTHKEY` | Tailscale **reusable + ephemeral auth key** (Keys tab; no tag needed) — lets the runner join the tailnet |
| `DEPLOY_SSH_KEY` | Private SSH key authorized on both VMs (`cybercontrol-app`, `cybercontrol-wa`) |
| `DEPLOY_SSH_USER` | SSH user on the VMs |

A `production` environment exists and the deploy job records to it. **Required-reviewer approval is
not used** — it needs a paid plan or public repo. The gate is instead that deploys are **manual**
(you trigger `Deploy (manual)`); nothing reaches the VMs without your click.

> Generate a dedicated deploy keypair (`ssh-keygen -t ed25519`), add the **public** key to
> `~/.ssh/authorized_keys` on both VMs, and store the **private** key as `DEPLOY_SSH_KEY`.
> Create the Tailscale auth key in the admin console (**Settings → Keys → Generate auth key**,
> Reusable + Ephemeral, no tag needed) and store it as `TS_AUTHKEY`.

## One-time prerequisite: cut over from pm2 to containers
Today the live services run via **pm2 from source** — there is nothing for CD to update yet.
Before CD is meaningful, run each service as a container from its compose file:

**App VM (`cybercontrol-app`):**
```bash
sudo mkdir -p /opt/cybercontrol-docker
# place deploy/docker-compose.app.yml at /opt/cybercontrol-docker/docker-compose.app.yml
# ensure /opt/cybercontrol-docker/.env has DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, WA_SECRET,
#   GROQ_API_KEY, GOOGLE_* (DATABASE_URL uses cybercontrol-db; WA_SERVICE uses cybercontrol-wa)
pm2 stop cybercontrol-hub extension-service        # free ports 3000/3300
cd /opt/cybercontrol-docker
docker compose -f docker-compose.app.yml up -d
curl -s http://localhost:3000/api/health           # expect {"status":"ok"}
# if good: pm2 delete cybercontrol-hub extension-service && pm2 save
# rollback: docker compose -f docker-compose.app.yml down && pm2 restart cybercontrol-hub extension-service
```

**WA VM (`cybercontrol-wa`):** first apply `backend/migrations/wa_auth.sql` to the DB and run
`whatsapp-service/migrate-sessions-to-db.js` (see PR #1), then:
```bash
# place deploy/docker-compose.wa.yml + .env (DATABASE_URL, WA_SECRET, WA_AUTH_BACKEND)
# Stop ONLY whatsapp-service (leave whatsapp-resolver on pm2 — do not containerize it).
pm2 stop whatsapp-service
docker compose -f docker-compose.wa.yml create
docker compose -f docker-compose.wa.yml start   # this box's compose CLI rejects `up -d`
curl -s http://localhost:3100/health
# whatsapp-service uses Baileys: with WA_AUTH_BACKEND=files + the on-disk sessions (or a seeded
# volume), accounts reconnect with no QR re-scan; the backend triggers /sessions/start per workspace.
```

Once the services run as containers, run **Deploy (manual)** from the Actions tab whenever you want to
ship the latest image (it does `pull` → recreate → health-check on the chosen service).

## Activation checklist
- [x] 3 secrets set: `TS_AUTHKEY`, `DEPLOY_SSH_KEY`, `DEPLOY_SSH_USER`
- [x] `deploy` user (in `docker` group) + key authorized on both VMs (verified)
- [x] `production` environment exists; `TS_AUTHKEY` via reusable+ephemeral auth key (no tag)
- [x] Compose files at `/opt/cybercontrol-docker/` on each VM; app + whatsapp-service containerized
- [ ] Merge this PR
- [ ] Deploy on demand: **Actions → Deploy (manual) → Run workflow → pick service**

## Notes / limits
- Rollback is best-effort (retag previous image of the primary service). For stronger guarantees,
  pin to `:<sha>` tags and add blue-green/canary later (e.g., a second instance group + weighted LB).
- whatsapp-service is **stateful/sharded** — deploys restart the socket (brief reconnect). With
  DB-backed auth (PR #1) it reconnects without re-scanning QR.
