import express from 'express';
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import multer from 'multer';
import { Readable } from 'stream';
import sharp from 'sharp';
import whatsappRoutes from './api/routes/whatsapp.routes.js';
import filesRoutes from './api/routes/files.routes.js';
import processRoutes from './api/routes/process.routes.js';
import profilesRoutes from './api/routes/profiles.routes.js';
import mappingsRoutes from './api/routes/mappings.routes.js';
import adaptersRoutes from './api/routes/adapters.routes.js';
const WORKER_SECRET = process.env['WORKER_SECRET'] ?? 'worker-secret';
const PORT = Number(process.env['PORT'] ?? 3000);
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    next();
});
app.use(express.json());
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/process', processRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/mappings', mappingsRoutes);
app.get('/api/adapters/validate', async (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  if (_validating) return res.json({ error: 'already running' });
  _validating = true;
  try {
    const adapters = _getAllAdapters();
    const results = [];
    for (const a of adapters) { results.push(await _validateOne(a)); }
    res.json({ total: results.length, ok: results.filter(r=>r.status==='ok').length, stale: results.filter(r=>r.status==='stale').length, error: results.filter(r=>r.status==='error').length, results });
  } catch(e) { res.status(500).json({ error: e.message }); }
  finally { _validating = false; }
});

app.get('/api/adapters/validate/:hostname/:componentClass', async (req, res) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  const adapter = _getAllAdapters().find(a => a.hostname === req.params.hostname && a.componentClass === req.params.componentClass);
  if (!adapter) return res.status(404).json({ error: 'not found' });
  try { res.json(await _validateOne(adapter)); } catch(e) { res.status(500).json({ error: e.message }); }
});

// Optional daily scheduler
if (process.env.ENABLE_AUTO_VALIDATION === 'true') {
  const _valInterval = parseInt(process.env.VALIDATION_INTERVAL_MS || '86400000');
  setInterval(async () => {
    if (_validating) return;
    _validating = true;
    console.log('[CC] scheduled validation starting...');
    try { for (const a of _getAllAdapters()) { const r = await _validateOne(a); console.log('[CC] validate', a.hostname, r.status); } }
    catch(e) { console.error('[CC] scheduled validation error:', e.message); }
    finally { _validating = false; }
  }, _valInterval);
  console.log('[CC] validation scheduler started, interval:', _valInterval + 'ms');
}

// ── Hub state ────────────────────────────────────────────────────────────────
let workerConnected = false;
let lastQrCode = null;
let driveAccessToken = null;
let workerSocket = null;
export function getHubStatus() { return { connected: workerConnected, qrCode: lastQrCode }; }
// ── Drive helpers ────────────────────────────────────────────────────────────
function getDrive() {
    if (!driveAccessToken)
        return null;
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: driveAccessToken });
    return google.drive({ version: 'v3', auth });
}

app.use('/api/adapters', adaptersRoutes);

// ── Adapter Validation (Playwright) ──────────────────────────────────────────
import { chromium } from 'playwright-core';
const CHROMIUM_PATH = '/usr/bin/chromium';
const ADMIN_TOKEN = process.env.WORKER_SECRET || 'cybercontrol-worker-secret-2024';
let _validating = false;

function _getAllAdapters() {
  try {
    const raw = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../data/adapters.json'), 'utf8'));
    const result = [];
    for (const [hostname, components] of Object.entries(raw)) {
      for (const [componentClass, adapter] of Object.entries(components)) {
        result.push({ hostname, componentClass, ...adapter });
      }
    }
    return result;
  } catch { return []; }
}

function _markAdapterStale(hostname, componentClass, stale) {
  try {
    const fp = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/adapters.json');
    const raw = JSON.parse(readFileSync(fp, 'utf8'));
    if (raw[hostname]?.[componentClass]) {
      raw[hostname][componentClass].stale = stale;
      raw[hostname][componentClass].lastValidatedAt = new Date().toISOString();
      writeFileSync(fp, JSON.stringify(raw, null, 2));
    }
  } catch {}
}

async function _validateOne(adapter) {
  const url = 'https://' + adapter.hostname;
  const result = { hostname: adapter.hostname, componentClass: adapter.componentClass, status: 'unknown', detail: '' };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'], timeout: 20000 });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const triggerCount = await page.locator(adapter.triggerSelector).count();
    const compCount = await page.locator('div.' + adapter.componentClass).count();
    if (triggerCount === 0 || compCount === 0) {
      result.status = 'stale';
      result.detail = triggerCount === 0 ? 'triggerSelector not found' : 'componentClass not found';
      _markAdapterStale(adapter.hostname, adapter.componentClass, true);
    } else {
      result.status = 'ok';
      result.detail = 'selectors found on page';
      _markAdapterStale(adapter.hostname, adapter.componentClass, false);
    }
  } catch (e) {
    result.status = 'error';
    result.detail = e.message.slice(0, 150);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return result;
}

async function findOrCreateFolder(drive, name, parentId) {
    const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
    const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
    if (res.data.files?.length)
        return res.data.files[0].id;
    const f = await drive.files.create({
        requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId ?? 'root'] },
        fields: 'id',
    });
    return f.data.id;
}
function mimeToType(mime) {
    if (mime.startsWith('image/'))
        return 'photo';
    if (mime.startsWith('video/'))
        return 'video';
    if (mime.startsWith('audio/'))
        return 'audio';
    if (mime === 'application/pdf')
        return 'document';
    return 'file';
}
// ── Routes ───────────────────────────────────────────────────────────────────
app.post('/api/drive/token', (req, res) => {
    const { accessToken } = req.body;
    driveAccessToken = accessToken ?? null;
    app.locals.driveAccessToken = driveAccessToken;
    workerSocket?.emit('drive:token', driveAccessToken);
    res.json({ ok: true });
});
app.delete('/api/drive/files/:fileId', async (req, res) => {
    const drive = getDrive();
    if (!drive) {
        res.status(401).json({ error: 'Not connected to Drive' });
        return;
    }
    try {
        await drive.files.delete({ fileId: req.params.fileId });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: 'Failed to delete' });
    }
});
app.get('/api/drive/files', async (_req, res) => {
    const drive = getDrive();
    if (!drive) {
        res.json([]);
        return;
    }
    try {
        const folderRes = await drive.files.list({
            q: `name='customers' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
            fields: 'files(id)', pageSize: 1,
        });
        const customersId = folderRes.data.files?.[0]?.id;
        if (!customersId) {
            res.json([]);
            return;
        }
        const subfoldersRes = await drive.files.list({
            q: `'${customersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id,name)',
        });
        const allFiles = [];
        for (const folder of subfoldersRes.data.files ?? []) {
            const r = await drive.files.list({
                q: `'${folder.id}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
                fields: 'files(id,name,description,createdTime)',
                orderBy: 'createdTime desc', pageSize: 50,
            });
            for (const f of r.data.files ?? []) {
                if (!f.name || !f.id)
                    continue;
                let meta = {};
                try {
                    meta = JSON.parse(f.description ?? '{}');
                }
                catch { /* ignore */ }
                allFiles.push({
                    id: f.id, customerId: folder.name,
                    customerName: meta.customerName ?? `Guest ${(folder.name ?? '').slice(-4)}`,
                    fileName: f.name,
                    fileUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w200`,
                    profilePicUrl: meta.profilePicUrl ?? null,
                    timestamp: f.createdTime,
                });
            }
        }
        allFiles.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        res.json(allFiles);
    }
    catch {
        res.json([]);
    }
});
// ── Worker file upload ────────────────────────────────────────────────────────
// Memory storage but limit file size to 50MB to prevent OOM
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});
// Concurrency limiter — only 1 Drive upload at a time on e2-micro (1GB RAM)
let hubUploadActive = 0;
const hubUploadQueue = [];
const HUB_UPLOAD_CONCURRENCY = 1;
function acquireUploadSlot() {
    return new Promise(resolve => {
        if (hubUploadActive < HUB_UPLOAD_CONCURRENCY) {
            hubUploadActive++;
            resolve();
        }
        else
            hubUploadQueue.push(resolve);
    });
}
function releaseUploadSlot() {
    const next = hubUploadQueue.shift();
    if (next) {
        next();
    }
    else {
        hubUploadActive--;
    }
}
app.post('/api/worker/upload', upload.single('file'), async (req, res) => {
    const drive = getDrive();
    if (!drive) {
        res.status(401).json({ error: 'Not connected to Drive' });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: 'No file' });
        return;
    }
    const { phone, senderName, profilePicUrl, mimetype, fileName } = req.body;
    const fileSize = req.file.size;
    console.log(`[Hub] Upload queued: ${fileName} (${(fileSize / 1024).toFixed(0)}KB) from ${phone}`);
    // ── Sharp image validation ──────────────────────────────────────────────────
    // Validate image buffers before uploading to Drive.
    // Non-image files (PDF, audio, video) are passed through without validation.
    if (mimetype.startsWith('image/')) {
        if (!req.file.buffer || req.file.buffer.length < 100) {
            console.error(`[Hub] ✗ Rejected ${fileName} — buffer empty or too small (${req.file.buffer?.length ?? 0} bytes)`);
            res.status(400).json({ error: 'Invalid image: buffer empty or too small' });
            return;
        }
        try {
            const meta = await sharp(req.file.buffer).metadata();
            if (!meta.width || !meta.height) {
                console.error(`[Hub] ✗ Rejected ${fileName} — Sharp could not read image dimensions`);
                res.status(400).json({ error: 'Invalid image: cannot read dimensions' });
                return;
            }
            console.log(`[Hub] ✓ Image valid: ${fileName} (${meta.width}x${meta.height} ${meta.format})`);
        }
        catch (sharpErr) {
            console.error(`[Hub] ✗ Rejected ${fileName} — Sharp error: ${sharpErr.message}`);
            res.status(400).json({ error: `Invalid image: ${sharpErr.message}` });
            return;
        }
    }
    await acquireUploadSlot();
    try {
        console.log(`[Hub] Uploading: ${fileName}`);
        const customersId = await findOrCreateFolder(drive, 'customers');
        const phoneId = await findOrCreateFolder(drive, phone, customersId);
        // Stream buffer to Drive — don't hold reference after upload
        const buffer = req.file.buffer;
        const file = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [phoneId],
                description: JSON.stringify({ customerName: senderName, profilePicUrl: profilePicUrl || null }),
            },
            media: { mimeType: mimetype, body: Readable.from(buffer) },
            fields: 'id,webContentLink',
        });
        // Release buffer from memory immediately
        req.file.buffer = null;
        const fileId = file.data.id;
        await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
        console.log(`[Hub] ✓ Uploaded: ${fileName} → ${fileId}`);
        io.emit('new_whatsapp_file', {
            id: fileId,
            customerId: phone,
            customerName: senderName,
            phoneNumber: phone,
            fileName,
            fileUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`,
            type: mimeToType(mimetype),
            size: fileSize,
            timestamp: new Date().toISOString(),
            profilePicUrl: profilePicUrl || null,
        });
        res.json({ fileUrl: file.data.webContentLink, fileId });
    }
    catch (e) {
        console.error(`[Hub] ✗ Upload failed: ${fileName} | ${e.message}`);
        res.status(500).json({ error: 'Upload failed' });
    }
    finally {
        releaseUploadSlot();
    }
});
// ── Background removal proxy ────────────────────────────────────────────
const bgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
async function downloadDriveBuffer(fileId, accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
}
app.post('/api/remove-bg', (req, res, next) => {
    // If JSON body (fileId), skip multer and parse as JSON
    if (req.headers['content-type']?.includes('application/json')) {
        express.json()(req, res, next);
    }
    else {
        bgUpload.single('image_file')(req, res, next);
    }
}, async (req, res) => {
    const REMOVE_BG_KEY = process.env['REMOVE_BG_API_KEY'] ?? 'd9f7QFfqAdFuEzt1dXNqvSxP';
    let imageBuffer;
    let filename = 'image.jpg';
    try {
        if (req.file) {
            imageBuffer = req.file.buffer;
            filename = req.file.originalname ?? filename;
        }
        else if (req.body?.fileId) {
            const { driveAccessToken } = req.app.locals;
            if (!driveAccessToken) {
                res.status(401).json({ error: 'Not connected to Google Drive' });
                return;
            }
            imageBuffer = await downloadDriveBuffer(req.body.fileId, driveAccessToken);
            filename = req.body.fileName ?? filename;
        }
        else {
            res.status(400).json({ error: 'Provide image_file (multipart) or fileId (JSON)' });
            return;
        }
        if (!imageBuffer || imageBuffer.length < 100) {
            res.status(400).json({ error: 'Image buffer empty or too small' });
            return;
        }
        const FormDataNode = (await import('form-data')).default;
        const https = (await import('https')).default;
        const form = new FormDataNode();
        form.append('image_file', imageBuffer, { filename, contentType: 'image/jpeg' });
        form.append('size', 'auto');
        const buf = await new Promise((resolve, reject) => {
            const req2 = https.request({
                hostname: 'api.remove.bg', path: '/v1.0/removebg', method: 'POST',
                headers: { 'X-Api-Key': REMOVE_BG_KEY, ...form.getHeaders() },
            }, (r) => {
                const chunks = [];
                r.on('data', (c) => chunks.push(c));
                r.on('end', () => {
                    const body = Buffer.concat(chunks);
                    if (r.statusCode !== 200)
                        reject(new Error('remove.bg: ' + body.toString()));
                    else
                        resolve(body);
                });
            });
            req2.on('error', reject);
            form.pipe(req2);
        });
        res.set('Content-Type', 'image/png');
        res.send(buf);
    }
    catch (e) {
        console.error('[Hub] remove-bg failed:', e.message);
        res.status(500).json({ error: e.message ?? 'Background removal failed' });
    }
});
app.post('/api/whatsapp/reinit', (_req, res) => {
    lastQrCode = null;
    workerSocket?.emit('worker:reinit');
    res.json({ ok: true });
});
app.post('/api/whatsapp/logout', (_req, res) => {
    workerSocket?.emit('worker:logout');
    workerConnected = false;
    lastQrCode = null;
    res.json({ ok: true });
});
app.get('/api/whatsapp/qr', (_req, res) => res.json({ qrCode: lastQrCode }));

const INBOX_DIR = '/opt/cybercontrol-hub/inbox';
if (!existsSync(INBOX_DIR)) mkdirSync(INBOX_DIR, { recursive: true });
const inboxUpload = multer({ dest: INBOX_DIR });

app.get('/inbox', (_req, res) => res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Inbox</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#f5f5f5;padding:16px}
h2{margin-bottom:12px;color:#333}
textarea{width:100%;height:140px;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;resize:vertical}
input[type=file]{margin:8px 0;display:block}
button{background:#2563eb;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:15px;cursor:pointer;margin-top:8px}
button:hover{background:#1d4ed8}
#status{margin-top:10px;color:#16a34a;font-weight:bold}
.msg{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px}
.msg .meta{font-size:11px;color:#888;margin-bottom:4px}
.msg img{max-width:100%;border-radius:4px;margin-top:6px}
</style></head>
<body>
<h2>📥 Inbox</h2>
<textarea id="txt" placeholder="Paste text here..."></textarea>
<input type="file" id="file" accept="image/*,.pdf,.txt,.json,.md">
<button onclick="send()">Send to GCP</button>
<div id="status"></div>
<hr style="margin:16px 0">
<div id="msgs"></div>
<script>
async function send(){
  const txt=document.getElementById('txt').value;
  const file=document.getElementById('file').files[0];
  const fd=new FormData();
  if(txt) fd.append('text',txt);
  if(file) fd.append('file',file);
  if(!txt&&!file) return;
  document.getElementById('status').textContent='Sending...';
  const r=await fetch('/inbox/send',{method:'POST',body:fd});
  const j=await r.json();
  document.getElementById('status').textContent=j.ok?'✓ Sent!':'Error: '+j.error;
  document.getElementById('txt').value='';
  document.getElementById('file').value='';
  loadMsgs();
}
async function loadMsgs(){
  const r=await fetch('/inbox/list');
  const msgs=await r.json();
  document.getElementById('msgs').innerHTML=msgs.map(m=>\`<div class="msg">
    <div class="meta">\${m.time}</div>
    \${m.text?'<div>'+m.text.replace(/</g,'&lt;')+'</div>':''}
    \${m.file?'<div>📎 '+m.file+'</div>':''}
    \${m.isImage?'<img src="/inbox/file/'+m.id+'">':''}
  </div>\`).join('');
}
loadMsgs();
setInterval(loadMsgs,5000);
</script></body></html>`));

app.post('/inbox/send', inboxUpload.single('file'), (req, res) => {
  const id = Date.now().toString();
  const entry = { id, time: new Date().toISOString(), text: req.body.text || '', file: '', isImage: false };
  if (req.file) {
    const ext = req.file.originalname.split('.').pop();
    const dest = `${INBOX_DIR}/${id}.${ext}`;
    renameSync(req.file.path, dest);
    entry.file = req.file.originalname;
    entry.isImage = /^(jpg|jpeg|png|gif|webp)$/i.test(ext);
    entry.filePath = `${id}.${ext}`;
  }
  const logFile = `${INBOX_DIR}/messages.json`;
  const msgs = existsSync(logFile) ? JSON.parse(readFileSync(logFile,'utf8')) : [];
  msgs.unshift(entry);
  writeFileSync(logFile, JSON.stringify(msgs.slice(0,50), null, 2));
  res.json({ ok: true, id });
});

app.get('/inbox/list', (_req, res) => {
  const logFile = `${INBOX_DIR}/messages.json`;
  res.json(existsSync(logFile) ? JSON.parse(readFileSync(logFile,'utf8')) : []);
});

app.get('/inbox/file/:id', (req, res) => {
  const logFile = `${INBOX_DIR}/messages.json`;
  const msgs = existsSync(logFile) ? JSON.parse(readFileSync(logFile,'utf8')) : [];
  const m = msgs.find(x => x.id === req.params.id.split('.')[0]);
  if (m?.filePath) res.sendFile(`${INBOX_DIR}/${m.filePath}`);
  else res.status(404).end();
});

app.get('/inbox/latest', (_req, res) => {
  const logFile = `${INBOX_DIR}/messages.json`;
  const msgs = existsSync(logFile) ? JSON.parse(readFileSync(logFile,'utf8')) : [];
  res.json(msgs[0] || null);
});


// ── FormSession observability endpoints ──────────────────────────────────────
const SESSIONS_FILE = '/opt/cybercontrol-hub/backend/data/sessions.json';
function loadSessions() { return existsSync(SESSIONS_FILE) ? JSON.parse(readFileSync(SESSIONS_FILE,'utf8')) : []; }
function saveSessions(s) { writeFileSync(SESSIONS_FILE, JSON.stringify(s.slice(-500), null, 2)); } // keep last 500

app.post('/api/sessions', (req, res) => {
  const session = { ...req.body, id: Date.now().toString(36), receivedAt: new Date().toISOString() };
  const sessions = loadSessions();
  sessions.unshift(session);
  saveSessions(sessions);
  res.json({ ok: true, id: session.id });
});

app.get('/api/sessions', (_req, res) => res.json(loadSessions().slice(0, 50)));


// ── Corrections (operator supervision signal) ──────────────────────────────
const correctionsPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/data/corrections.json');
function loadCorrections() { try { return JSON.parse(readFileSync(correctionsPath, 'utf8')); } catch { return []; } }
function saveCorrections(d) { writeFileSync(correctionsPath, JSON.stringify(d, null, 2)); }

app.post('/api/corrections', (req, res) => {
  const record = { ...req.body, id: Date.now().toString(36), receivedAt: new Date().toISOString() };
  const corrections = loadCorrections();
  corrections.unshift(record);
  if (corrections.length > 500) corrections.length = 500;
  saveCorrections(corrections);
  res.json({ ok: true, id: record.id });
});

app.get('/api/corrections', (_req, res) => res.json(loadCorrections().slice(0, 100)));

app.get('/api/sessions/stats', (_req, res) => {
  const sessions = loadSessions();
  const byHostname = {};
  sessions.forEach(s => {
    const h = s.hostname || 'unknown';
    if (!byHostname[h]) byHostname[h] = { sessions: 0, totalFilled: 0, totalFailed: 0 };
    byHostname[h].sessions++;
    byHostname[h].totalFilled += s.totalFilled || 0;
    byHostname[h].totalFailed += s.totalFailed || 0;
  });
  res.json(byHostname);
});


// ── Async Teaching endpoints ─────────────────────────────────────────────────
const TEACHING_FILE = '/opt/cybercontrol-hub/backend/data/teaching_pending.json';
function loadTeaching() { return existsSync(TEACHING_FILE) ? JSON.parse(readFileSync(TEACHING_FILE,'utf8')) : []; }
function saveTeaching(t) { writeFileSync(TEACHING_FILE, JSON.stringify(t.slice(-200), null, 2)); }

app.post('/api/teaching/pending', (req, res) => {
  const tasks = loadTeaching();
  const task = { ...req.body, id: Date.now().toString(36), createdAt: new Date().toISOString(), status: 'pending' };
  tasks.unshift(task);
  saveTeaching(tasks);
  res.json({ ok: true, id: task.id });
});

app.get('/api/teaching/pending', (_req, res) => {
  res.json(loadTeaching().filter(t => t.status === 'pending'));
});

app.post('/api/teaching/complete', (req, res) => {
  const tasks = loadTeaching();
  const task = tasks.find(t => t.id === req.body.id);
  if (task) { task.status = 'completed'; task.completedAt = new Date().toISOString(); task.adapter = req.body.adapter; }
  saveTeaching(tasks);
  res.json({ ok: true });
});


// ── Widget Profile endpoints ─────────────────────────────────────────────────
const WIDGETS_FILE = '/opt/cybercontrol-hub/backend/data/widget_profiles.json';
function loadWidgets() { return existsSync(WIDGETS_FILE) ? JSON.parse(readFileSync(WIDGETS_FILE,'utf8')) : {}; }
function saveWidgets(w) { writeFileSync(WIDGETS_FILE, JSON.stringify(w, null, 2)); }

app.get('/api/widgets', (_req, res) => res.json(loadWidgets()));

app.get('/api/widgets/:family', (req, res) => {
  const widgets = loadWidgets();
  res.json(widgets[req.params.family] || null);
});

app.post('/api/widgets/:family', (req, res) => {
  const widgets = loadWidgets();
  widgets[req.params.family] = { ...req.body, family: req.params.family, updatedAt: new Date().toISOString() };
  saveWidgets(widgets);
  res.json({ ok: true });
});


// ── /api/ai/plan — Provider-independent AI boundary ────────────────────────
// Schema: EXECUTION_SCHEMA v1.0
// Request: { schemaVersion, observation: {fields, profile, formKey, hostname}, mode: "plan"|"step", provider: "groq"|"local" }
// Response: { actions: [{type, target, value}], confidence, provider, reasoningId }
app.post('/api/ai/plan', async (req, res) => {
  const { schemaVersion, observation, mode, provider, apiKey } = req.body;
  if (!observation || !observation.fields || !observation.profile) {
    return res.status(400).json({ error: 'Missing observation.fields or observation.profile' });
  }
  const providerName = provider || 'groq';
  try {
    if (providerName === 'groq') {
      const key = apiKey || process.env.GROQ_API_KEY;
      if (!key) return res.status(400).json({ error: 'No API key for groq provider' });
      // Build prompt from observation
      const fields = observation.fields;
      const profile = observation.profile;
      const fieldList = fields.map(f => `- ${f.label} (type: ${f.type}, selector: ${f.selector})`).join('\n');
      const profileKeys = Object.entries(profile).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
      const messages = [
        { role: 'system', content: 'You are a form-filling assistant. Given form fields and a user profile, return a JSON array of actions. Use ONLY these action types: fill_text, select_option, skip. Return ONLY valid JSON array, no explanation.\n\nRules:\n- If field label contains name and profile has full name, split into first/last if needed\n- For DOB fields: use dd/mm/yyyy or split into day/month/year\n- Skip fields with no matching profile data\n- Skip captcha, OTP, password fields\n- Each action: {"type":"fill_text"|"select_option"|"skip","target":"<selector>","value":"<value>","reason":"<why>"}' },
        { role: 'user', content: `Form: ${observation.hostname || 'unknown'} (${observation.formKey || ''})\n\nFields:\n${fieldList}\n\nProfile:\n${profileKeys}\n\nReturn JSON array of actions.` }
      ];
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', messages, max_tokens: 2000, temperature: 0.1 })
      });
      const groqData = await groqRes.json();
      const content = groqData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return res.json({ actions: [], confidence: 0, provider: 'groq', error: 'no-json-in-response', reasoningId: Date.now().toString(36) });
      const actions = JSON.parse(jsonMatch[0]);
      const VALID_TYPES = ['fill_text', 'select_option', 'click_dropdown', 'click_option', 'click_button', 'scroll_to', 'wait', 'skip'];
      const validated = actions.filter(a => VALID_TYPES.includes(a.type));
      return res.json({
        actions: validated,
        confidence: validated.length / Math.max(actions.length, 1),
        provider: 'groq',
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        schemaVersion: '1.0',
        mode: mode || 'plan',
        reasoningId: Date.now().toString(36)
      });
    } else if (providerName === 'local') {
      // Future: local model endpoint
      return res.json({ actions: [], confidence: 0, provider: 'local', error: 'local provider not configured', reasoningId: Date.now().toString(36) });
    } else {
      return res.status(400).json({ error: `Unknown provider: ${providerName}` });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, provider: providerName });
  }
});


// ── /api/training/episodes — Convert runtime traces into trainable episodes ──
app.get('/api/training/episodes', (_req, res) => {
  const sessions = loadSessions();
  const corrections = loadCorrections();
  const corrByHost = {};
  for (const batch of corrections) {
    const key = batch.hostname + '|' + (batch.semanticFormKey || '');
    if (!corrByHost[key]) corrByHost[key] = [];
    corrByHost[key].push(...(batch.corrections || []));
  }
  const episodes = sessions.slice(0, 100).map(session => {
    const key = session.hostname + '|' + (session.semanticFormKey || '');
    const sessionCorrections = corrByHost[key] || [];
    const steps = (session.records || []).map(r => ({
      observation: { selector: r.selector, type: r.type },
      action: {
        type: r.strategy && r.strategy.startsWith('plugin:') ? r.strategy.replace('plugin:','') : (r.type === 'ng-dropdown' ? 'click_dropdown' : r.type === 'select' ? 'select_option' : 'fill_text'),
        target: r.selector,
        value: r.value
      },
      result: { outcome: r.result, failReason: r.failReason || null, durationMs: r.durationMs || 0 },
      reward: r.result === 'filled' ? 1.0 : r.result === 'skipped' ? 0.0 : -0.5,
      plugin: r.plugin || null,
      strategy: r.strategy || null
    }));
    const supervisionSignals = sessionCorrections.map(c => ({
      field: c.field, selector: c.selector, semanticKey: c.semanticKey,
      autofilledValue: c.autofilledValue, operatorValue: c.finalOperatorValue,
      correctionType: c.correctionType, trigger: c.trigger
    }));
    return {
      schemaVersion: '1.0', episodeId: session.id, hostname: session.hostname,
      semanticFormKey: session.semanticFormKey || '', runtimeVersion: session.runtimeVersion,
      totalFilled: session.totalFilled, totalFailed: session.totalFailed,
      steps, corrections: supervisionSignals, hasCorrections: supervisionSignals.length > 0,
      timestamp: session.receivedAt
    };
  });
  res.json({ schemaVersion: '1.0', totalEpisodes: episodes.length, episodes });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    // Auto-register worker if auth secret matches (handles cases where worker:register event is lost)
    if (socket.handshake.auth?.secret === WORKER_SECRET) {
        workerSocket = socket;
        workerConnected = false;
        console.log('[Hub] Worker auto-registered via auth');
        if (driveAccessToken)
            socket.emit('drive:token', driveAccessToken);
    }
    socket.on('worker:register', ({ secret }) => {
        if (secret !== WORKER_SECRET) {
            socket.disconnect();
            return;
        }
        workerSocket = socket;
        console.log('[Hub] Worker registered');
        if (driveAccessToken)
            socket.emit('drive:token', driveAccessToken);
    });
    socket.on('connection:status', (payload) => {
        workerConnected = payload.connected;
        if (payload.connected)
            lastQrCode = null;
        else if (payload.qrCode)
            lastQrCode = payload.qrCode;
        io.emit('connection:status', payload);
    });
    socket.on('new_whatsapp_file', (file) => {
        io.emit('new_whatsapp_file', file);
    });
    // Forward upload queue events to dashboard
    socket.on('upload:queued', (d) => io.emit('upload:queued', d));
    socket.on('upload:start', (d) => io.emit('upload:start', d));
    socket.on('upload:done', (d) => io.emit('upload:done', d));
    socket.on('upload:fail', (d) => io.emit('upload:fail', d));
    socket.emit('connection:status', { connected: workerConnected, ...(lastQrCode ? { qrCode: lastQrCode } : {}) });
    socket.on('disconnect', () => {
        if (socket === workerSocket) {
            workerSocket = null;
            workerConnected = false;
            console.log('[Hub] Worker disconnected');
            io.emit('connection:status', { connected: false });
        }
    });
});
// Extension update endpoints
function getExtensionVersion() {
    try {
        const manifest = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../extension/manifest.json'), 'utf8'));
        return manifest.version;
    }
    catch {
        return '0.0';
    }
}
// Debug form capture endpoint
let _lastFormCapture = null;
app.post('/api/debug/form', (req, res) => {
  _lastFormCapture = { ...req.body, receivedAt: new Date().toISOString() };
  console.log('[DEBUG] form capture from:', req.body.url, 'fields:', req.body.formFields?.length, 'dropdowns:', req.body.dropdowns?.length);
  res.json({ ok: true });
});
app.get('/api/debug/form', (_req, res) => {
  res.json(_lastFormCapture || { error: 'no capture yet' });
});
app.get('/api/diagnose.js', (_req, res) => { res.setHeader('Content-Type','application/javascript'); res.sendFile('/opt/cybercontrol-hub/tests/diagnose.js'); });
app.get('/api/extension/version', (req, res) => {
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ version: getExtensionVersion(), download_url: `${base}/api/extension/download` });
});
app.get('/api/extension/download', (_req, res) => {
    const zipPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../extension.zip');
    res.download(zipPath, 'cybercontrol-autofill.zip');
});
httpServer.listen(PORT, () => console.log(`[Hub] Running on http://localhost:${PORT}`));
process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
//# sourceMappingURL=server.js.map