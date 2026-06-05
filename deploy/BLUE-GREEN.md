# Blue-Green Deployment (backend)

Zero-downtime deploys + instant rollback for the **backend**, via an nginx switch in front of two
backend containers. Applies to the backend only — see *Scope* below.

## How it works
```
                api.cybercontrol.fun ─► nginx :3000 ─► backend_active (blue :3001  OR  green :3002)
deploy: update IDLE color ─► health-check it ─► flip nginx upstream + reload ─► old color stays for rollback
```
- `nginx` (:3000) proxies to whichever color is **active** (`deploy/nginx/active_upstream.conf`).
- **blue** = `:3001`, **green** = `:3002`; both run from the same GHCR image, both on the DB.
- `bluegreen-deploy.sh` updates the **idle** color, health-checks it on its own port, then atomically
  repoints nginx (`nginx -t` + `-s reload`) and records the new color in `deploy/nginx/active_color`.
  The previously-live color **keeps running** so rollback is instant.
- Only the active color receives traffic (via nginx), so there's no double-writer problem. Safe
  because the backend is **stateless** (all state in the DB; only transient per-request temp files).

## Files
| File | Role |
|---|---|
| `deploy/docker-compose.bluegreen.yml` | `backend-blue` (3001) + `backend-green` (3002) + `nginx` (3000) + `extension-service` (3300) |
| `deploy/nginx/backend.conf` | nginx server on :3000 (WebSocket-aware) → `backend_active` |
| `deploy/nginx/active_upstream.conf` | the switchable upstream (rewritten on each switch) |
| `deploy/nginx/active_color` | state: `blue` or `green` |
| `deploy/bluegreen-deploy.sh` | deploy idle → health-check → switch |
| `deploy/bluegreen-rollback.sh` | flip back to the other (still-running) color |

## Deploy / rollback
- **Deploy:** Actions → *Deploy (manual)* → `backend` → Run. (The `backend` job SSHes in and runs
  `bluegreen-deploy.sh`.) Or manually: `ssh deploy@cybercontrol-app "bash /opt/cybercontrol-docker/bluegreen-deploy.sh"`.
- **Rollback:** `ssh deploy@cybercontrol-app "bash /opt/cybercontrol-docker/bluegreen-rollback.sh"` — instant flip back.

## One-time activation (deliberate — re-fronts the live backend; NOT done automatically)
The live app VM currently runs the single-backend `docker-compose.app.yml` on :3000. To switch to
blue-green:
```bash
# on cybercontrol-app, as a user with docker access:
cd /opt/cybercontrol-docker
# copy these from the repo's deploy/ : docker-compose.bluegreen.yml, nginx/, bluegreen-*.sh
# stop the current single backend (frees :3000)
docker compose -f docker-compose.app.yml stop backend
# start both colors + nginx + extension
docker compose -f docker-compose.bluegreen.yml pull
docker compose -f docker-compose.bluegreen.yml create
docker compose -f docker-compose.bluegreen.yml start
curl -s http://localhost:3000/api/health    # nginx -> active (blue)
```
Rollback the *activation* itself: `docker compose -f docker-compose.bluegreen.yml down` then
`docker compose -f docker-compose.app.yml start backend`.

## Scope / limits
- **Backend only.** Not applied to:
  - **whatsapp-service** — stateful WhatsApp sockets; two live copies of one account = duplicate-session
    logout. It scales by *sharding* (one workspace → one instance), not blue-green.
  - **whatsapp-resolver** — single whatsapp-web.js oracle; can't be duplicated. Stays on pm2.
  - **frontend** — Vercel already does atomic deploys/rollbacks.
- WebSocket (socket.io) connections drop on a color switch and clients reconnect to the new color.
- Rollback window: the old color stays running until the next deploy overwrites it (it becomes the
  idle color and is recreated).
