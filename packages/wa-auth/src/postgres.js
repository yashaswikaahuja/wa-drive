// Postgres-backed Baileys auth state — drop-in replacement for useMultiFileAuthState.
// Decouples a workspace's WhatsApp login from any VM's local disk, so a workspace can be
// assigned/moved/failed-over across whatsapp-service instances without re-scanning the QR.
//
// Mirrors the { state: { creds, keys }, saveCreds } shape Baileys expects.
// baileys ESM: named exports omit `proto` (it lives on the default export).
import baileys, { initAuthCreds, BufferJSON } from 'baileys';
const { proto } = baileys;

// BufferJSON handles Buffer <-> JSON so values round-trip losslessly through jsonb.
const ser = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
const de = (v) => JSON.parse(JSON.stringify(v), BufferJSON.reviver);

export async function usePostgresAuthState(pool, workspaceId) {
  const credRow = await pool.query(
    'SELECT creds FROM wa_auth_creds WHERE workspace_id = $1',
    [workspaceId]
  );
  const creds = credRow.rows[0] ? de(credRow.rows[0].creds) : initAuthCreds();

  const saveCreds = () =>
    pool.query(
      `INSERT INTO wa_auth_creds (workspace_id, creds, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (workspace_id) DO UPDATE SET creds = $2, updated_at = now()`,
      [workspaceId, ser(creds)]
    );

  const keys = {
    get: async (type, ids) => {
      const out = {};
      if (!ids.length) return out;
      const q = await pool.query(
        'SELECT key_id, value FROM wa_auth_keys WHERE workspace_id = $1 AND key_type = $2 AND key_id = ANY($3)',
        [workspaceId, type, ids]
      );
      for (const row of q.rows) {
        let value = de(row.value);
        if (type === 'app-state-sync-key' && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        out[row.key_id] = value;
      }
      return out;
    },
    set: async (data) => {
      const ops = [];
      for (const type of Object.keys(data)) {
        for (const id of Object.keys(data[type])) {
          const value = data[type][id];
          if (value) {
            ops.push(
              pool.query(
                `INSERT INTO wa_auth_keys (workspace_id, key_type, key_id, value) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (workspace_id, key_type, key_id) DO UPDATE SET value = $4`,
                [workspaceId, type, id, ser(value)]
              )
            );
          } else {
            ops.push(
              pool.query(
                'DELETE FROM wa_auth_keys WHERE workspace_id = $1 AND key_type = $2 AND key_id = $3',
                [workspaceId, type, id]
              )
            );
          }
        }
      }
      await Promise.all(ops);
    },
  };

  return { state: { creds, keys }, saveCreds };
}

// Remove a workspace's auth (called on loggedOut, replaces fs.rmSync of the session dir).
export async function clearPostgresAuthState(pool, workspaceId) {
  await pool.query('DELETE FROM wa_auth_keys WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM wa_auth_creds WHERE workspace_id = $1', [workspaceId]);
}
