// Postgres-backed Baileys auth state — drop-in replacement for useMultiFileAuthState.
// Decouples a workspace's WhatsApp login from any VM's local disk, so a workspace can be
// assigned/moved/failed-over across whatsapp-service instances without re-scanning the QR.
//
// Mirrors the { state: { creds, keys }, saveCreds } shape Baileys expects.
// baileys ESM: named exports omit `proto` (it lives on the default export).
import baileys, { initAuthCreds, BufferJSON } from 'baileys';
import type { Pool } from 'pg';

// Baileys default export carries proto; typings omit it on the named surface.
const proto = (baileys as { proto: { Message: { AppStateSyncKeyData: { fromObject: (v: unknown) => unknown } } } }).proto;

// BufferJSON handles Buffer <-> JSON so values round-trip losslessly through jsonb.
const ser = (v: unknown) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));
const de = (v: unknown) => JSON.parse(JSON.stringify(v), BufferJSON.reviver);

/**
 * Baileys (auth-utils addTransactionCapability) updates a Signal session by
 * reading it, advancing the chain key, and writing it back. Those steps must
 * not overlap. Parallel SQL writes were storing an older chain over a newer
 * one, so the next image failed with "Failed to decrypt message with any
 * known session" until a fresh QR login created new sessions.
 */
const workspaceLocks = new Map<string, Promise<void>>();

export function runLocked(workspaceId: string, work: () => Promise<void>): Promise<void> {
  const previous = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  workspaceLocks.set(workspaceId, settled);
  return run;
}

export async function usePostgresAuthState(pool: Pool, workspaceId: string) {
  const credRow = await pool.query(
    'SELECT creds FROM wa_auth_creds WHERE workspace_id = $1',
    [workspaceId],
  );
  const creds = credRow.rows[0] ? de(credRow.rows[0].creds) : initAuthCreds();

  const saveCreds = () =>
    runLocked(workspaceId, async () => {
      await pool.query(
        `INSERT INTO wa_auth_creds (workspace_id, creds, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (workspace_id) DO UPDATE SET creds = $2, updated_at = now()`,
        [workspaceId, ser(creds)],
      );
    });

  const keys = {
    get: async (type: string, ids: string[]) => {
      const out: Record<string, unknown> = {};
      if (!ids.length) return out;
      await runLocked(workspaceId, async () => {
        const q = await pool.query(
          'SELECT key_id, value FROM wa_auth_keys WHERE workspace_id = $1 AND key_type = $2 AND key_id = ANY($3)',
          [workspaceId, type, ids],
        );
        for (const row of q.rows) {
          let value = de(row.value);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          out[row.key_id as string] = value;
        }
      });
      return out;
    },
    set: async (data: Record<string, Record<string, unknown>>) => {
      await runLocked(workspaceId, async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const value = data[type][id];
              if (value) {
                await client.query(
                  `INSERT INTO wa_auth_keys (workspace_id, key_type, key_id, value) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (workspace_id, key_type, key_id) DO UPDATE SET value = $4`,
                  [workspaceId, type, id, ser(value)],
                );
              } else {
                await client.query(
                  'DELETE FROM wa_auth_keys WHERE workspace_id = $1 AND key_type = $2 AND key_id = $3',
                  [workspaceId, type, id],
                );
              }
            }
          }
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
    },
  };

  return { state: { creds, keys }, saveCreds };
}

// Remove a workspace's auth (called on loggedOut, replaces fs.rmSync of the session dir).
export async function clearPostgresAuthState(pool: Pool, workspaceId: string) {
  await pool.query('DELETE FROM wa_auth_keys WHERE workspace_id = $1', [workspaceId]);
  await pool.query('DELETE FROM wa_auth_creds WHERE workspace_id = $1', [workspaceId]);
}
