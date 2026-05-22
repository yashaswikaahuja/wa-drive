#!/usr/bin/env node
// backfill-saved-names.js
// One-time: query resolver for each unique customer in DB, update sender_name with saved contact name.
// Usage (on GCP#1): node backfill-saved-names.js

const { Pool } = require('pg');
require('dotenv').config();

const RESOLVER_URL = 'http://34.100.147.20:3200';
const WA_SECRET = process.env.WA_SECRET || 'wa-service-secret-2024';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  console.log('[Backfill] Starting — querying unique customer phones...');
  const { rows: customers } = await pool.query(`
    SELECT DISTINCT customer_id, workspace_id
    FROM drive_files
    WHERE customer_id ~ '^[0-9]+$' AND customer_id IS NOT NULL
  `);
  console.log(`[Backfill] Found ${customers.length} unique customers across all workspaces`);

  let updated = 0; let skipped = 0; let failed = 0;
  for (const { customer_id, workspace_id } of customers) {
    try {
      const r = await fetch(`${RESOLVER_URL}/contact?phone=${customer_id}`, {
        headers: { 'x-service-secret': WA_SECRET }
      });
      if (!r.ok) { failed++; continue; }
      const data = await r.json();
      if (!data.name) { skipped++; continue; }

      const result = await pool.query(
        `UPDATE drive_files SET customer_name = $1
         WHERE workspace_id = $2 AND customer_id = $3
           AND customer_name IS DISTINCT FROM $1`,
        [data.name, workspace_id, customer_id]
      );
      if (result.rowCount > 0) {
        updated++;
        console.log(`[Backfill] ${customer_id} → "${data.name}" (${result.rowCount} files updated)`);
      } else {
        skipped++;
      }
    } catch (e) {
      failed++;
      console.warn(`[Backfill] ${customer_id} failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }

  console.log(`\n[Backfill] Done. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  await pool.end();
})();
