#!/bin/bash
# Ensure private MagicDNS works via systemd-resolved for ANY CyberControl host.
# Preferred: resolv.conf → stub + Tailscale --accept-dns (DBus into resolved).
# Fallback: if Tailscale keeps overwriting resolv.conf (foreign mode), disable
# Tailscale DNS management and configure resolved drop-in for ~ts.net.
# See: https://github.com/yashaswikaahuja/wa-drive/issues/299
set -euo pipefail

TARGET=/run/systemd/resolve/stub-resolv.conf
DROPIN_DIR=/etc/systemd/resolved.conf.d
DROPIN="$DROPIN_DIR/99-cybercontrol-magicdns.conf"
TS_TAILNET_SUFFIX="${TS_TAILNET_SUFFIX:-taild72c71.ts.net}"

restore_stub() {
  systemctl enable --now systemd-resolved 2>/dev/null || true
  if [ ! -e "$TARGET" ]; then
    echo "WARN: stub-resolv.conf missing"
    return 1
  fi
  if [ ! -L /etc/resolv.conf ] || [ "$(readlink -f /etc/resolv.conf 2>/dev/null || true)" != "$(readlink -f "$TARGET" 2>/dev/null || true)" ]; then
    cp -a /etc/resolv.conf "/etc/resolv.conf.bak.$(date +%s)" 2>/dev/null || true
    ln -sfn "$TARGET" /etc/resolv.conf
    systemctl restart systemd-resolved 2>/dev/null || true
  fi
  return 0
}

install_resolved_magicdns_dropin() {
  mkdir -p "$DROPIN_DIR"
  cat > "$DROPIN" <<EOF
[Resolve]
# MagicDNS resolver (Tailscale) — used when --accept-dns=false
DNS=100.100.100.100
Domains=~ts.net ~${TS_TAILNET_SUFFIX}
EOF
  systemctl restart systemd-resolved 2>/dev/null || true
}

is_stub() {
  [ -L /etc/resolv.conf ] && readlink -f /etc/resolv.conf 2>/dev/null | grep -q 'stub-resolv.conf'
}

restore_stub || true

if command -v tailscale >/dev/null 2>&1; then
  # First try native Tailscale → resolved integration
  tailscale set --accept-dns=true 2>/dev/null || true
  sleep 1
  restore_stub || true
  sleep 1

  if ! is_stub; then
    # Tailscale won the resolv.conf fight — fall back to resolved drop-in
    echo "INFO: Tailscale overwrote resolv.conf; using resolved MagicDNS drop-in"
    tailscale set --accept-dns=false 2>/dev/null || true
    install_resolved_magicdns_dropin
    restore_stub || true
  fi
fi

if is_stub; then
  echo "OK resolv stub in place"
else
  echo "WARN resolv.conf still not stub: $(ls -l /etc/resolv.conf 2>/dev/null || true)"
  exit 1
fi
