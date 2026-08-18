#!/bin/bash
set -euo pipefail
cd /opt/cybercontrol-docker
export IMAGE_TAG="${IMAGE_TAG:-latest}"
echo "Pulling extension-service:${IMAGE_TAG}"
docker compose --env-file extension-service.env -f docker-compose.app.yml pull extension-service
echo "Recreating..."
docker compose --env-file extension-service.env -f docker-compose.app.yml stop extension-service || true
docker compose --env-file extension-service.env -f docker-compose.app.yml rm -f extension-service || true
docker compose --env-file extension-service.env -f docker-compose.app.yml create extension-service
docker compose --env-file extension-service.env -f docker-compose.app.yml start extension-service
sleep 4
echo "Health:"
curl -sf http://127.0.0.1:3300/health || curl -sf http://127.0.0.1:3300/api/extension/health || true
echo
docker ps --filter name=extension-service --format '{{.Image}} {{.Status}}'
echo DONE
