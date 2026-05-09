#!/bin/bash
# Load .env and start server
set -a
source /opt/cybercontrol-hub/.env
set +a
exec node /opt/cybercontrol-hub/backend/dist/server.js
