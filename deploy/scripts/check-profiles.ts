const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const u = await p.query(
    `SELECT id, email, name, workspace_id
     FROM users
     WHERE name ILIKE '%yasha%' OR email ILIKE '%yasha%' OR name ILIKE '%yashaswi%'
        OR name ILIKE '%ramish%' OR email ILIKE '%ramish%'
     LIMIT 20`
  );
  console.log('users', JSON.stringify(u.rows, null, 2));
  for (const row of u.rows) {
    const c = await p.query(
      'SELECT count(*)::int AS n FROM profiles WHERE workspace_id = $1 AND deleted_at IS NULL',
      [row.workspace_id]
    );
    console.log(row.email || row.name, row.workspace_id, 'profiles=', c.rows[0].n);
  }
  await p.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
