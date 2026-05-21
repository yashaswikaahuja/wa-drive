import { google } from 'googleapis';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Get OAuth2 client with workspace-specific tokens
export async function getDriveClient(workspaceId) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Load tokens from DB
  const { rows } = await pool.query(
    "SELECT key, value FROM workspace_secrets WHERE workspace_id = $1 AND key IN ('drive_access_token', 'drive_refresh_token')",
    [workspaceId]
  );

  const tokens = {};
  rows.forEach(r => tokens[r.key] = r.value);

  if (!tokens.drive_refresh_token) return null;

  client.setCredentials({
    access_token: tokens.drive_access_token,
    refresh_token: tokens.drive_refresh_token,
  });

  // Auto-save refreshed tokens
  client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await pool.query(
        "INSERT INTO workspace_secrets(workspace_id, key, value, updated_at) VALUES($1, 'drive_access_token', $2, now()) ON CONFLICT(workspace_id, key) DO UPDATE SET value=$2, updated_at=now()",
        [workspaceId, newTokens.access_token]
      );
    }
    if (newTokens.refresh_token) {
      await pool.query(
        "INSERT INTO workspace_secrets(workspace_id, key, value, updated_at) VALUES($1, 'drive_refresh_token', $2, now()) ON CONFLICT(workspace_id, key) DO UPDATE SET value=$2, updated_at=now()",
        [workspaceId, newTokens.refresh_token]
      );
    }
  });

  return google.drive({ version: 'v3', auth: client });
}

// Upload file to Drive
export async function uploadFile(workspaceId, buffer, fileName, mimeType) {
  const drive = await getDriveClient(workspaceId);
  if (!drive) throw new Error('Drive not connected for this workspace');

  const { Readable } = await import('stream');

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: ['root'] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id,webContentLink',
  });

  const fileId = res.data.id;

  // Make publicly readable
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;

  return { driveFileId: fileId, thumbnailUrl };
}

// Download file from Drive
export async function downloadFile(workspaceId, driveFileId) {
  const drive = await getDriveClient(workspaceId);
  if (!drive) throw new Error('Drive not connected for this workspace');

  const res = await drive.files.get(
    { fileId: driveFileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  const meta = await drive.files.get({ fileId: driveFileId, fields: 'mimeType,name' });

  return {
    buffer: Buffer.from(res.data),
    mimeType: meta.data.mimeType,
    fileName: meta.data.name,
  };
}

// Generate OAuth URL for connecting Drive
export function getAuthUrl(workspaceId) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: workspaceId,
  });
}

// Handle OAuth callback
export async function handleCallback(code, workspaceId) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await client.getToken(code);

  await pool.query(
    "INSERT INTO workspace_secrets(workspace_id, key, value, updated_at) VALUES($1, 'drive_access_token', $2, now()) ON CONFLICT(workspace_id, key) DO UPDATE SET value=$2, updated_at=now()",
    [workspaceId, tokens.access_token]
  );
  await pool.query(
    "INSERT INTO workspace_secrets(workspace_id, key, value, updated_at) VALUES($1, 'drive_refresh_token', $2, now()) ON CONFLICT(workspace_id, key) DO UPDATE SET value=$2, updated_at=now()",
    [workspaceId, tokens.refresh_token]
  );

  return { ok: true };
}

// Check if workspace has Drive connected
export async function isConnected(workspaceId) {
  const { rows } = await pool.query(
    "SELECT value FROM workspace_secrets WHERE workspace_id = $1 AND key = 'drive_refresh_token'",
    [workspaceId]
  );
  return rows.length > 0 && !!rows[0].value;
}
