#!/bin/bash
VERCEL_TOKEN="vca_2ScIz1kfYj8iNQDdVUBwELmfrshpnjisjN9e0A4z3rWlMrflPl1dF1oA"
PROJECT_ID="prj_9hjHOAeyPW5vYkrWEFGxnTCugWBM"
API_URL_ID="VITE_API_URL"
SOCKET_URL_ID="VITE_SOCKET_URL"
HELPERS="/opt/cybercontrol-hub/frontend/src/utils/helpers.ts"

echo "[Tunnel] Waiting for Cloudflare tunnel URL..."
for i in $(seq 1 30); do
  URL=$(pm2 logs cloudflare-tunnel --lines 50 --nostream 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
  if [ -n "$URL" ]; then break; fi
  sleep 2
done

if [ -z "$URL" ]; then echo "[Tunnel] ERROR: Could not detect tunnel URL"; exit 1; fi
echo "[Tunnel] Detected URL: $URL"

# Update helpers.ts fallback URL
sed -i "s|https://[a-z0-9-]*\.trycloudflare\.com/api|/api|g" "$HELPERS"
sed -i "s|https://[a-z0-9-]*\.trycloudflare\.com'|'|g" "$HELPERS"

# Commit and push
cd /opt/cybercontrol-hub && git add frontend/src/utils/helpers.ts && git commit -m "chore: update tunnel URL to $URL" && git push origin master 2>/dev/null || true

echo "[Tunnel] helpers.ts updated and pushed"
