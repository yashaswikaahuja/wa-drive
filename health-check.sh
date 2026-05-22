#!/bin/bash
# health-check.sh — Detects the issues that bit us today.
# Usage: bash health-check.sh
# Exit code 0 = healthy, non-zero = action needed.

set +e
RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
issues=0; warnings=0

ok()    { echo "${GREEN}✓${RESET} $1"; }
fail()  { echo "${RED}✗${RESET} $1"; issues=$((issues+1)); }
warn()  { echo "${YELLOW}!${RESET} $1"; warnings=$((warnings+1)); }

check() {
  local name="$1"; local cmd="$2"; local expected="$3"
  local got
  got=$(eval "$cmd" 2>/dev/null | head -c 200)
  [[ "$got" == *"$expected"* ]] && ok "$name" || fail "$name — got: ${got:-<empty>}"
}

GCP2() { gcloud compute ssh cybercontrol-whatsapp --zone=asia-south1-a --command="$1" 2>/dev/null; }

echo "=== CyberControl Health Check ==="
echo

echo "--- HUB (GCP#1) ---"
check "Hub /api/health"             "ssh gcp-worker 'curl -s http://localhost:3000/api/health'"  '"status":"ok"'
check "Hub WA_SECRET set"            "ssh gcp-worker 'grep -q ^WA_SECRET= /opt/cybercontrol-hub/backend/.env && echo SET'"  'SET'
check "Hub WA_SERVICE → GCP#2"       "ssh gcp-worker 'grep ^WA_SERVICE= /opt/cybercontrol-hub/backend/.env'"  '34.100.147.20'
check "Hub PM2 process online"       "ssh gcp-worker 'pm2 jlist 2>/dev/null | grep -o cybercontrol-hub.*online | head -1'"  'cybercontrol-hub'
check "Hub systemd auto-start"       "ssh gcp-worker 'sudo systemctl is-enabled pm2-bharattvv542 2>&1'"  'enabled'

echo
echo "--- WORKER (GCP#2) ---"
WA_HEALTH=$(GCP2 "curl -s http://localhost:3100/health")
RESOLVER_HEALTH=$(GCP2 "curl -s http://localhost:3200/health")
[[ "$WA_HEALTH" == *'"status":"ok"'* ]] && ok "Worker /health" || fail "Worker /health — $WA_HEALTH"
[[ "$RESOLVER_HEALTH" == *'"status":"ok"'* ]] && ok "Resolver process /health" || fail "Resolver process /health — $RESOLVER_HEALTH"

# Resolver actually logged in?
if [[ "$RESOLVER_HEALTH" == *'"connected":true'* ]]; then
  ok "Resolver logged into WhatsApp"
else
  warn "Resolver NOT logged into WhatsApp — saved names won't appear. Scan QR at: http://34.100.147.20:3200/qr-page?secret=wa-service-secret-2024"
fi

# Single PM2 daemon
PM2_USERS=$(GCP2 "ps aux | grep 'PM2.*God' | grep -v grep | awk '{print \$1}' | sort -u")
if [[ "$PM2_USERS" == "kishy" ]]; then
  ok "Single PM2 daemon (kishy)"
else
  fail "PM2 daemons: $PM2_USERS — only kishy should run. Run 'pm2 kill' as the wrong user."
fi

# Sessions ownership
SESSIONS_OWNER=$(GCP2 "stat -c %U /opt/whatsapp/service/sessions")
[[ "$SESSIONS_OWNER" == "kishy" ]] && ok "service/sessions/ owned by kishy" \
  || fail "service/sessions/ owned by '$SESSIONS_OWNER' — run: sudo chown -R kishy:kishy /opt/whatsapp/service/sessions"
RESOLVER_OWNER=$(GCP2 "stat -c %U /opt/whatsapp/resolver/session 2>/dev/null")
[[ "$RESOLVER_OWNER" == "kishy" ]] && ok "resolver/session/ owned by kishy" \
  || warn "resolver/session/ owned by '$RESOLVER_OWNER' — run: sudo chown -R kishy:kishy /opt/whatsapp/resolver/session"

# Port conflicts
PORT_3100=$(GCP2 "sudo ss -tulpn 2>/dev/null | grep ':3100 ' | wc -l" | tr -d '[:space:]')
PORT_3200=$(GCP2 "sudo ss -tulpn 2>/dev/null | grep ':3200 ' | wc -l" | tr -d '[:space:]')
[[ "$PORT_3100" == "1" ]] && ok "Port 3100 — single listener" || fail "Port 3100 listeners: $PORT_3100 (expect 1)"
[[ "$PORT_3200" == "1" ]] && ok "Port 3200 — single listener" || fail "Port 3200 listeners: $PORT_3200 (expect 1)"

# Orphan Chrome
ORPHAN_CHROMES=$(GCP2 "ps aux | grep -E 'chrome.*resolver/session' | grep -v grep | awk '{print \$1}' | sort -u | grep -v kishy | wc -l" | tr -d '[:space:]')
[[ "$ORPHAN_CHROMES" == "0" ]] && ok "No orphan Chrome processes" \
  || fail "$ORPHAN_CHROMES orphan Chrome process(es) (non-kishy) — run: bash recover-resolver.sh"

# Stale SingletonLock
STALE_LOCK=$(GCP2 "[ -f /opt/whatsapp/resolver/session/session/SingletonLock ] && [ ! -d /proc/\$(readlink /opt/whatsapp/resolver/session/session/SingletonLock 2>/dev/null | cut -d- -f1 2>/dev/null) ] && echo STALE || echo OK")
[[ "$STALE_LOCK" == *"OK"* ]] && ok "No stale SingletonLock" || warn "SingletonLock may be stale — run recover-resolver.sh if resolver fails"

# Recent ReferenceError in worker
REF_ERRS=$(GCP2 "sudo -u kishy pm2 logs whatsapp-service --nostream --lines 200 --err 2>/dev/null | grep -c ReferenceError" | tr -d '[:space:]')
[[ "${REF_ERRS:-0}" -lt 1 ]] && ok "No recent ReferenceError in worker" \
  || warn "$REF_ERRS ReferenceError(s) in worker logs — code/runtime mismatch, redeploy"

echo
echo "--- DATABASE ---"
DUP_PAIRINGS=$(ssh gcp-worker "sudo -u postgres psql -d cybercontrol -t -c \"SELECT phone_number, count(*) FROM whatsapp_sessions WHERE status='connected' GROUP BY phone_number HAVING count(*)>1\" 2>/dev/null" | tr -d '[:space:]')
if [[ -z "$DUP_PAIRINGS" ]]; then
  ok "No duplicate WhatsApp number across workspaces"
else
  warn "Duplicate WhatsApp pairings found: $DUP_PAIRINGS — disconnect one to stop duplicate file uploads"
fi

echo
echo "--- FRONTEND ---"
FE=$(curl -s -o /dev/null -w '%{http_code}' https://app.cybercontrol.fun/)
[[ "$FE" == "200" ]] && ok "https://app.cybercontrol.fun/ → 200" || fail "Frontend returned $FE"

API=$(curl -s https://api.cybercontrol.fun/api/health)
[[ "$API" == *'"status":"ok"'* ]] && ok "https://api.cybercontrol.fun/api/health" || fail "API health — $API"

echo
if [[ $issues -eq 0 && $warnings -eq 0 ]]; then
  echo "${GREEN}All systems healthy ✓${RESET}"
  exit 0
elif [[ $issues -eq 0 ]]; then
  echo "${YELLOW}$warnings warning(s). System functional but check OPERATIONS.md.${RESET}"
  exit 0
else
  echo "${RED}$issues issue(s), $warnings warning(s). See OPERATIONS.md for fixes.${RESET}"
  exit 1
fi
