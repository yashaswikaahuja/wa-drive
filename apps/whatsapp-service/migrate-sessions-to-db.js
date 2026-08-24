/**
 * One-time migration CLI — keep this path stable for ops runbooks.
 *
 * Run on the WhatsApp box (where ./sessions lives):
 *   DATABASE_URL=postgresql://...@cybercontrol-db:5432/cybercontrol \
 *   AUTH_DIR=/opt/whatsapp/service/sessions \
 *   node migrate-sessions-to-db.js
 */
import pg from 'pg';
import { migrateFilesToDb } from '@cybercontrol/wa-auth';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrateFilesToDb({
    pool,
    authDir: process.env.AUTH_DIR || './sessions',
  });
} finally {
  await pool.end();
}
