# CD — Continuous Deployment

How code reaches production after this pipeline is activated. See [`/GHCR.md`](../GHCR.md) for the
overall architecture (images, tailnet, decoupled DB).

## Pipeline at a glance
```
push to master ──► build image ──► push to GHCR ──► deploy job (gated) ──► VM: pull + up -d ──► health check ──► (rollback on fail)
```
- **CI** (existing): `docker-publish*.yml` build each service image and push to GHCR.
- **CD** (this): each build workflow now has a `deploy` job (`needs: build-push`) that calls the
  reusable [`_deploy.yml`](../.github/workflows/_deploy.yml). The deploy job runs in the
  **`production` GitHub Environment**, so you can require manual approval.
- **Frontend** keeps its own CD via **Vercel** (auto-build on push) — not in this pipeline.

| Service | Build workflow | Deploys to | Health check |
|---|---|---|---|
| backend | `docker-publish.yml` | `cybercontrol-app` | `:3000/api/health` |
| extension-service | `docker-publish-extension.yml` | `cybercontrol-app` | `:3300/health` |
| whatsapp-service + resolver | `docker-publish-whatsapp.yml` | `cybercontrol-wa` | `:3100/health` |

## How `_deploy.yml` works
1. Joins your **tailnet** ephemerally (`tailscale/github-action`) so the runner can reach the VM by name.
2. SSHes to the target VM and runs: `docker compose -f <compose> pull <services>` → `up -d`.
3. Polls `health_url` for ~90s. **On failure it rolls back** by retagging the previously-running
   image and bringing the service back up, then fails the run.

## Required GitHub secrets (Settings → Secrets and variables → Actions)
| Secret | What |
|---|---|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client id (tag `tag:ci`) — lets the runner join the tailnet |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `DEPLOY_SSH_KEY` | Private SSH key authorized on both VMs (`cybercontrol-app`, `cybercontrol-wa`) |
| `DEPLOY_SSH_USER` | SSH user on the VMs |

Also create an **Environment** named `production` (Settings → Environments) and optionally add
required reviewers so deploys wait for approval.

> Generate a dedicated deploy keypair (`ssh-keygen -t ed25519`), add the **public** key to
> `~/.ssh/authorized_keys` on both VMs, and store the **private** key as `DEPLOY_SSH_KEY`.
> Create the Tailscale OAuth client in the Tailscale admin console (Settings → OAuth clients) with
> the `tag:ci` tag, and add an ACL allowing `tag:ci` to reach the VMs (or use Tailscale SSH).

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
# place deploy/docker-compose.wa.yml + .env (DATABASE_URL, WA_SECRET, WA_AUTH_BACKEND=postgres)
pm2 stop whatsapp-service whatsapp-resolver
docker compose -f docker-compose.wa.yml up -d
curl -s http://localhost:3100/health
# verify WhatsApp accounts reconnect (re-scan QR for any that don't)
```

Once the services run as containers, the CD pipeline's `docker compose pull && up -d` takes over on
every push.

## Activation checklist
- [ ] Add the 4 secrets + create the `production` environment
- [ ] Place `deploy/docker-compose.app.yml` and `.wa.yml` at `/opt/cybercontrol-docker/` on each VM (+ their `.env`)
- [ ] One-time cutover pm2 → containers (above)
- [ ] Authorize `DEPLOY_SSH_KEY` on both VMs; create the Tailscale `tag:ci` OAuth client + ACL
- [ ] Merge — next push to master auto-builds and (after approval) deploys

## Notes / limits
- Rollback is best-effort (retag previous image of the primary service). For stronger guarantees,
  pin to `:<sha>` tags and add blue-green/canary later (e.g., a second instance group + weighted LB).
- whatsapp-service is **stateful/sharded** — deploys restart the socket (brief reconnect). With
  DB-backed auth (PR #1) it reconnects without re-scanning QR.
