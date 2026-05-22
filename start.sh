#!/bin/bash
# CyberControl — Start All Services
# Run from repo root: bash start.sh

set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "🚀 Starting CyberControl from $REPO_DIR"

# 1. PostgreSQL
echo "📦 Starting PostgreSQL..."
sudo service postgresql start 2>/dev/null || true
sleep 1

# 2. Backend
echo "⚙️  Starting Backend (port 3000)..."
cd "$REPO_DIR/backend"
npx tsc --skipLibCheck 2>/dev/null || true
node dist/index.js > /tmp/backend.log 2>&1 &
sleep 3

# 3. WhatsApp Service
echo "💬 Starting WhatsApp Service (port 3100)..."
cd "$REPO_DIR/whatsapp-service"
node index.js > /tmp/whatsapp.log 2>&1 &
sleep 2

# 4. Frontend
echo "🌐 Starting Frontend (port 5173)..."
cd "$REPO_DIR/frontend"
npx vite --host 0.0.0.0 > /tmp/frontend.log 2>&1 &
sleep 3

# 5. Verify
echo ""
echo "=== Status ==="
echo -n "Backend:  " && curl -s http://localhost:3000/api/health || echo "❌ DOWN"
echo ""
echo -n "WhatsApp: " && curl -s http://localhost:3100/health || echo "❌ DOWN"
echo ""
echo -n "Frontend: " && (curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q 200 && echo "✅ OK") || echo "❌ DOWN"
echo ""
echo "=== URLs ==="
if [ -n "$CODESPACE_NAME" ]; then
  echo "Frontend: https://${CODESPACE_NAME}-5173.app.github.dev"
  echo "Backend:  https://${CODESPACE_NAME}-3000.app.github.dev"
else
  echo "Frontend: http://localhost:5173"
  echo "Backend:  http://localhost:3000"
fi
echo ""
echo "Login: test@test.com / test123"
echo "🎉 All services running!"
