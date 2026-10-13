import { Router, type Router as ExpressRouter } from 'express';
import { pool, logActivity, authMiddleware } from '@cybercontrol/backend-core';
import { oauth2Client, getDriveForWorkspace } from './service.js';

const router: ExpressRouter = Router();

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
    if (wsId) logActivity(wsId, 'drive.linked');
    res.send('<script>window.opener?.postMessage({type:"DRIVE_CONNECTED"},"*");window.close();</script>');
  } catch (e: any) {
    console.error('[Drive] Callback error:', e.message);
    res.status(500).send('OAuth failed: ' + e.message);
  }
});

// Status check — this workspace only. A missing token is "not connected",
// never the process-wide Drive used by another café.
router.get('/status', authMiddleware, async (req: any, res) => {
  const wsId = req.user?.workspaceId;
  if (!wsId) return res.json({ connected: false });
  try {
    const r = await pool.query("SELECT value FROM workspace_secrets WHERE workspace_id=$1 AND key='drive_refresh_token'", [wsId]);
    if (r.rows.length > 0 && r.rows[0].value) return res.json({ connected: true });
  } catch {}
  const drive = await getDriveForWorkspace(wsId);
  res.json({ connected: !!drive });
});

// Per-workspace Drive files (DB-backed)
// Query: ?source=whatsapp (WA Documents view) | ?source=all|omit (File Manager — every provenance)
//         ?customerId=91… to scope to one phone
router.get('/files/ws', authMiddleware, async (req: any, res) => {
  try {
    const source = String(req.query.source || '').trim().toLowerCase();
    const customerId = String(req.query.customerId || '').trim();
    const params: any[] = [req.user.workspaceId];
    let where = 'workspace_id = $1';
    if (source && source !== 'all') {
      params.push(source);
      where += ` AND COALESCE(source, 'whatsapp') = $${params.length}`;
    }
    if (customerId) {
      params.push(customerId);
      where += ` AND customer_id = $${params.length}`;
    }
    const r = await pool.query(
      `SELECT id, file_name as "fileName", customer_id as "customerId", customer_name as "customerName",
              file_url as "fileUrl", uploaded_at as "timestamp", profile_pic_url as "dpUrl", tag,
              COALESCE(source, 'whatsapp') as source, source_metadata as "sourceMetadata",
              mime_type as "mimeType", drive_file_id as "driveFileId"
       FROM drive_files WHERE ${where} ORDER BY uploaded_at DESC`,
      params
    );
    // Never scan the shared Google Drive when this workspace has no rows.
    // That scan listed another café's customer folders for a new account.
    res.json(r.rows);
  } catch (e: any) { console.error('[drive/files/ws]', e.message); res.json([]); }
});

// Download proxy
router.get('/download/:fileId', (req: any, res, next) => {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token;
  authMiddleware(req, res, next);
}, async (req: any, res) => {
  const { fileId } = req.params;
  const owned = await pool.query(
    `SELECT id, drive_file_id FROM drive_files
     WHERE workspace_id = $1 AND (id::text = $2 OR drive_file_id = $2)
     LIMIT 1`,
    [req.user.workspaceId, fileId]
  );
  if (!owned.rows.length) return res.status(404).json({ error: 'File not found' });
  const drive = await getDriveForWorkspace(req.user.workspaceId);
  if (!drive) return res.status(401).json({ error: 'Drive not connected for this workspace' });
  const googleId = owned.rows[0].drive_file_id || owned.rows[0].id;
  try {
    const metaRes = await drive.files.get({ fileId: googleId, fields: 'mimeType,name' });
    const mime = metaRes.data.mimeType || 'application/octet-stream';
    const driveRes = await drive.files.get({ fileId: googleId, alt: 'media' }, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(driveRes.data as any);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${metaRes.data.name || 'file'}"`);
    res.send(buffer);
  } catch (e: any) { res.status(e.code || 500).json({ error: 'Download failed: ' + e.message }); }
});

export default router;


// Tag a file with document category (Hub badge). Prefer POST /process/set-document-type for typed extract.
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
