#!/bin/bash
# Keep Tailscale magicsock / AWS UDP NAT mappings warm so owner-panel :3010
# does not fail on the first request after idle (DERP rediscovery >5s).
set -u
CONTAINER="${CONTAINER:-cybercontrol-docker-tailscale-app-1}"
INTERVAL="${INTERVAL:-20}"

while true; do
  if docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
    hosts=$(docker exec "$CONTAINER" tailscale status 2>/dev/null | awk 'NR>1 && $0 !~ /offline/ {print $2}')
    for h in $hosts; do
      [ -n "$h" ] || continue
      docker exec "$CONTAINER" tailscale ping -c 1 --timeout 3s "$h" >/dev/null 2>&1 || true
    done
  fi
  sleep "$INTERVAL"
done
