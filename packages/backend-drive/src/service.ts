import { google } from 'googleapis';
import { pool, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '@cybercontrol/backend-core';

// Used only to start the OAuth redirect and exchange the code.
// It must not stay signed in as a café. Tenant reads and writes use
// getDriveForWorkspace, which loads that workspace's own secret.
export const oauth2Client: any = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

/** Shared Drive tokens are not loaded. A process-wide client listed every café's folders. */
export async function loadDriveTokenFromDB() {
  oauth2Client.setCredentials({});
}

/** Always null. Call getDriveForWorkspace. A shared client is how this leak returned. */
export function getDrive() {
  return null;
}

export function getDriveAccessToken() {
  return null;
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

/** Drive client for one workspace. No shared token, no fallback. */
export async function getDriveForWorkspace(wsId: string) {
  if (!wsId) return null;
  const tokRow = await pool.query(
    "SELECT key, value FROM workspace_secrets WHERE workspace_id = $1 AND key IN ('drive_access_token','drive_refresh_token')",
    [wsId]
  );
  const wsTokens: Record<string, string> = {};
  tokRow.rows.forEach((r: any) => (wsTokens[r.key] = r.value));
  if (!wsTokens.drive_refresh_token && !wsTokens.drive_access_token) return null;
  return driveClientFromTokens(wsId, wsTokens.drive_access_token, wsTokens.drive_refresh_token);
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
