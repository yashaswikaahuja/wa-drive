#!/bin/bash
# Apply CyberControl private DNS / Tailscale contract to THIS host (run as root).
# Role-agnostic: backend, extension, WA workers, redis clients, future services.
# Idempotent.
#
# Env (optional):
#   TS_TAILNET_SUFFIX   default taild72c71.ts.net
#   LOGICAL_INSTANCE_ID override short logical identity (default: hostname -s)
#   SKIP_ENV_NORMALIZE  1 = do not rewrite *.env DATABASE_URL / instance names
#
# Contract:
# --- /etc/resolv.conf is systemd-resolved stub
# --- Tailscale publishes MagicDNS into resolved (--accept-dns)
# --- Private service hostnames use MagicDNS FQDNs (not raw 100.x, not GCP VPC IPs)
# --- Logical instance identity stays short (never *.ts.net)
#
# See: https://github.com/yashaswikaahuja/wa-drive/issues/299
set -euo pipefail

TS_TAILNET_SUFFIX="${TS_TAILNET_SUFFIX:-taild72c71.ts.net}"
DB_FQDN="cybercontrol-db.${TS_TAILNET_SUFFIX}"
HOSTNAME_NOW="$(hostname -s 2>/dev/null || hostname)"
LOGICAL_INSTANCE_ID="${LOGICAL_INSTANCE_ID:-$HOSTNAME_NOW}"
# Never persist FQDN as identity
LOGICAL_INSTANCE_ID="${LOGICAL_INSTANCE_ID%%.*}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-private-dns-contract on $HOSTNAME_NOW (id=$LOGICAL_INSTANCE_ID) ==="

# --- 0) CD deploy SSH access (required by connectivity CI + Deploy) ---
if [ -f "$SCRIPT_DIR/ensure-deploy-ssh-access.sh" ]; then
  bash "$SCRIPT_DIR/ensure-deploy-ssh-access.sh" || true
elif [ -x /opt/cybercontrol-docker/scripts/ensure-deploy-ssh-access.sh ]; then
  bash /opt/cybercontrol-docker/scripts/ensure-deploy-ssh-access.sh || true
fi

# --- 1) Boot guard: systemd-resolved stub ---
if [ -f "$SCRIPT_DIR/cc-ensure-resolved-stub.sh" ]; then
  install -m 0755 "$SCRIPT_DIR/cc-ensure-resolved-stub.sh" /usr/local/sbin/cc-ensure-resolved-stub.sh
fi
if [ -f "$SCRIPT_DIR/cc-ensure-resolved-stub.service" ]; then
  install -m 0644 "$SCRIPT_DIR/cc-ensure-resolved-stub.service" /etc/systemd/system/cc-ensure-resolved-stub.service
fi
if [ -f "$SCRIPT_DIR/cc-ensure-resolved-stub.timer" ]; then
  install -m 0644 "$SCRIPT_DIR/cc-ensure-resolved-stub.timer" /etc/systemd/system/cc-ensure-resolved-stub.timer
fi
if [ -x /usr/local/sbin/cc-ensure-resolved-stub.sh ]; then
  if command -v systemctl >/dev/null 2>&1 && [ "$(ps -p 1 -o comm= 2>/dev/null)" = "systemd" ]; then
    systemctl daemon-reload
    systemctl enable --now cc-ensure-resolved-stub.service
    systemctl enable --now cc-ensure-resolved-stub.timer 2>/dev/null || true
  fi
  /usr/local/sbin/cc-ensure-resolved-stub.sh
  # Tailscale may rewrite resolv.conf shortly after set --accept-dns; re-assert.
  sleep 2
  /usr/local/sbin/cc-ensure-resolved-stub.sh
fi

# --- 2) Tailscale: MagicDNS via resolved; short hostname as identity ---
if command -v tailscale >/dev/null 2>&1; then
  tailscale set --accept-dns=true 2>/dev/null || true
  tailscale set --hostname="$LOGICAL_INSTANCE_ID" 2>/dev/null || true
fi

# --- 3) Normalize private endpoints in any service env files ---
if [ "${SKIP_ENV_NORMALIZE:-0}" != "1" ] && [ -d /opt/cybercontrol-docker ]; then
  for envf in /opt/cybercontrol-docker/*.env; do
    [ -f "$envf" ] || continue
    [[ "$envf" == *.bak* ]] && continue

    if grep -q '^DATABASE_URL=' "$envf"; then
      python3 - "$envf" "$DB_FQDN" <<'PY'
import re, sys
path, fqdn = sys.argv[1], sys.argv[2]
text = open(path, encoding='utf-8', errors='replace').read()

def fix_line(m):
    url = m.group(0)
    # bare cybercontrol-db → MagicDNS FQDN
    url = re.sub(r'@(cybercontrol-db)([:/])', rf'@{fqdn}\2', url)
    return url

text2 = re.sub(r'^DATABASE_URL=.*$', fix_line, text, flags=re.M)
if text2 != text:
    open(path, 'w', encoding='utf-8').write(text2)
host = re.search(r'DATABASE_URL=.*@([^/:]+)', text2)
print(f'  {path}: DATABASE_URL host={host.group(1) if host else "?"}')
PY
    fi

    # Any *INSTANCE_NAME= that looks like a worker identity → short logical id
    # (WA_INSTANCE_NAME, INSTANCE_NAME, SERVICE_INSTANCE_NAME, …)
    if grep -qE '^[A-Z0-9_]*INSTANCE_NAME=' "$envf"; then
      sed -i -E "s/^([A-Z0-9_]*INSTANCE_NAME)=.*/\\1=${LOGICAL_INSTANCE_ID}/" "$envf"
      echo "  $envf: *INSTANCE_NAME -> $LOGICAL_INSTANCE_ID"
    fi
  done
fi

# --- 4) Verify host can resolve private DB MagicDNS (infra check) ---
echo "=== verify host MagicDNS ==="
if getent hosts "$DB_FQDN" >/dev/null 2>&1; then
  echo "OK host resolves $DB_FQDN -> $(getent hosts "$DB_FQDN" | awk '{print $1; exit}')"
else
  echo "WARN host cannot resolve $DB_FQDN (ok if this host has no Tailscale / no private deps yet)"
fi

echo "=== contract applied on $HOSTNAME_NOW ==="
