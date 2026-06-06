#!/bin/bash
# Boot script for VMs created FROM the `cybercontrol-wa-image` machine image.
# docker, tailscale (installed), the deploy user, GHCR creds, the compose file, AND the
# whatsapp-service image are all pre-baked — so the ONLY first-boot work is joining the tailnet
# under this node's own identity. Brings a new shard up in well under a minute.
#
# Metadata: ts-authkey (tskey-auth-... or OAuth tskey-client-...), ts-tag (if OAuth), wa-instance-name
set -e
exec >>/var/log/cc-provision.log 2>&1
echo "=== cc boot-join $(date) ==="
META="http://metadata.google.internal/computeMetadata/v1/instance/attributes"
meta() { curl -s -H "Metadata-Flavor: Google" "$META/$1"; }
TS_KEY=$(meta ts-authkey)
TS_TAG=$(meta ts-tag)
WA_NAME=$(meta wa-instance-name)

systemctl enable --now tailscaled
if [ -n "$TS_TAG" ]; then
  tailscale up --auth-key="${TS_KEY}?ephemeral=false&preauthorized=true" --advertise-tags="$TS_TAG" --hostname="$WA_NAME"
else
  tailscale up --auth-key="$TS_KEY" --hostname="$WA_NAME"
fi
mkdir -p /opt/cybercontrol-docker && touch /opt/cybercontrol-docker/.provisioned
echo "=== cc boot-join complete $(date) ==="
