#!/bin/bash
set -e

echo "[Entrypoint] Starting CyberControl Backend..."
# Redact password when logging
echo "[Entrypoint] DATABASE_URL: $(echo "${DATABASE_URL:-(not set)}" | sed 's#://[^:]*:[^@]*@#://***:***@#')"

# Soft wait for Postgres using only DATABASE_URL (works for local `postgres`,
# prod `cybercontrol-db`, CI throwaway, etc.). No dependency on the `pg` package
# layout from pnpm deploy.
wait_for_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "[Entrypoint] DATABASE_URL unset — skipping DB wait"
    return 0
  fi
  if [ "${SKIP_DB_WAIT:-}" = "1" ]; then
    echo "[Entrypoint] SKIP_DB_WAIT=1 — not waiting for database"
    return 0
  fi

  local host port
  host=$(node --input-type=commonjs -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname)")
  port=$(node --input-type=commonjs -e "const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port||'5432')")
  echo "[Entrypoint] Waiting for database at ${host}:${port}..."

  local max_retries=30 retry_count=0 retry_delay=2
  while [ $retry_count -lt $max_retries ]; do
    if (echo >"/dev/tcp/${host}/${port}") >/dev/null 2>&1; then
      echo "[Entrypoint] ✓ Database port is open"
      return 0
    fi
    # Fallback when /dev/tcp is unavailable
    if command -v nc >/dev/null 2>&1 && nc -z "$host" "$port" >/dev/null 2>&1; then
      echo "[Entrypoint] ✓ Database port is open (nc)"
      return 0
    fi
    retry_count=$((retry_count + 1))
    echo "[Entrypoint] Database not ready, retrying in ${retry_delay}s... ($retry_count/$max_retries)"
    sleep $retry_delay
  done
  echo "[Entrypoint] ⚠ Database still unreachable after ${max_retries} attempts — starting anyway (app will retry)"
  return 0
}

wait_for_db

# Run migrations (if migration script exists)
if [ -f "migrations/run.js" ]; then
  echo "[Entrypoint] Running database migrations..."
  node migrations/run.js || echo "[Entrypoint] Migrations skipped or completed"
fi

# Start the application (monorepo build emits dist/index.js)
echo "[Entrypoint] Starting application..."
if [ -f dist/index.js ]; then
  exec node dist/index.js
elif [ -f dist/server.js ]; then
  exec node dist/server.js
elif [ -f index.js ]; then
  exec node index.js
else
  echo "[Entrypoint] ✗ No backend entry file found (dist/index.js | dist/server.js | index.js)"
  ls -la dist 2>/dev/null || true
  exit 1
fi
