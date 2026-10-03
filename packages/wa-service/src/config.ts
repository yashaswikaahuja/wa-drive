import pg from 'pg';
import type { Pool } from 'pg';

export interface WaServiceConfig {
  PORT: number;
  PARENT_URL: string;
  SERVICE_SECRET: string;
  WA_SECRET: string;
  AUTH_DIR: string;
  RESOLVER_URL: string;
  WA_AUTH_BACKEND: string;
  WA_INSTANCE_NAME: string;
  HEARTBEAT_MS: number;
  WA_ACCEPT_THRESHOLD_PCT: number;
  pgPool: Pool | null;
}

/**
 * Load runtime config from environment (HTTP/env contracts stay identical to the old monolith).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WaServiceConfig {
  const SERVICE_SECRET = env.SERVICE_SECRET || 'wa-service-secret-2024';
  const WA_AUTH_BACKEND = env.WA_AUTH_BACKEND || 'files';
  const DATABASE_URL = env.DATABASE_URL || '';

  const pgPool =
    WA_AUTH_BACKEND === 'postgres' && DATABASE_URL
      ? new pg.Pool({ connectionString: DATABASE_URL })
      : null;

  return {
    PORT: Number(env.WA_PORT || 3100),
    // Require PARENT_URL / API_ORIGIN in env — no baked-in prod host.
    PARENT_URL: env.PARENT_URL || env.API_ORIGIN || '',
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
