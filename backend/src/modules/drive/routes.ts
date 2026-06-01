import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { oauth2Client, getDrive, getDriveAccessToken, getDriveForWorkspace } from './service.js';

const router = Router();

// OAuth2 Step 1 — redirect to Google consent
router.get('/auth', (req, res) => {
  const wsId = (req.query.workspace as string) || '';
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: wsId,
  });
  res.redirect(url);
});

// OAuth2 Step 2 — callback
router.get('/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send('Missing code'); return; }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const wsId = req.query.state as string;
    if (tokens.refresh_token) {
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_refresh_token',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()`, [tokens.refresh_token]);
      if (wsId) await pool.query(`INSERT INTO workspace_secrets(workspace_id,key,value,updated_at) VALUES($1,'drive_refresh_token',$2,now()) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2,updated_at=now()`, [wsId, tokens.refresh_token]);
    }
    if (tokens.access_token) {
      await pool.query(`INSERT INTO app_secrets(key,value,updated_at) VALUES('drive_access_token',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1,updated_at=now()`, [tokens.access_token]);
      if (wsId) await pool.query(`INSERT INTO workspace_secrets(workspace_id,key,value,updated_at) VALUES($1,'drive_access_token',$2,now()) ON CONFLICT(workspace_id,key) DO UPDATE SET value=$2,updated_at=now()`, [wsId, tokens.access_token]);
    }
    console.log('[Drive] Connected for workspace:', wsId || 'global');
    res.send('<script>window.opener?.postMessage({type:"DRIVE_CONNECTED"},"*");window.close();</script>');
  } catch (e: any) {
    console.error('[Drive] Callback error:', e.message);
    res.status(500).send('OAuth failed: ' + e.message);
  }
});

// Status check
router.get('/status', authMiddleware, async (req: any, res) => {
  const wsId = req.user?.workspaceId;
  if (wsId) {
    try {
      const r = await pool.query("SELECT value FROM workspace_secrets WHERE workspace_id=$1 AND key='drive_refresh_token'", [wsId]);
      return res.json({ connected: r.rows.length > 0 && !!r.rows[0].value });
    } catch {}
  }
  const connected = !!(oauth2Client.credentials.refresh_token || oauth2Client.credentials.access_token);
  res.json({ connected });
});

// Per-workspace Drive files (DB-backed)
router.get('/files/ws', authMiddleware, async (req: any, res) => {
  try {
    const r = await pool.query(
      'SELECT id, file_name as "fileName", customer_id as "customerId", customer_name as "customerName", file_url as "fileUrl", uploaded_at as "timestamp", profile_pic_url as "dpUrl", tag FROM drive_files WHERE workspace_id = $1 ORDER BY uploaded_at DESC',
      [req.user.workspaceId]
    );
    if (r.rows.length > 0) return res.json(r.rows);
    // Fallback: legacy Drive API scan
    const drive = getDrive();
    if (!drive) return res.json([]);
    const folderRes = await drive.files.list({ q: "name='customers' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents", fields: 'files(id)', pageSize: 1 });
    const customersId = folderRes.data.files?.[0]?.id;
    if (!customersId) return res.json([]);
    const subfoldersRes = await drive.files.list({ q: `'${customersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name)' });
    const results: any[] = [];
    for (const folder of subfoldersRes.data.files || []) {
      const filesRes = await drive.files.list({ q: `'${folder.id}' in parents and trashed=false`, fields: 'files(id,name,createdTime,mimeType)', orderBy: 'createdTime desc', pageSize: 50 });
      for (const file of filesRes.data.files || []) {
        results.push({ id: file.id, customerId: folder.name, customerName: folder.name, fileName: file.name, fileUrl: `https://drive.google.com/thumbnail?id=${file.id}&sz=w200`, timestamp: file.createdTime });
      }
    }
    res.json(results);
  } catch (e: any) { console.error('[drive/files/ws]', e.message); res.json([]); }
});

// Download proxy
router.get('/download/:fileId', (req: any, res, next) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  authMiddleware(req, res, next);
}, async (req: any, res) => {
  const { fileId } = req.params;
  const drive = await getDriveForWorkspace(req.user.workspaceId);
  if (!drive) return res.status(401).json({ error: 'Drive not connected for this workspace' });
  try {
    const metaRes = await drive.files.get({ fileId, fields: 'mimeType,name' });
    const mime = metaRes.data.mimeType || 'application/octet-stream';
    const driveRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(driveRes.data as any);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${metaRes.data.name || 'file'}"`);
    res.send(buffer);
  } catch (e: any) { res.status(e.code || 500).json({ error: 'Download failed: ' + e.message }); }
});

export default router;


// Tag a file with document category
router.patch('/files/:id/tag', authMiddleware, async (req: any, res) => {
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ error: 'tag required' });
  try {
    await pool.query('UPDATE drive_files SET tag = $1 WHERE id = $2 AND workspace_id = $3', [tag, req.params.id, req.user.workspaceId]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/drive/files/:id — remove a received document from the operator's view
router.delete('/files/:id', authMiddleware, async (req: any, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM drive_files WHERE id = $1 AND workspace_id = $2', [req.params.id, req.user.workspaceId]);
    await pool.query('DELETE FROM extraction_cache WHERE file_id = $1', [req.params.id]).catch(() => {});
    if (!rowCount) return res.status(404).json({ error: 'Document not found' });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
