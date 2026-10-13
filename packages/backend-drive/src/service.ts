import { google } from 'googleapis';
import { pool, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '@cybercontrol/backend-core';

// Global oauth2Client for legacy/fallback
export const oauth2Client: any = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

// Auto-persist whenever googleapis refreshes the access token
oauth2Client.on('tokens', async (tokens: any) => {
  try {
    if (tokens.refresh_token)
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_refresh_token',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()`, [tokens.refresh_token]);
    if (tokens.access_token)
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_access_token',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()`, [tokens.access_token]);
    console.log('[Drive] Tokens auto-refreshed and saved');
  } catch (e: any) { console.warn('[Drive] Token persist failed:', e.message); }
});

export async function loadDriveTokenFromDB() {
  try {
    const r = await pool.query(`SELECT key,value FROM app_secrets WHERE key IN ('drive_refresh_token','drive_access_token')`);
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.key] = row.value;
    if (map['drive_refresh_token']) {
      oauth2Client.setCredentials({ refresh_token: map['drive_refresh_token'], access_token: map['drive_access_token'] || undefined });
      console.log('[Drive] Tokens loaded from DB — auto-refresh active');
    }
  } catch (e: any) { console.warn('[Drive] Token load failed:', e.message); }
}

export function getDrive() {
  const creds = oauth2Client.credentials;
  if (!creds.refresh_token && !creds.access_token) return null;
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export function getDriveAccessToken() {
  return oauth2Client.credentials.access_token || null;
}

function driveClientFromTokens(wsId: string, accessToken?: string, refreshToken?: string) {
  const wsAuth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  wsAuth.setCredentials({
    access_token: accessToken || undefined,
    refresh_token: refreshToken || undefined,
  });
  wsAuth.on('tokens', async (tokens: any) => {
    try {
      if (tokens.refresh_token)
        await pool.query(`INSERT INTO workspace_secrets(workspace_id,key,value,updated_at) VALUES($1,'drive_refresh_token',$2,now()) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2,updated_at=now()`, [wsId, tokens.refresh_token]);
      if (tokens.access_token)
        await pool.query(`INSERT INTO workspace_secrets(workspace_id,key,value,updated_at) VALUES($1,'drive_access_token',$2,now()) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2,updated_at=now()`, [wsId, tokens.access_token]);
    } catch {}
  });
  return google.drive({ version: 'v3', auth: wsAuth });
}

/**
 * The process-wide Drive token (app_secrets) is the original café's Drive.
 * A brand-new workspace must not inherit it — that listed and stored another
 * café's customer folders. Only the workspace that already owns the file rows
 * may claim it, and the token is then copied onto that workspace.
 */
async function claimLegacyDrive(wsId: string) {
  const legacy = await pool.query(
    `SELECT key, value FROM app_secrets WHERE key IN ('drive_refresh_token','drive_access_token')`
  );
  const map: Record<string, string> = {};
  for (const row of legacy.rows) map[row.key] = row.value;
  if (!map.drive_refresh_token && !map.drive_access_token) return null;

  const owners = await pool.query(
    `SELECT workspace_id, count(*)::int AS n
     FROM drive_files
     WHERE workspace_id IS NOT NULL
     GROUP BY workspace_id
     ORDER BY n DESC
     LIMIT 2`
  );
  const top = owners.rows[0];
  const second = owners.rows[1];
  if (!top || top.workspace_id !== wsId) return null;
  if (second && second.n === top.n) return null;

  if (map.drive_refresh_token) {
    await pool.query(
      `INSERT INTO workspace_secrets(workspace_id,key,value,updated_at)
       VALUES($1,'drive_refresh_token',$2,now())
       ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2, updated_at=now()`,
      [wsId, map.drive_refresh_token]
    );
  }
  if (map.drive_access_token) {
    await pool.query(
      `INSERT INTO workspace_secrets(workspace_id,key,value,updated_at)
       VALUES($1,'drive_access_token',$2,now())
       ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2, updated_at=now()`,
      [wsId, map.drive_access_token]
    );
  }
  return driveClientFromTokens(wsId, map.drive_access_token, map.drive_refresh_token);
}

/** Load workspace-specific tokens and return a Drive client scoped to that workspace. */
export async function getDriveForWorkspace(wsId: string) {
  if (!wsId) return null;
  const tokRow = await pool.query(
    "SELECT key, value FROM workspace_secrets WHERE workspace_id = $1 AND key IN ('drive_access_token','drive_refresh_token')",
    [wsId]
  );
  const wsTokens: Record<string, string> = {};
  tokRow.rows.forEach((r: any) => (wsTokens[r.key] = r.value));

  if (wsTokens.drive_refresh_token || wsTokens.drive_access_token) {
    return driveClientFromTokens(wsId, wsTokens.drive_access_token, wsTokens.drive_refresh_token);
  }
  return claimLegacyDrive(wsId);
}

export async function findOrCreateFolder(drive: any, name: string, parentId?: string) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id;
  const f = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId ?? 'root'] },
    fields: 'id',
  });
  return f.data.id;
}

/** Download a file's raw bytes from Drive by id (used by the extraction recovery sweeper to
 *  re-process a document whose in-memory extraction was lost on a restart). */
export async function downloadFileFromDrive(drive: any, fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export async function uploadFileToDrive(drive: any, buffer: Buffer, fileName: string, mimetype: string, phone: string, senderName: string) {
  const customersId = await findOrCreateFolder(drive, 'customers');
  const phoneId = await findOrCreateFolder(drive, phone, customersId);
  const { Readable } = await import('stream');
  const file = await Promise.race([
    drive.files.create({
      requestBody: {
        name: fileName,
        parents: [phoneId],
        description: JSON.stringify({ customerName: senderName }),
      },
      media: { mimeType: mimetype, body: Readable.from(buffer) },
      fields: 'id,webContentLink',
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Drive upload timeout (30s)')), 30000)),
  ]) as any;
  const fileId = file.data.id;
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  return { fileId, webContentLink: file.data.webContentLink };
}
