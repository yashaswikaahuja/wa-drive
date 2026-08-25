#!/bin/bash
# Ensure the CD deploy user can SSH in (required by service-connectivity.yml and Deploy).
# Run as root on ANY CyberControl host (db, redis, lb, backend, WA, future servers).
# Idempotent.
#
# Env:
#   DEPLOY_PUBKEY  optional override (defaults to cybercontrol-cd-deploy ed25519)
set -euo pipefail

DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINp+ul1LemdrPohJ/2OEzUg8QLSmMXjdecQPY6lGS9Xr cybercontrol-cd-deploy}"

id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy 2>/dev/null || true
echo 'deploy ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

mkdir -p /home/deploy/.ssh /home/deploy/cc-connectivity-staging /opt/cybercontrol-docker/scripts
touch /home/deploy/.ssh/authorized_keys
if ! grep -qF 'cybercontrol-cd-deploy' /home/deploy/.ssh/authorized_keys; then
  printf '%s\n' "$DEPLOY_PUBKEY" >>/home/deploy/.ssh/authorized_keys
fi
chown -R deploy:deploy /home/deploy/.ssh /home/deploy/cc-connectivity-staging
chown -R deploy:deploy /opt/cybercontrol-docker 2>/dev/null || true
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chmod 0755 /home/deploy/cc-connectivity-staging

echo "OK deploy SSH access on $(hostname -s)"
