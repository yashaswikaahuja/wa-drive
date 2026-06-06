#!/bin/bash
# GCP startup-script: self-provision a WhatsApp worker VM in one shot (~60-90s on first boot),
# so adding a shard is: `gcloud instances create ... --metadata-from-file startup-script=this`
# then a CD deploy. Replaces the manual install/join/login/copy sequence.
#
# Pass per-instance values via instance metadata:
#   ts-authkey       = tskey-auth-...  OR  tskey-client-...  (auth key, or OAuth client secret)
#   ts-tag           = tag:cybercontrol   (REQUIRED if ts-authkey is an OAuth client secret;
#                                          the tag must exist in the tailnet ACL `tagOwners` and be
#                                          allowed to reach cybercontrol-db:5432 / -app:3000 / -wa:3200)
#   wa-instance-name = cybercontrol-wa-N     (this node's tailnet hostname)
#   ghcr-token       = ghp_...               (GHCR read:packages token for the deploy user)
# The deploy public key is baked in (matches the DEPLOY_SSH_KEY GitHub secret).
set -e
exec >>/var/log/cc-provision.log 2>&1
echo "=== cc provision $(date) ==="

META="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
meta() { curl -s -H "Metadata-Flavor: Google" "$META/$1"; }
TS_KEY=$(meta ts-authkey)
TS_TAG=$(meta ts-tag)
WA_NAME=$(meta wa-instance-name)
GHCR_TOKEN=$(meta ghcr-token)
DEPLOY_PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINp+ul1LemdrPohJ/2OEzUg8QLSmMXjdecQPY6lGS9Xr cybercontrol-cd-deploy'

# 1. docker + tailscale
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now docker tailscaled

# 2. join the tailnet under the right name.
#    OAuth client secret (tskey-client-...) → must advertise a tag; plain auth key → no tag.
if [ -n "$TS_TAG" ]; then
  echo "joining via OAuth client with tag $TS_TAG"
  tailscale up --auth-key="${TS_KEY}?ephemeral=false&preauthorized=true" --advertise-tags="$TS_TAG" --hostname="$WA_NAME"
else
  echo "joining via auth key"
  tailscale up --auth-key="$TS_KEY" --hostname="$WA_NAME"
fi

# 3. deploy user (docker group) + CD public key
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
echo "$DEPLOY_PUBKEY" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# 4. GHCR login as deploy (so `docker compose pull` works)
echo "$GHCR_TOKEN" | sudo -u deploy -H docker login ghcr.io -u yashaswikaahuja --password-stdin

# 5. deploy dir + compose (CD writes <service>.env + pulls/recreates on deploy)
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
      RESOLVER_URL: ${RESOLVER_URL:-http://cybercontrol-wa:3200}
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
touch /opt/cybercontrol-docker/.provisioned
