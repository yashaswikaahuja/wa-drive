#!/bin/bash
# health-check.sh — Detects the issues that bit us today.
# Usage: bash health-check.sh
# Exit code 0 = healthy, non-zero = action needed.

set +e
RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
issues=0

check() {
  local name="$1"; local cmd="$2"; local expected="$3"
  local got
  got=$(eval "$cmd" 2>/dev/null | head -c 200)
  if [[ "$got" == *"$expected"* ]]; then
    echo "${GREEN}✓${RESET} $name"
  else
    echo "${RED}✗${RESET} $name — got: ${got:-<empty>}"
    issues=$((issues + 1))
  fi
}

echo "=== CyberControl Health Check ==="
echo

echo "--- HUB (GCP#1) ---"
check "Hub /api/health"             "ssh gcp-worker 'curl -s http://localhost:3000/api/health'"  '"status":"ok"'
check "Hub WA_SECRET set"            "ssh gcp-worker 'grep -q ^WA_SECRET= /opt/cybercontrol-hub/backend/.env && echo SET'"  'SET'
check "Hub WA_SERVICE points to GCP#2" "ssh gcp-worker 'grep ^WA_SERVICE= /opt/cybercontrol-hub/backend/.env'"  '34.100.147.20'
check "Hub PM2 process online"       "ssh gcp-worker 'pm2 jlist 2>/dev/null | grep -o cybercontrol-hub.*online | head -1'"  'cybercontrol-hub'
check "Hub systemd enabled"          "ssh gcp-worker 'sudo systemctl is-enabled pm2-bharattvv542 2>&1'"  'enabled'

echo
echo "--- WORKER (GCP#2) ---"
WA_HEALTH=$(gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="curl -s http://localhost:3100/health" 2>/dev/null)
RESOLVER_HEALTH=$(gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="curl -s http://localhost:3200/health" 2>/dev/null)
[[ "$WA_HEALTH" == *'"status":"ok"'* ]] \
  && echo "${GREEN}✓${RESET} Worker /health" \
  || { echo "${RED}✗${RESET} Worker /health — got: $WA_HEALTH"; issues=$((issues+1)); }
[[ "$RESOLVER_HEALTH" == *'"status":"ok"'* ]] \
  && echo "${GREEN}✓${RESET} Resolver /health" \
  || { echo "${YELLOW}!${RESET} Resolver /health — got: $RESOLVER_HEALTH (non-critical, only used for @lid)"; }

PM2_USERS=$(gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="ps aux | grep 'PM2.*God' | grep -v grep | awk '{print \$1}' | sort -u" 2>/dev/null)
if [[ "$PM2_USERS" == "kishy" ]]; then
  echo "${GREEN}✓${RESET} Single PM2 daemon (kishy)"
else
  echo "${RED}✗${RESET} PM2 daemons running: $PM2_USERS — must be ONLY kishy. Run 'pm2 kill' as the wrong user."
  issues=$((issues + 1))
fi

SESSIONS_OWNER=$(gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="stat -c %U /opt/whatsapp/service/sessions" 2>/dev/null)
[[ "$SESSIONS_OWNER" == "kishy" ]] \
  && echo "${GREEN}✓${RESET} sessions/ owned by kishy" \
  || { echo "${RED}✗${RESET} sessions/ owned by '$SESSIONS_OWNER' — must be kishy. Run: sudo chown -R kishy:kishy /opt/whatsapp/service/sessions"; issues=$((issues+1)); }

PORTS=$(gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="sudo ss -tulpn | grep -E ':(3100|3200) ' | wc -l" 2>/dev/null)
[[ "$PORTS" == "2" ]] \
  && echo "${GREEN}✓${RESET} Ports 3100 + 3200 each held by exactly one process" \
  || { echo "${RED}✗${RESET} Port count: $PORTS (expected 2) — possible orphan/conflict"; issues=$((issues+1)); }

echo
echo "--- FRONTEND ---"
FE=$(curl -s -o /dev/null -w '%{http_code}' https://app.cybercontrol.fun/)
[[ "$FE" == "200" ]] \
  && echo "${GREEN}✓${RESET} https://app.cybercontrol.fun/ returns 200" \
  || { echo "${RED}✗${RESET} https://app.cybercontrol.fun/ returned $FE"; issues=$((issues+1)); }

API=$(curl -s https://api.cybercontrol.fun/api/health)
[[ "$API" == *'"status":"ok"'* ]] \
  && echo "${GREEN}✓${RESET} https://api.cybercontrol.fun/api/health" \
  || { echo "${RED}✗${RESET} api.cybercontrol.fun/api/health — got: $API"; issues=$((issues+1)); }

echo
if [[ $issues -eq 0 ]]; then
  echo "${GREEN}All systems healthy ✓${RESET}"
  exit 0
else
  echo "${RED}$issues issue(s) detected. See OPERATIONS.md for fixes.${RESET}"
  exit 1
fi
