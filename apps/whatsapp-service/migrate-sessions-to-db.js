import pg from "pg";
import { migrateFilesToDb } from "@cybercontrol/wa-auth";
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrateFilesToDb({
    pool,
    authDir: process.env.AUTH_DIR || "./sessions"
  });
} finally {
  await pool.end();
}
