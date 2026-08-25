/**
 * Create a local test café admin for frontend login.
 * Usage (from repo root):
 *   DATABASE_URL=postgresql://... node packages/backend-auth/../../scripts/create-test-account.mjs
 * Prefer:
 *   cd packages/backend-auth && node ../../scripts/create-test-account.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireAuth = createRequire(path.join(root, 'packages/backend-auth/package.json'));
const requireCore = createRequire(path.join(root, 'packages/backend-core/package.json'));
const bcrypt = requireAuth('bcrypt');
const pg = requireCore('pg');

const password = process.env.TEST_PASSWORD || 'TestPass123!';
const email = process.env.TEST_EMAIL || 'test@cybercontrol.local';
const phone = process.env.TEST_PHONE || '919999999999';
const name = process.env.TEST_NAME || 'Local Test Cafe';
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://cybercontrol_app:cybercontrol123@127.0.0.1:5434/cybercontrol';

const hash = await bcrypt.hash(password, 10);
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const existing = await client.query(
    'SELECT id, workspace_id FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  if (existing.rows[0]) {
    const uid = existing.rows[0].id;
    const wid = existing.rows[0].workspace_id;
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [uid]);
    await client.query('DELETE FROM users WHERE id = $1', [uid]);
    await client.query('DELETE FROM workspaces WHERE id = $1', [wid]);
    console.log('Removed previous test account');
  }

  const ws = await client.query(
    `INSERT INTO workspaces (name, location, location_source, status)
     VALUES ($1, $2, 'manual', 'active')
     RETURNING id`,
    [name, 'Patna, Bihar'],
  );
  const workspaceId = ws.rows[0].id;

  let user;
  try {
    user = await client.query(
      `INSERT INTO users (
         workspace_id, email, phone, password_hash, name, role, status,
         email_verified, phone_verified
       ) VALUES ($1,$2,$3,$4,$5,'admin','active',true,true)
       RETURNING id, email, role`,
      [workspaceId, email, phone, hash, name],
    );
  } catch {
    user = await client.query(
      `INSERT INTO users (
         workspace_id, email, phone, password_hash, name, role, status
       ) VALUES ($1,$2,$3,$4,$5,'admin','active')
       RETURNING id, email, role`,
      [workspaceId, email, phone, hash, name],
    );
  }

  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        password,
        phone,
        userId: user.rows[0].id,
        workspaceId,
        role: user.rows[0].role,
        loginUrl: 'http://127.0.0.1:5173/',
      },
      null,
      2,
    ),
  );
} catch (e) {
  await client.query('ROLLBACK');
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
