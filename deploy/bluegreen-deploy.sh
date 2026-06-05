#!/bin/bash
# Blue-green deploy (backend) on cybercontrol-app.
# Updates the IDLE color to the latest image, health-checks it on its own port, then atomically
# switches nginx to it. The previously-active color keeps running for instant rollback.
set -e
DIR=/opt/cybercontrol-docker
cd "$DIR"
FILE=docker-compose.bluegreen.yml

ACTIVE=$(cat nginx/active_color 2>/dev/null || echo blue)
if [ "$ACTIVE" = blue ]; then IDLE=green; IPORT=3002; else IDLE=blue; IPORT=3001; fi
echo "[bluegreen] active=$ACTIVE -> deploying idle=$IDLE (port $IPORT)"

docker compose -f "$FILE" pull "backend-$IDLE"
docker compose -f "$FILE" stop "backend-$IDLE" || true
docker compose -f "$FILE" rm -f "backend-$IDLE" || true
docker compose -f "$FILE" create "backend-$IDLE"
docker compose -f "$FILE" start "backend-$IDLE"

echo "[bluegreen] health-checking idle $IDLE on :$IPORT ..."
ok=0
for i in $(seq 1 18); do
  if curl -fsS "http://localhost:$IPORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
if [ "$ok" != 1 ]; then
  echo "::error:: idle $IDLE failed health check on :$IPORT — NOT switching; live ($ACTIVE) untouched"
  docker compose -f "$FILE" stop "backend-$IDLE" || true
  exit 1
fi

# Atomic switch: repoint nginx upstream at the idle color, validate, reload.
echo "upstream backend_active { server 127.0.0.1:$IPORT; }" > nginx/active_upstream.conf
docker exec cybercontrol-nginx nginx -t
docker exec cybercontrol-nginx nginx -s reload
echo "$IDLE" > nginx/active_color
echo "[bluegreen] LIVE traffic now on $IDLE (:$IPORT). Old color $ACTIVE still running — run bluegreen-rollback.sh to revert."
