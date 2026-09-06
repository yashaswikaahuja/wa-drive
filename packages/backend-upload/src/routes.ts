import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { pool } from '@cybercontrol/backend-core';
import { getDriveForWorkspace, findOrCreateFolder, uploadFileToDrive } from '@cybercontrol/backend-drive';
import { getIO } from '@cybercontrol/backend-realtime';
import { autoExtractInBackground, enqueueExtractionJob } from '@cybercontrol/backend-documents';

const router: ExpressRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Concurrency limiter — only 1 Drive upload at a time
let hubUploadActive = 0;
const hubUploadQueue: Array<() => void> = [];
const HUB_UPLOAD_CONCURRENCY = 1;

function acquireUploadSlot(): Promise<void> {
  return new Promise(resolve => {
    if (hubUploadActive < HUB_UPLOAD_CONCURRENCY) { hubUploadActive++; resolve(); }
    else hubUploadQueue.push(resolve);
  });
}

function releaseUploadSlot() {
  const next = hubUploadQueue.shift();
  if (next) next();
  else hubUploadActive--;
}

function mimeToType(mime: string) {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  return 'file';
}

router.post('/upload', upload.single('file'), async (req: any, res) => {
  const uploadWsId = req.body.workspaceId || null;

  // Get workspace-scoped Drive client
  let drive: any = null;
  if (uploadWsId) {
    try {
      drive = await getDriveForWorkspace(uploadWsId);
      if (drive) console.log('[Hub] Using workspace Drive tokens for', uploadWsId.slice(0, 8));
    } catch (e: any) { console.warn('[Hub] WS token load error:', e.message); }
  }
  if (!drive) { res.status(401).json({ error: 'Not connected to Drive' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  let { phone, senderName, profilePicUrl } = req.body;
  const fileName = req.body.fileName || req.file.originalname || ('file_' + Date.now() + '.jpg');
  const mimetype = req.body.mimetype || req.file.mimetype || 'application/octet-stream';
  const fileSize = req.file.size;

  // Prefer an existing profile display name over WA pushname / @username when available.
  if (uploadWsId && phone) {
    try {
      const pr = await pool.query(
        `SELECT COALESCE(NULLIF(display_label,''), NULLIF(name,'')) AS n
         FROM profiles
         WHERE workspace_id = $1 AND primary_contact_phone = $2 AND deleted_at IS NULL
         ORDER BY updated_at DESC NULLS LAST
         LIMIT 1`,
        [uploadWsId, phone],
      );
      const profileName = pr.rows[0]?.n as string | undefined;
      const looksLikePush =
        !senderName ||
        senderName === phone ||
        senderName.startsWith('@') ||
        senderName === 'Not A Bussiness';
      if (profileName && looksLikePush) senderName = profileName;
    } catch {
      /* profiles table / columns may be missing on older DBs */
    }
  }

  console.log(`[Hub] Upload queued: ${fileName} (${(fileSize / 1024).toFixed(0)}KB) from ${phone}`);

  // Upload dedup: check if same file already uploaded for this customer in last 60s
  try {
    const dedupCheck = await pool.query(
      "SELECT id FROM drive_files WHERE workspace_id=$1 AND customer_id=$2 AND file_name=$3 AND uploaded_at > now() - interval '60 seconds'",
      [uploadWsId, phone, fileName]
    );
    if (dedupCheck.rows.length > 0) {
      console.log(`[Hub] Dedup: ${fileName} already uploaded for ${phone}, skipping`);
      return res.json({ fileUrl: null, fileId: dedupCheck.rows[0].id, dedup: true });
    }
  } catch {}

  // Sharp image validation
  if (mimetype.startsWith('image/')) {
    if (!req.file.buffer || req.file.buffer.length < 100) {
      console.error(`[Hub] ✗ Rejected ${fileName} — buffer empty or too small (${req.file.buffer?.length ?? 0} bytes)`);
      return res.status(400).json({ error: 'Invalid image: buffer empty or too small' });
    }
    try {
      const meta = await sharp(req.file.buffer).metadata();
      if (!meta.width || !meta.height) {
        console.error(`[Hub] ✗ Rejected ${fileName} — Sharp could not read image dimensions`);
        return res.status(400).json({ error: 'Invalid image: cannot read dimensions' });
      }
      console.log(`[Hub] ✓ Image valid: ${fileName} (${meta.width}x${meta.height} ${meta.format})`);
    } catch (sharpErr: any) {
      console.error(`[Hub] ✗ Rejected ${fileName} — Sharp error: ${sharpErr.message}`);
      return res.status(400).json({ error: `Invalid image: ${sharpErr.message}` });
    }
  }

  await acquireUploadSlot();
  try {
    console.log(`[Hub] Uploading: ${fileName}`);
    const { fileId, webContentLink } = await uploadFileToDrive(drive, req.file.buffer, fileName, mimetype, phone, senderName);

    // Zero-effort prep: extract in background so Build Profile is instant later.
    // Does NOT auto-apply to profile — operator still reviews. Just pre-computes.
    if (uploadWsId) autoExtractInBackground(req.file.buffer, fileId, uploadWsId, mimetype, phone);

    req.file.buffer = null; // Release buffer

    console.log(`[Hub] ✓ Uploaded: ${fileName} → ${fileId}`);

    // DB insert
    try {
      await pool.query(
        'INSERT INTO drive_files(id,workspace_id,file_name,customer_id,customer_name,file_url,uploaded_at,profile_pic_url) VALUES($1,$2,$3,$4,$5,$6,now(),$7) ON CONFLICT(id) DO NOTHING',
        [fileId, uploadWsId, fileName, phone, senderName, `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`, profilePicUrl || null]
      );
      if (profilePicUrl) await pool.query('UPDATE drive_files SET profile_pic_url = $1 WHERE workspace_id = $2 AND customer_id = $3', [profilePicUrl, uploadWsId, phone]);
      if (senderName) await pool.query('UPDATE drive_files SET customer_name = $1 WHERE workspace_id = $2 AND customer_id = $3 AND customer_name != $1', [senderName, uploadWsId, phone]);
      // Owner-panel activity signal (best-effort; column added in migration 007).
      pool.query('UPDATE workspaces SET last_active_at = now() WHERE id = $1', [uploadWsId]).catch(() => {});
    } catch (e: any) { console.warn('[Upload] DB:', e.message); }

    // Durable extraction ledger (safety net): record the job in-request so it survives a backend
    // restart even if the in-memory autoExtract above is lost. Non-fatal; no-ops if table absent.
    if (uploadWsId) enqueueExtractionJob(fileId, uploadWsId, phone);

    // Socket emit to workspace room
    const io = getIO();
    io.to(uploadWsId).emit('new_whatsapp_file', {
      id: fileId,
      customerId: phone,
      customerName: senderName,
      phoneNumber: phone,
      fileName,
      fileUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`,
      dpUrl: profilePicUrl || null,
      type: mimeToType(mimetype),
      size: fileSize,
      timestamp: new Date().toISOString(),
      profilePicUrl: profilePicUrl || null,
    });

    res.json({ fileUrl: webContentLink, fileId });
  } catch (e: any) {
    console.error(`[Hub] ✗ Upload failed: ${fileName} | ${e.message}`);
    res.status(500).json({ error: 'Upload failed' });
  } finally {
    releaseUploadSlot();
  }
});

export default router;
