#!/usr/bin/env node
// migrate-files-to-db.js — one-time migration of the legacy on-disk extension-service stores
// (DATA_DIR/form_mappings.json + DATA_DIR/adapters.json) into the shared Postgres ext_kv_store.
//
// Run this ONCE on the live VM before/at cutover to multi-instance, so the learned mappings and
// adapters carry over instead of starting empty. Idempotent: re-running just overwrites the rows
// with the file contents (so don't run it AFTER the cluster has learned new things in the DB).
//
//   DATABASE_URL=postgres://...  DATA_DIR=/opt/extension-service/data  node migrate-files-to-db.js
//
// Mirrors whatsapp-service/migrate-sessions-to-db.js in style.

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { ensureSchema, KEYS } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || resolve(__dirname, 'data');

function readJson(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`[migrate] failed to parse ${path}:`, e.message); return null; }
}

async function upsert(key, data) {
  await pool.query(
    `INSERT INTO ext_kv_store (key, data, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [key, JSON.stringify(data)]
  );
}

async function main() {
  console.log(`[migrate] DATA_DIR = ${DATA_DIR}`);
  await ensureSchema();

  const jobs = [
    { key: KEYS.MAPPINGS, file: resolve(DATA_DIR, 'form_mappings.json') },
    { key: KEYS.ADAPTERS, file: resolve(DATA_DIR, 'adapters.json') },
  ];

  let migrated = 0;
  for (const { key, file } of jobs) {
    const data = readJson(file);
    if (data === null) { console.log(`[migrate] skip ${key}: ${file} absent or unreadable`); continue; }
    const topLevel = Object.keys(data).filter(k => k !== '_meta').length;
    await upsert(key, data);
    console.log(`[migrate] \u2713 ${key} \u2190 ${file} (${topLevel} top-level entries)`);
    migrated++;
  }

  console.log(`[migrate] done: ${migrated} document(s) migrated into ext_kv_store`);
  await pool.end();
}

main().catch((e) => { console.error('[migrate] FATAL:', e.message); process.exit(1); });
