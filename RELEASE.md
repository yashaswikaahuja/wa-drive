# RELEASE.md

Operational runbook: how to **add a WhatsApp node**, **release a new version**, and **roll back**.
Copy-paste friendly. Replace every `<VALUE>` placeholder.

---

## Values you'll need

```
  TS_AUTHKEY     Tailscale auth key (tagged tag:cybercontrol)   → login.tailscale.com → Settings → Keys
  GHCR_TOKEN     GHCR read:packages token (ghp_...)             → github.com → Settings → Dev settings → Tokens
  DATABASE_URL   postgresql://cybercontrol_app:<pw>@cybercontrol-db:5432/cybercontrol
  WA_SECRET      shared worker secret (must match the backend)
```
Read DATABASE_URL + WA_SECRET off an existing box:
```bash
ssh gcp-worker "sudo grep -hE '^(DATABASE_URL|WA_SECRET)=' /opt/cybercontrol-docker/backend.env"
```

---

## A. Add a WhatsApp node — fresh VM (cloud-init, any cloud)

**One step:** create the VM and paste `deploy/scripts/cloud-init-wa-selfcontained.yaml` as its
**user data**, with the 5 `__PLACEHOLDERS__` filled in. It self-provisions on first boot — no SSH.

```
  AWS:     "User data" (Advanced details)
  Oracle:  "Cloud-init script"
  GCP:     --metadata-from-file user-data=cloud-init-wa-selfcontained.yaml
  Hetzner/DO/Azure: the "user data" / "cloud-config" field
```

Done. Skip to **section C (verify)**.

---

## B. Add a WhatsApp node — existing/running Linux box (manual, ~1 min)

For a box you log into (e.g. RDP Linux) where cloud-init won't re-run. Run these 3 blocks in a terminal.

### B1 — config
```bash
sudo mkdir -p /opt/cc && sudo tee /opt/cc/node.env >/dev/null <<EOF
TS_AUTHKEY=<TS_AUTHKEY>
TS_TAG=tag:cybercontrol
WA_INSTANCE_NAME=cybercontrol-wa-<N>
GHCR_TOKEN=<GHCR_TOKEN>
DATABASE_URL=<DATABASE_URL>
WA_SECRET=<WA_SECRET>
PARENT_URL=http://cybercontrol-app:3000
WA_AUTH_BACKEND=postgres
EOF
```

### B2 — provision script
```bash
sudo tee /opt/cc/provision.sh >/dev/null <<'SCRIPT'
#!/bin/bash
set -e
exec >>/var/log/cc-provision.log 2>&1
echo "=== cc provision $(date) ==="
TS_KEY="$TS_AUTHKEY"; WA_NAME="$WA_INSTANCE_NAME"
DEPLOY_PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINp+ul1LemdrPohJ/2OEzUg8QLSmMXjdecQPY6lGS9Xr cybercontrol-cd-deploy'
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now docker tailscaled
if [ -n "$TS_TAG" ]; then
  tailscale up --auth-key="${TS_KEY}?ephemeral=false&preauthorized=true" --advertise-tags="$TS_TAG" --hostname="$WA_NAME"
else
  tailscale up --auth-key="$TS_KEY" --hostname="$WA_NAME"
fi
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh && echo "$DEPLOY_PUBKEY" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
echo "$GHCR_TOKEN" | sudo -u deploy -H docker login ghcr.io -u yashaswikaahuja --password-stdin
mkdir -p /opt/cybercontrol-docker
cat > /opt/cybercontrol-docker/docker-compose.wa.yml <<'COMPOSE'
services:
  whatsapp-service:
    image: ghcr.io/yashaswikaahuja/cybercontrol-whatsapp-service:${IMAGE_TAG:-latest}
    pull_policy: always
    restart: unless-stopped
    network_mode: host
    environment:
      NODE_ENV: production
      WA_PORT: "3100"
      PARENT_URL: ${PARENT_URL:-http://cybercontrol-app:3000}
      WA_SECRET: ${WA_SECRET}
      WA_AUTH_BACKEND: ${WA_AUTH_BACKEND:-postgres}
      WA_INSTANCE_NAME: ${WA_INSTANCE_NAME:-}
      WA_HEARTBEAT_MS: ${WA_HEARTBEAT_MS:-10000}
      DATABASE_URL: ${DATABASE_URL}
      AUTH_DIR: /app/sessions
    volumes:
      - wa_sessions:/app/sessions
volumes:
  wa_sessions:
COMPOSE
chown -R deploy:deploy /opt/cybercontrol-docker
echo "=== cc provision complete $(date) ==="
SCRIPT
sudo chmod +x /opt/cc/provision.sh
```

### B3 — provision + start
```bash
set -a && . /opt/cc/node.env && set +a
sudo -E bash /opt/cc/provision.sh
cd /opt/cybercontrol-docker && sudo -u deploy -E docker compose -f docker-compose.wa.yml up -d
```

---

## C. Verify a new node

On the node:
```bash
sudo cat /var/log/cc-provision.log          # → "cc provision complete"
sudo tailscale status | head                # → joined; lists cybercontrol-db / cybercontrol-app
ping -c1 cybercontrol-db                     # → resolves (MagicDNS). MUST work — else ACL/tag issue
sudo docker ps                               # → whatsapp-service ... Up
sudo docker logs $(sudo docker ps -q) 2>&1 | tail -20   # → listening :3100, heartbeat lines
```

End-to-end (from the app VM) — confirm it registered + heartbeats:
```bash
ssh gcp-worker "DBURL=\$(sudo grep -h '^DATABASE_URL=' /opt/cybercontrol-docker/backend.env | cut -d= -f2-); \
  sudo docker run --rm --network host postgres:15-alpine psql \"\$DBURL\" -tAc \
  \"SELECT instance,status,last_seen FROM wa_instances WHERE instance='cybercontrol-wa-<N>'\""
# → cybercontrol-wa-<N> | up | <recent timestamp>
```

> If `ping cybercontrol-db` fails: the node joined the tailnet but can't resolve/reach peers.
> Check the Tailscale ACL — `tag:cybercontrol` must be in tagOwners AND allowed to reach the
> db/app/resolver nodes. See `deploy/tailscale/tailscale-acl.json`.

---

## D. Put a node into the live pool (takes real traffic)

A new node heartbeats but won't get customer sessions until it's in the pool variable.
```
  GitHub → Settings → Secrets and variables → Variables → WA_INSTANCES
  add the node's name, e.g.  cybercontrol-wa,cybercontrol-wa-2,cybercontrol-wa-<N>
```
Then redeploy the backend so it picks up the new pool:
```bash
gh workflow run deploy.yml -f target=backend -f version=latest
```
> Leave it OUT of WA_INSTANCES to keep it a standby/test node (heartbeats only, no live sessions).

---

## E. Release a new version (code or new library)

```
  1. edit code / `npm install <lib>` (commit BOTH package.json AND package-lock.json)
  2. git push origin master
        → CI builds the image, SMOKE-TESTS it (boots + health check), pushes to GHCR :latest + :<sha>
           a broken image FAILS CI and is never pushed
  3. deploy:
        single VM:   gh workflow run deploy.yml -f target=backend           -f version=latest
        whole pool:  gh workflow run deploy.yml -f target=backend-pool      -f version=latest
        wa pool:     gh workflow run deploy.yml -f target=whatsapp-pool     -f version=latest
```
- Pool deploys are **rolling** (one host at a time, health-gated; stops + auto-rolls-back on failure).
- New system-dep libs (e.g. needing apt packages) → also add the `apt-get install` line to the
  service Dockerfile in the same commit, or the image build/boot will fail (caught by CI smoke-test).

---

## F. Roll back

Every build is tagged with its commit SHA, so rollback = deploy an older tag (no rebuild):
```bash
gh workflow run deploy.yml -f target=backend       -f version=<old-commit-sha>
gh workflow run deploy.yml -f target=backend-pool  -f version=<old-commit-sha>
```
Find SHAs in GHCR or `git log --oneline`.

---

## G. Decommission a test/old node

```bash
# 1. remove from pool var WA_INSTANCES (if it was added) + redeploy backend
# 2. stop it
sudo -u deploy docker compose -f /opt/cybercontrol-docker/docker-compose.wa.yml down
# 3. delete the VM (provider console / gcloud)
# 4. clean its stale heartbeat row + tailnet node
#    psql:  DELETE FROM wa_instances WHERE instance='<name>';
#    Tailscale admin → Machines → remove the node
```

---

## See also
- `deploy/docs/SCALING-AUTOMATION.md` — the hands-off add-node + rolling-deploy design
- `deploy/docs/CD.md` — the deploy pipeline internals
- `deploy/docs/DB-BACKUPS.md` — backups + restore
- `deploy/docs/NETWORKING.md` — ports, tailnet, flows, failure modes
