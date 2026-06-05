#!/bin/bash
# Blue-green rollback (backend): instantly switch nginx back to the OTHER color, which is still
# running from before the last deploy. Near-zero downtime.
set -e
DIR=/opt/cybercontrol-docker
cd "$DIR"
FILE=docker-compose.bluegreen.yml

ACTIVE=$(cat nginx/active_color 2>/dev/null || echo blue)
if [ "$ACTIVE" = blue ]; then OTHER=green; OPORT=3002; else OTHER=blue; OPORT=3001; fi
echo "[rollback] active=$ACTIVE -> reverting to $OTHER (:$OPORT)"

docker compose -f "$FILE" start "backend-$OTHER" || true
ok=0
for i in $(seq 1 6); do
  if curl -fsS "http://localhost:$OPORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [ "$ok" != 1 ]; then
  echo "::error:: rollback target $OTHER not healthy on :$OPORT — leaving $ACTIVE live"
  exit 1
fi

echo "upstream backend_active { server 127.0.0.1:$OPORT; }" > nginx/active_upstream.conf
docker exec cybercontrol-nginx nginx -t
docker exec cybercontrol-nginx nginx -s reload
echo "$OTHER" > nginx/active_color
echo "[rollback] LIVE traffic reverted to $OTHER (:$OPORT)."
