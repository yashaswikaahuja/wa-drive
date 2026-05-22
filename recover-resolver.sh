#!/bin/bash
# recover-resolver.sh — One-command recovery for a stuck whatsapp-resolver
# Run from your local machine: bash recover-resolver.sh
# Run on GCP#2 directly: bash recover-resolver.sh --local
#
# Fixes:
#  - Orphan Chrome processes holding userDataDir
#  - Stale SingletonLock files
#  - Wrong file ownership
#  - Restarts resolver via kishy PM2

set -e
GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RED=$'\e[31m'; RESET=$'\e[0m'

if [[ "$1" == "--local" ]]; then
  RUN() { eval "$@"; }
else
  RUN() { gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="$1"; }
fi

echo "${YELLOW}=== Recovering whatsapp-resolver on GCP#2 ===${RESET}"

echo "Step 1: Stop resolver via PM2"
RUN "sudo -u kishy pm2 stop whatsapp-resolver" || true

echo "Step 2: Kill orphan Chrome processes (resolver session)"
RUN "sudo pkill -9 -f 'chrome.*resolver/session' 2>/dev/null; sudo pkill -9 -f chrome_crashpad_handler 2>/dev/null; sleep 2; true"

echo "Step 3: Remove stale Chromium Singleton locks"
RUN "sudo rm -f /opt/whatsapp/resolver/session/session/Singleton{Lock,Cookie,Socket} 2>/dev/null; true"

echo "Step 4: Verify port 3200 is free"
PORT_HOLDERS=$(RUN "sudo ss -tulpn 2>/dev/null | grep ':3200 ' | wc -l" | tr -d '[:space:]')
if [[ "$PORT_HOLDERS" != "0" ]]; then
  echo "${RED}WARN: Port 3200 still held — run: sudo fuser -k 3200/tcp${RESET}"
fi

echo "Step 5: Lock ownership of session/ to kishy"
RUN "sudo chown -R kishy:kishy /opt/whatsapp/resolver/session 2>/dev/null; true"

echo "Step 6: Restart resolver via kishy PM2"
RUN "sudo -u kishy pm2 reset whatsapp-resolver; sudo -u kishy pm2 start whatsapp-resolver"

echo "Step 7: Wait for Chrome boot..."
sleep 12

HEALTH=$(RUN "curl -s http://localhost:3200/health" | tr -d '[:space:]')
echo "Health: $HEALTH"

if [[ "$HEALTH" == *'"connected":true'* ]]; then
  echo "${GREEN}✓ Resolver fully connected${RESET}"
elif [[ "$HEALTH" == *'"status":"ok"'* ]]; then
  echo "${YELLOW}! Resolver running but not logged into WhatsApp.${RESET}"
  echo "  Open this URL in a browser to scan QR:"
  echo "  http://34.100.147.20:3200/qr-page?secret=wa-service-secret-2024"
else
  echo "${RED}✗ Resolver health check failed. Check logs:${RESET}"
  echo "  gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command='sudo -u kishy pm2 logs whatsapp-resolver --lines 30'"
  exit 1
fi
