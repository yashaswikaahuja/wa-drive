import pg from 'pg';
import { DATABASE_URL } from './config.js';

const { Pool } = pg;

// Pool size is per-instance. With multiple backends behind the LB, total connections =
// PG_POOL_MAX × (backends) + ext-service pools + WhatsApp shards — keep the sum under Postgres
// max_connections (default 100). Default 10 here leaves headroom; raise via env on a single big instance.
const PG_POOL_MAX = Number(process.env.PG_POOL_MAX ?? 10);

export let pool: pg.Pool;

// Retry connection logic with exponential backoff
let connectionAttempts = 0;
const MAX_RETRIES = 10;

/**
 * Replace the default Postgres pool during composition or integration tests.
 * Existing imports retain the live binding, so callers always use the injected pool.
 */
export function setPool(nextPool: pg.Pool) {
  if (!nextPool || typeof nextPool.query !== 'function') {
    throw new TypeError('backend-core requires a pg-compatible pool');
  }
  pool = nextPool;
}

/** Create the configured pool from the application composition root. */
export function createPool() {
  return new Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: PG_POOL_MAX,
  });
}

/** Establish the configured database connection when the application starts. */
export async function initializeDatabase() {
  while (connectionAttempts < MAX_RETRIES) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('[DB] Connected to database successfully');
      return true;
    } catch (err: any) {
      connectionAttempts++;
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);
      console.log(`[DB] Connection attempt ${connectionAttempts}/${MAX_RETRIES} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed to connect to database after ${MAX_RETRIES} attempts`);
}

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export async function auditLog(workspaceId: string, userId: string, eventType: string, entityType: string, entityId: string, metadata?: any) {
  try {
    await pool.query(
      'INSERT INTO audit_events (workspace_id, user_id, event_type, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)',
      [workspaceId, userId, eventType, entityType, entityId, metadata ? JSON.stringify(metadata) : null]
    );
  } catch {}
}

// Append-only activity stream for the owner panel timeline + engagement signals.
// action = low-cardinality Object.Action (e.g. 'whatsapp.connected'). Best-effort: never
// breaks the request; no-op if the table isn't migrated yet (deploy-order-safe).
export async function logActivity(workspaceId: string, action: string, properties?: any, actorUserId?: string | null): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO activity_events (workspace_id, actor_user_id, action, properties) VALUES ($1,$2,$3,$4)',
      [workspaceId, actorUserId ?? null, action, properties ? JSON.stringify(properties) : null]
    );
  } catch {}
}
