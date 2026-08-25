#!/bin/bash
# Generic private-connectivity check for ANY CyberControl host.
# Validates: resolv stub → MagicDNS → Tailscale path → declared dependencies.
# Discovers deps from runtime (env files + running containers), not a hard-coded role list.
#
# Env:
#   TS_TAILNET_SUFFIX=taild72c71.ts.net
#   EXTRA_TCP_CHECKS=host:port,host:port   optional extra probes
#   SKIP_CONTAINER_PROBES=0
set -euo pipefail

TS_TAILNET_SUFFIX="${TS_TAILNET_SUFFIX:-taild72c71.ts.net}"
DB_FQDN="cybercontrol-db.${TS_TAILNET_SUFFIX}"
HOST="$(hostname -s 2>/dev/null || hostname)"

fail=0
ok()   { echo "OK  $*"; }
bad()  { echo "FAIL $*"; fail=1; }
info() { echo "INFO $*"; }

info "host=$HOST"

# Re-assert stub before probing (Tailscale may rewrite resolv.conf asynchronously).
if [ -x /usr/local/sbin/cc-ensure-resolved-stub.sh ]; then
  /usr/local/sbin/cc-ensure-resolved-stub.sh >/dev/null 2>&1 || true
fi

# ── 1) Resolver contract ─────────────────────────────────────────────────────
if [ -L /etc/resolv.conf ] && readlink -f /etc/resolv.conf 2>/dev/null | grep -q 'stub-resolv.conf'; then
  ok "resolv.conf -> systemd-resolved stub"
else
  bad "resolv.conf is not systemd-resolved stub ($(ls -l /etc/resolv.conf 2>/dev/null || echo missing))"
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-enabled cc-ensure-resolved-stub.service >/dev/null 2>&1; then
  ok "cc-ensure-resolved-stub.service enabled"
else
  bad "cc-ensure-resolved-stub.service not enabled"
fi

# ── 2) Discover whether this host needs private DB ───────────────────────────
needs_db=0
if [ -d /opt/cybercontrol-docker ]; then
  if grep -lR '^DATABASE_URL=' /opt/cybercontrol-docker/*.env 2>/dev/null | grep -q .; then
    needs_db=1
  fi
fi
# Also if any running container has DATABASE_URL
if command -v docker >/dev/null 2>&1; then
  for cid in $(sudo docker ps -q 2>/dev/null || true); do
    if sudo docker exec "$cid" sh -c 'test -n "$DATABASE_URL"' 2>/dev/null; then
      needs_db=1
      break
    fi
  done
fi

tcp_check() {
  local h=$1 p=$2
  if timeout 3 bash -c "echo >/dev/tcp/${h}/${p}" 2>/dev/null; then
    ok "tcp ${h}:${p}"
  else
    bad "tcp ${h}:${p}"
  fi
}

# ── 3) Host MagicDNS + TCP for discovered deps ───────────────────────────────
if [ "$needs_db" = "1" ]; then
  if getent hosts "$DB_FQDN" >/dev/null 2>&1; then
    ok "host MagicDNS $DB_FQDN -> $(getent hosts "$DB_FQDN" | awk '{print $1; exit}')"
  else
    bad "host cannot resolve $DB_FQDN"
  fi
  tcp_check "$DB_FQDN" 5432
else
  info "no DATABASE_URL on this host — skip DB probes"
fi

# Optional extras: EXTRA_TCP_CHECKS=cybercontrol-redis.taild72c71.ts.net:6379,...
if [ -n "${EXTRA_TCP_CHECKS:-}" ]; then
  IFS=',' read -r -a extras <<< "$EXTRA_TCP_CHECKS"
  for spec in "${extras[@]}"; do
    [ -z "$spec" ] && continue
    h="${spec%%:*}"; p="${spec##*:}"
    if getent hosts "$h" >/dev/null 2>&1; then
      ok "host resolves $h"
    else
      bad "host cannot resolve $h"
    fi
    tcp_check "$h" "$p"
  done
fi

# ── 4) From each running container that declares private deps ────────────────
if [ "${SKIP_CONTAINER_PROBES:-0}" != "1" ] && command -v docker >/dev/null 2>&1; then
  for cid in $(sudo docker ps -q 2>/dev/null || true); do
    name=$(sudo docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
    has_db=0
    if sudo docker exec "$cid" sh -c 'test -n "$DATABASE_URL"' 2>/dev/null; then
      has_db=1
    fi
    [ "$has_db" = "0" ] && continue

    # resolv inside container should reach MagicDNS (host networking uses host stub)
    if sudo docker exec "$cid" getent hosts "$DB_FQDN" >/dev/null 2>&1; then
      ok "container[$name] resolves $DB_FQDN"
    else
      bad "container[$name] cannot resolve $DB_FQDN"
    fi

    if sudo docker exec "$cid" node -e "
const net=require('net');
const h=process.argv[1];
new Promise((res,rej)=>{const s=net.connect(5432,h,()=>{s.end();res();});
  s.setTimeout(4000,()=>rej(new Error('timeout'))); s.on('error',rej);
}).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
" "$DB_FQDN" >/dev/null 2>&1; then
      ok "container[$name] tcp $DB_FQDN:5432"
    else
      # Fallback without node
      if sudo docker exec "$cid" sh -c "timeout 3 bash -c 'echo >/dev/tcp/$DB_FQDN/5432'" 2>/dev/null; then
        ok "container[$name] tcp $DB_FQDN:5432 (bash)"
      else
        bad "container[$name] tcp $DB_FQDN:5432"
      fi
    fi

    # Logical identity must not be a MagicDNS FQDN
    inst=$(sudo docker exec "$cid" sh -c 'echo ${WA_INSTANCE_NAME:-${INSTANCE_NAME:-${SERVICE_INSTANCE_NAME:-}}}' 2>/dev/null || true)
    if [ -n "$inst" ]; then
      if echo "$inst" | grep -qE '\.ts\.net$'; then
        bad "container[$name] instance identity is FQDN ($inst) — use short logical id"
      else
        ok "container[$name] logical identity=$inst"
      fi
    fi
  done
fi

# ── 5) Best-effort local health endpoints (any service that publishes one) ───
for url in \
  http://127.0.0.1:3000/api/health \
  http://127.0.0.1:3100/health \
  http://127.0.0.1:3300/health \
  http://127.0.0.1:3200/health
 do
  if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    ok "local health $url"
  fi
done

# ── 6) Registry hygiene hint (optional; needs psql/node+pg — skipped if unavailable)
info "tip: ensure service registries do not persist *.ts.net as instance ids"

if [ "$fail" -ne 0 ]; then
  echo "RESULT: FAIL on $HOST"
  echo "Expected path: runtime/container -> resolv stub -> systemd-resolved -> Tailscale MagicDNS -> private endpoint"
  exit 1
fi
echo "RESULT: PASS on $HOST"
exit 0
