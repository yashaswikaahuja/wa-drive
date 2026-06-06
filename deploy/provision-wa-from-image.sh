#!/bin/bash
# Boot script for VMs cloned from a pre-baked image (docker + tailscale + deploy user + GHCR creds +
# compose + service image already present). The ONLY first-boot work is joining the tailnet.
# CLOUD-AGNOSTIC: config via env vars (cloud-init/user-data on any cloud), GCP metadata as fallback.
#   TS_AUTHKEY, TS_TAG (if OAuth), WA_INSTANCE_NAME
set -e
exec >>/var/log/cc-provision.log 2>&1
echo "=== cc boot-join $(date) ==="
gcp_meta() { curl -s -m 2 -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null; }
: "${TS_AUTHKEY:=$(gcp_meta ts-authkey)}"
: "${TS_TAG:=$(gcp_meta ts-tag)}"
: "${WA_INSTANCE_NAME:=$(gcp_meta wa-instance-name)}"
TS_KEY="$TS_AUTHKEY"
WA_NAME="$WA_INSTANCE_NAME"

systemctl enable --now tailscaled
if [ -n "$TS_TAG" ]; then
  tailscale up --auth-key="${TS_KEY}?ephemeral=false&preauthorized=true" --advertise-tags="$TS_TAG" --hostname="$WA_NAME"
else
  tailscale up --auth-key="$TS_KEY" --hostname="$WA_NAME"
fi
mkdir -p /opt/cybercontrol-docker && touch /opt/cybercontrol-docker/.provisioned
echo "=== cc boot-join complete $(date) ==="
