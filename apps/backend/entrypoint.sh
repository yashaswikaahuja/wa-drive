#!/bin/bash
set -e

echo "[Entrypoint] Starting CyberControl Backend..."
echo "[Entrypoint] DATABASE_URL: ${DATABASE_URL:-(not set)}"

# Wait for database with retries
echo "[Entrypoint] Waiting for database to be ready..."
max_retries=30
retry_count=0
retry_delay=2

while [ $retry_count -lt $max_retries ]; do
  if node -e "
    const pg = require('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    pool.connect().then(client => {
      client.release();
      process.exit(0);
    }).catch(err => {
      console.error('[DB Check]', err.message);
      process.exit(1);
    });
  " 2>/dev/null; then
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

# Run migrations (if migration script exists)
if [ -f "migrations/run.js" ]; then
  echo "[Entrypoint] Running database migrations..."
  node migrations/run.js || echo "[Entrypoint] Migrations skipped or completed"
fi

# Start the application
echo "[Entrypoint] Starting application..."
exec node dist/index.js
