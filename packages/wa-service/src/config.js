import pg from 'pg';

/**
 * Load runtime config from environment (HTTP/env contracts stay identical to the old monolith).
 */
export function loadConfig(env = process.env) {
  const SERVICE_SECRET = env.SERVICE_SECRET || 'wa-service-secret-2024';
  const WA_AUTH_BACKEND = env.WA_AUTH_BACKEND || 'files';
  const DATABASE_URL = env.DATABASE_URL || '';

  const pgPool =
    WA_AUTH_BACKEND === 'postgres' && DATABASE_URL
      ? new pg.Pool({ connectionString: DATABASE_URL })
      : null;

  return {
    PORT: Number(env.WA_PORT || 3100),
    PARENT_URL: env.PARENT_URL || 'https://api.cybercontrol.fun',
    SERVICE_SECRET,
    WA_SECRET: env.WA_SECRET || SERVICE_SECRET,
    AUTH_DIR: env.AUTH_DIR || './sessions',
    RESOLVER_URL: env.RESOLVER_URL || 'http://localhost:3200',
    WA_AUTH_BACKEND,
    WA_INSTANCE_NAME: env.WA_INSTANCE_NAME || '',
    HEARTBEAT_MS: Number(env.WA_HEARTBEAT_MS || 20_000),
    WA_ACCEPT_THRESHOLD_PCT: Number(env.WA_ACCEPT_THRESHOLD_PCT || 80),
    pgPool,
  };
}
