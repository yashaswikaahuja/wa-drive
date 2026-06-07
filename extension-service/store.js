// store.js — shared document store for the extension-service.
//
// WHY: form_mappings.json and adapters.json used to live on local disk (DATA_DIR). That made the
// service single-instance — running two copies behind a load balancer would give each its own files,
// so learned mappings/adapters would diverge. This stores each whole document as one JSONB row in the
// shared Postgres, so every extension-service replica reads/writes the SAME data.
//
// The API mirrors the old file helpers (load()/save() of a whole object) to keep route changes minimal:
// callers still treat a document as one JS object; we just swap fs for a DB upsert.
//
// Keys are stable document names: 'form_mappings', 'adapters'.

import { pool } from './db.js';

let schemaReady = null; // a promise, so concurrent callers share one ensure

export function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS ext_kv_store (
      key        text PRIMARY KEY,
      data       jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `).then(() => {
    console.log('[extension-service] ext_kv_store ready (shared document store)');
  }).catch((e) => {
    schemaReady = null; // allow retry on next call
    console.error('[extension-service] ensureSchema failed:', e.message);
    throw e;
  });
  return schemaReady;
}

// Load a whole document by key. Returns {} if absent (same as the old file load()).
export async function loadDoc(key) {
  await ensureSchema();
  const { rows } = await pool.query('SELECT data FROM ext_kv_store WHERE key = $1', [key]);
  return rows[0]?.data ?? {};
}

// Save (replace) a whole document by key. Upsert — same contract as the old file save().
export async function saveDoc(key, data) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO ext_kv_store (key, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [key, JSON.stringify(data ?? {})]
  );
}

export const KEYS = { MAPPINGS: 'form_mappings', ADAPTERS: 'adapters' };
