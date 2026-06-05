// One-time migration: import existing useMultiFileAuthState file sessions into Postgres,
// so enabling WA_AUTH_BACKEND=postgres does NOT force a QR re-scan of already-linked accounts.
//
// Run on the WhatsApp box (where ./sessions lives):
//   DATABASE_URL=postgresql://...@cybercontrol-db:5432/cybercontrol \
//   AUTH_DIR=/opt/whatsapp/service/sessions \
//   node migrate-sessions-to-db.js
//
// Value encoding matches auth-postgres.js (Baileys BufferJSON form stored as jsonb).
// CAVEAT: Baileys sanitizes key filenames (':'->'-', '/'->'__'). We reverse '__'->'/' and
// split on known type prefixes. Ids containing ':' can't be reversed unambiguously — for any
// account that does NOT reconnect after the cutover, just re-scan its QR (one-time, safe fallback).
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const AUTH_DIR = process.env.AUTH_DIR || './sessions';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Longest-first so 'sender-key-memory' matches before 'sender-key', etc.
const TYPES = ['app-state-sync-version', 'app-state-sync-key', 'sender-key-memory', 'sender-key', 'pre-key', 'session'];

function splitTypeId(base) {
  for (const t of TYPES) {
    if (base === t || base.startsWith(t + '-')) {
      return { type: t, id: base.slice(t.length + 1).replace(/__/g, '/') };
    }
  }
  return null;
}

async function migrateWorkspace(wsId) {
  const dir = path.join(AUTH_DIR, wsId);
  const credsPath = path.join(dir, 'creds.json');
  if (!fs.existsSync(credsPath)) { console.log(`skip ${wsId}: no creds.json`); return; }

  const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
  await pool.query(
    `INSERT INTO wa_auth_creds (workspace_id, creds, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (workspace_id) DO UPDATE SET creds = $2, updated_at = now()`,
    [wsId, creds]
  );

  let keys = 0, skipped = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f === 'creds.json' || !f.endsWith('.json')) continue;
    const parsed = splitTypeId(f.slice(0, -5));
    if (!parsed) { console.warn(`  ? unrecognized key file: ${f}`); skipped++; continue; }
    const value = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    await pool.query(
      `INSERT INTO wa_auth_keys (workspace_id, key_type, key_id, value) VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, key_type, key_id) DO UPDATE SET value = $4`,
      [wsId, parsed.type, parsed.id, value]
    );
    keys++;
  }
  console.log(`migrated ${wsId}: creds + ${keys} keys${skipped ? ` (${skipped} skipped)` : ''}`);
}

(async () => {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const dirs = fs.existsSync(AUTH_DIR)
    ? fs.readdirSync(AUTH_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
    : [];
  console.log(`found ${dirs.length} workspace session dir(s) in ${AUTH_DIR}`);
  for (const wsId of dirs) {
    try { await migrateWorkspace(wsId); } catch (e) { console.error(`fail ${wsId}: ${e.message}`); }
  }
  await pool.end();
  console.log('done. After enabling WA_AUTH_BACKEND=postgres, verify each account reconnects; re-scan QR for any that do not.');
})();
