#!/bin/bash
# CLOUD-AGNOSTIC self-provision for a WhatsApp worker VM (GCP, Oracle, AWS, Hetzner, bare VM, WSL...).
# Installs docker+tailscale, starts the daemons (systemd OR manual on no-systemd boxes), joins the
# tailnet, creates the deploy user, logs into GHCR, drops the compose file. ~60-90s on first boot.
#
# Works WITH or WITHOUT systemd: on no-systemd boxes (WSL, minimal containers) it starts tailscaled/
# dockerd manually and waits for the daemon before joining (so it never silently hangs). Run as root
# on those (no sudo-password prompt to block it).
#
# Config comes from ENVIRONMENT VARIABLES (so any cloud's cloud-init / user-data can set them, or run
# it by hand). On GCP, if a var is unset it falls back to the instance metadata server.
#   TS_AUTHKEY        tskey-auth-...  (recommended: a plain AUTH key)  OR  tskey-client-... (OAuth secret)
#   TS_TAG            tag:cybercontrol  (advertise this tag; must be in the tailnet ACL tagOwners +
#                                        allowed to reach db/app/resolver)
#   WA_INSTANCE_NAME  cybercontrol-wa-N  (this node's tailnet hostname)
#   GHCR_TOKEN        ghp_...            (GHCR read:packages token for the deploy user)
#
# Examples:
#   any cloud (cloud-init user-data or manual):
#     sudo TS_AUTHKEY=... TS_TAG=tag:cybercontrol WA_INSTANCE_NAME=cybercontrol-wa-3 GHCR_TOKEN=... bash provision-wa-instance.sh
#   GCP: pass the same as instance metadata keys ts-authkey/ts-tag/wa-instance-name/ghcr-token.
set -e
exec >>/var/log/cc-provision.log 2>&1
echo "=== cc provision $(date) ==="

# Config: prefer env vars; on GCP fall back to the metadata server (2s timeout, harmless elsewhere).
gcp_meta() { curl -s -m 2 -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null; }
: "${TS_AUTHKEY:=$(gcp_meta ts-authkey)}"
: "${TS_TAG:=$(gcp_meta ts-tag)}"
: "${WA_INSTANCE_NAME:=$(gcp_meta wa-instance-name)}"
: "${GHCR_TOKEN:=$(gcp_meta ghcr-token)}"
TS_KEY="$TS_AUTHKEY"
WA_NAME="$WA_INSTANCE_NAME"
DEPLOY_PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINp+ul1LemdrPohJ/2OEzUg8QLSmMXjdecQPY6lGS9Xr cybercontrol-cd-deploy'

# Detect whether systemd is the init (PID 1). On boxes WITHOUT systemd (WSL, minimal containers),
# `systemctl` fails and the daemons must be started by hand — otherwise `tailscale up` hangs forever
# trying to reach a tailscaled that never started.
HAS_SYSTEMD=0
if [ "$(ps -p 1 -o comm= 2>/dev/null)" = "systemd" ] && command -v systemctl >/dev/null; then HAS_SYSTEMD=1; fi
echo "systemd present: $HAS_SYSTEMD"

# 1. docker + tailscale
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

# 2. start the daemons (systemd if available, else manual background) and WAIT until tailscaled answers.
if [ "$HAS_SYSTEMD" = "1" ]; then
  systemctl enable --now docker tailscaled
else
  echo "no systemd → starting daemons manually"
  mkdir -p /run/tailscale /var/lib/tailscale
  pgrep -x tailscaled >/dev/null || nohup tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/run/tailscale/tailscaled.sock >/var/log/tailscaled.log 2>&1 &
  pgrep -x dockerd    >/dev/null || command -v dockerd >/dev/null && (nohup dockerd >/var/log/dockerd.log 2>&1 &) || true
fi
# Wait for tailscaled to be reachable before trying to join (prevents the silent hang).
for i in $(seq 1 20); do
  if tailscale status >/dev/null 2>&1 || tailscale status 2>&1 | grep -qiE 'logged out|stopped'; then
    echo "tailscaled is up (after ${i}s)"; break
  fi
  [ "$i" = "20" ] && { echo "ERROR: tailscaled did not come up after 20s — see /var/log/tailscaled.log"; exit 1; }
  sleep 1
done

# 3. join the tailnet under the right name.
#    Key type matters:
#      tskey-auth-...   → plain auth key, used directly (NO query string).
#      tskey-client-... → OAuth client secret; tailscale mints a key (the tag/ephemeral come from the
#                         OAuth client's own config). Advertise the tag in both cases if TS_TAG is set.
TAGFLAG=""
[ -n "$TS_TAG" ] && TAGFLAG="--advertise-tags=$TS_TAG"
case "$TS_KEY" in
  tskey-client-*) echo "joining via OAuth client${TS_TAG:+ (tag $TS_TAG)}"
                  tailscale up --auth-key="$TS_KEY" $TAGFLAG --hostname="$WA_NAME" ;;
  *)              echo "joining via auth key${TS_TAG:+ (tag $TS_TAG)}"
                  tailscale up --auth-key="$TS_KEY" $TAGFLAG --hostname="$WA_NAME" ;;
esac

# 4. deploy user (docker group) + CD public key
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
echo "$DEPLOY_PUBKEY" > /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# 5. GHCR login as deploy (so `docker compose pull` works). Non-fatal: log a warning but keep going.
echo "$GHCR_TOKEN" | sudo -u deploy -H docker login ghcr.io -u yashaswikaahuja --password-stdin \
  || echo "WARN: GHCR login as deploy failed (check GHCR_TOKEN); continuing"

# 6. deploy dir + compose (CD writes <service>.env + pulls/recreates on deploy)
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
