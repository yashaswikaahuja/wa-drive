import { google } from 'googleapis';
import { Pool } from 'pg';
import { Readable } from 'stream';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function makeOAuth() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

async function getTokens(workspaceId: string) {
  const { rows } = await pool.query(
    "SELECT key, value FROM workspace_secrets WHERE workspace_id = $1 AND key IN ('drive_access_token','drive_refresh_token')", [workspaceId]
  );
  const map: Record<string, string> = {};
  rows.forEach((r: any) => map[r.key] = r.value);
  return map;
}

async function saveToken(workspaceId: string, key: string, value: string) {
  await pool.query(
    "INSERT INTO workspace_secrets(workspace_id,key,value,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$3,updated_at=now()",
    [workspaceId, key, value]
  );
}

async function getDrive(workspaceId: string) {
  const tokens = await getTokens(workspaceId);
  if (!tokens.drive_refresh_token) return null;
  const auth = makeOAuth();
  auth.setCredentials({ access_token: tokens.drive_access_token, refresh_token: tokens.drive_refresh_token });
  auth.on('tokens', (t) => {
    if (t.access_token) saveToken(workspaceId, 'drive_access_token', t.access_token);
    if (t.refresh_token) saveToken(workspaceId, 'drive_refresh_token', t.refresh_token);
  });
  return google.drive({ version: 'v3', auth });
}

export async function upload(workspaceId: string, buffer: Buffer, fileName: string, mimeType: string) {
  const drive = await getDrive(workspaceId);
  if (!drive) throw new Error('Drive not connected');
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: ['root'] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  });
  const fileId = res.data.id!;
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  return { driveFileId: fileId, thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w200` };
}

export async function download(workspaceId: string, fileId: string) {
  const drive = await getDrive(workspaceId);
  if (!drive) throw new Error('Drive not connected');
  const [data, meta] = await Promise.all([
    drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
    drive.files.get({ fileId, fields: 'mimeType,name' }),
  ]);
  return { buffer: Buffer.from(data.data as ArrayBuffer), mimeType: meta.data.mimeType!, fileName: meta.data.name! };
}

export function getAuthUrl(workspaceId: string) {
  return makeOAuth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive.file'], state: workspaceId });
}

export async function handleCallback(code: string, workspaceId: string) {
  const { tokens } = await makeOAuth().getToken(code);
  if (tokens.access_token) await saveToken(workspaceId, 'drive_access_token', tokens.access_token);
  if (tokens.refresh_token) await saveToken(workspaceId, 'drive_refresh_token', tokens.refresh_token);
}

export async function isConnected(workspaceId: string) {
  const { rows } = await pool.query("SELECT 1 FROM workspace_secrets WHERE workspace_id=$1 AND key='drive_refresh_token' AND value IS NOT NULL", [workspaceId]);
  return rows.length > 0;
}
