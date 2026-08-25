#!/bin/bash
set -e

echo "[Entrypoint] Starting CyberControl Backend..."
echo "[Entrypoint] DATABASE_URL: ${DATABASE_URL:-(not set)}"

# Wait for database with retries (skip in CI smoke with SKIP_DB_WAIT=1)
if [ "${SKIP_DB_WAIT:-}" = "1" ]; then
  echo "[Entrypoint] SKIP_DB_WAIT=1 — not waiting for database"
else
  echo "[Entrypoint] Waiting for database to be ready..."
  max_retries=30
  retry_count=0
  retry_delay=2

  while [ $retry_count -lt $max_retries ]; do
    # pnpm deploy may nest pg; createRequire from CWD package.json finds it.
    if node --input-type=commonjs -e "
      const { createRequire } = require('module');
      const { pathToFileURL } = require('url');
      const req = createRequire(pathToFileURL(process.cwd() + '/package.json').href);
      const pg = req('pg');
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      pool.connect().then((c) => { c.release(); return pool.end(); }).then(() => process.exit(0)).catch((e) => { console.error('[DB Check]', e.message); process.exit(1); });
    "; then
      echo "[Entrypoint] ✓ Database is ready!"
      break
    fi

    retry_count=$((retry_count + 1))
    if [ $retry_count -eq $max_retries ]; then
      echo "[Entrypoint] ✗ Database connection failed after $max_retries attempts"
      exit 1
    fi

    echo "[Entrypoint] Database not ready, retrying in ${retry_delay}s... ($retry_count/$max_retries)"
    sleep $retry_delay
  done
fi

# Run migrations (if migration script exists)
if [ -f "migrations/run.js" ]; then
  echo "[Entrypoint] Running database migrations..."
  node migrations/run.js || echo "[Entrypoint] Migrations skipped or completed"
fi

# Start the application
echo "[Entrypoint] Starting application..."
exec node dist/index.js
