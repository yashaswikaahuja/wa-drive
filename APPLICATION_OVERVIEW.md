# CyberControl — Application Overview

> Complete reference for developers picking up this project.

---

## 1. Project Summary

CyberControl is a cybercafe management tool. Its primary feature is a **WhatsApp Inbox**: customers send photos/documents to the cybercafe's WhatsApp number, the system receives them, uploads them to Google Drive, and displays them in a real-time web dashboard where staff can preview, print, download, or process them.

---

## 2. Architecture

```
GCP VM (Worker)              Render (Hub)              Vercel (Frontend)
┌──────────────────┐  WS    ┌──────────────────┐ HTTP ┌──────────────────┐
│  Baileys         │───────▶│  Express +       │◀─────│  React           │
│  WhatsApp Worker │        │  Socket.IO Hub   │      │  Dashboard       │
│  worker.ts       │◀───────│  server.ts       │─────▶│  WhatsAppInbox   │
└──────────────────┘ events └──────────────────┘events└──────────────────┘
        │                           │
        │  POST /api/worker/upload  │  googleapis
        │  (multipart file buffer)  ▼
        └──────────────────▶  Google Drive
                                customers/{phone}/
```

### Services

| Service | URL | Platform | Notes |
|---------|-----|----------|-------|
| Dashboard | https://frontend-pi-ochre-71.vercel.app | Vercel | Auto-deploys from `frontend/` |
| API Hub | https://wa-drive-docker.onrender.com | Render free | Auto-deploys from `backend/` |
| WA Worker | https://wa-worker-u7l6.onrender.com | Render free | Or run on GCP VM |

---

## 3. Repository Structure

```
wa/
├── backend/                    # Express + Socket.IO hub (Render)
│   ├── src/
│   │   ├── server.ts           # Main entry: routes, Socket.IO, Drive upload
│   │   ├── db.ts               # In-memory file index (local fallback)
│   │   ├── api/routes/
│   │   │   ├── whatsapp.routes.ts   # GET /api/whatsapp/status
│   │   │   ├── files.routes.ts      # GET/DELETE /api/files
│   │   │   └── drive.routes.ts      # POST /api/drive/upload (legacy)
│   │   └── types/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── worker/                     # Baileys WhatsApp worker
│   ├── worker.ts               # Main entry: WA client, media handler, hub uploader
│   ├── package.json
│   └── .env.example
│
└── frontend/                   # React dashboard (Vercel)
    ├── src/
    │   ├── pages/
    │   │   └── WhatsAppInboxPage.tsx   # Main inbox page
    │   ├── components/
    │   │   ├── dashboard/
    │   │   │   ├── header.tsx
    │   │   │   ├── file-card.tsx
    │   │   │   ├── files-grid.tsx
    │   │   │   ├── filter-bar.tsx
    │   │   │   └── preview-modal.tsx
    │   │   ├── ui/                     # shadcn/ui primitives
    │   │   └── GoogleDriveLogin.tsx
    │   ├── stores/
    │   │   └── whatsappStore.ts        # Zustand store
    │   ├── services/
    │   │   └── whatsapp.api.ts         # API helpers
    │   └── utils/helpers.ts
    ├── tailwind.config.js
    ├── vite.config.ts
    └── package.json
```

---

## 4. Backend (Hub) — `backend/`

### Tech Stack
- Node.js + TypeScript
- Express 4
- Socket.IO 4
- `googleapis` for Drive
- `multer` for file uploads

### Key File: `backend/src/server.ts`

The entire hub logic lives here. Key sections:

#### Hub State
```ts
let workerConnected = false;
let lastQrCode: string | null = null;
let driveAccessToken: string | null = null;
let workerSocket: any = null;
```

#### Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/drive/token` | Frontend sends Google OAuth token; stored in memory, forwarded to worker |
| `GET` | `/api/drive/files` | Lists all files from Drive `customers/` folder |
| `DELETE` | `/api/drive/files/:id` | Deletes a Drive file |
| `POST` | `/api/worker/upload` | **Main upload endpoint** — worker POSTs file buffer here |
| `POST` | `/api/whatsapp/reinit` | Tells worker to restart Baileys (new QR) |
| `POST` | `/api/whatsapp/logout` | Tells worker to disconnect |
| `GET` | `/api/whatsapp/qr` | Returns last known QR code (base64 PNG) |
| `GET` | `/api/health` | Health check |

#### Worker Upload Endpoint
```ts
app.post('/api/worker/upload', upload.single('file') as any, async (req: any, res: any) => {
  const drive = getDrive(); // uses driveAccessToken
  if (!drive) return res.status(401).json({ error: 'Not connected to Drive' });

  const { phone, senderName, profilePicUrl, mimetype, fileName } = req.body;

  // Create folders: customers/{phone}/
  const customersId = await findOrCreateFolder(drive, 'customers');
  const phoneId     = await findOrCreateFolder(drive, phone, customersId);

  // Upload file
  const file = await drive.files.create({
    requestBody: { name: fileName, parents: [phoneId], description: JSON.stringify({ customerName: senderName, profilePicUrl }) },
    media: { mimeType: mimetype, body: Readable.from(req.file.buffer) },
    fields: 'id,webContentLink',
  });

  // Make public
  await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });

  // Emit to dashboard
  io.emit('new_whatsapp_file', {
    id: file.data.id,
    customerId: phone,
    customerName: senderName,
    fileName,
    fileUrl: `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w200`,
    type: mimeToType(mimetype),
    timestamp: new Date().toISOString(),
    profilePicUrl: profilePicUrl || null,
  });

  res.json({ fileUrl: file.data.webContentLink, fileId: file.data.id });
});
```

#### Socket.IO Events (Hub side)

| Event (received) | From | Action |
|-----------------|------|--------|
| `worker:register` | Worker | Authenticates worker socket, stores reference, sends Drive token |
| `connection:status` | Worker | Updates `workerConnected`, broadcasts to dashboard |
| `new_whatsapp_file` | Worker | Broadcasts to dashboard (legacy path, now hub emits directly after upload) |

| Event (emitted) | To | Payload |
|----------------|-----|---------|
| `connection:status` | Dashboard | `{ connected, qrCode? }` |
| `new_whatsapp_file` | Dashboard | File metadata with Drive URL |
| `drive:token` | Worker | OAuth token string |
| `worker:reinit` | Worker | — |

### Dockerfile
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y ca-certificates --no-install-recommends
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Environment Variables (Render)
| Variable | Value |
|----------|-------|
| `PORT` | Set by Render automatically |
| `WORKER_SECRET` | Shared secret with worker (e.g. `cybercontrol-worker-secret-2024`) |

---

## 5. Worker — `worker/`

### Tech Stack
- Node.js + TypeScript
- `@whiskeysockets/baileys` — WhatsApp Web multi-device (no Chromium)
- `socket.io-client` — connects to hub
- `qrcode` + `qrcode-terminal` — QR display
- `pino` — logger (silent)

### Key File: `worker/worker.ts`

#### Bootstrap
```ts
connectHub();   // connect to Render hub via Socket.IO
startBaileys(); // start WhatsApp client
createServer((_req, res) => res.end('ok')).listen(process.env['PORT'] ?? 3001); // health check
```

#### Hub Connection
```ts
hub = ioClient(HUB_URL, { auth: { secret: WORKER_SECRET }, reconnection: true });
hub.on('connect', () => hub.emit('worker:register', { secret: WORKER_SECRET }));
hub.on('drive:token', (t) => { driveToken = t; });
hub.on('worker:reinit', () => startBaileys());
```

#### Baileys Setup
```ts
const sock = makeWASocket({
  version,
  auth: { creds, keys: makeCacheableSignalKeyStore(keys, logger) },
  logger: pino({ level: 'silent' }),
  browser: ['CyberControl', 'Chrome', '1.0.0'],
  syncFullHistory: false,
});
```

#### QR Code Flow
```ts
sock.ev.on('connection.update', async ({ connection, qr }) => {
  if (qr) {
    qrcodeTerminal.generate(qr, { small: true });
    const qrBase64 = await qrcode.toDataURL(qr);
    hub.emit('connection:status', { connected: false, qrCode: qrBase64 });
  }
  if (connection === 'open') hub.emit('connection:status', { connected: true });
  if (connection === 'close') setTimeout(startBaileys, 5000); // auto-reconnect
});
```

#### Media Handling
```ts
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;
  for (const msg of messages) {
    if (msg.key.fromMe || !msg.message) continue;
    // Check for media
    const hasMedia = !!(msg.message.imageMessage || msg.message.videoMessage || ...);
    if (!hasMedia) continue;

    // Extract phone from JID (always reliable)
    const phone = msg.key.remoteJid.replace(/@s\.whatsapp\.net|@c\.us/g, '');
    const pushName = msg.pushName ?? `Guest ${phone.slice(-4)}`;

    // Download buffer
    const buffer = await downloadMediaMessage(msg, 'buffer', {});

    // POST to hub
    await processMedia(sock, msg, buffer, mimetype, phone, pushName, profilePicUrl);
  }
});
```

#### Upload to Hub
```ts
async function processMedia(...) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype }), fileName);
  form.append('phone', phone);
  form.append('senderName', customerName);
  form.append('mimetype', mimetype);
  form.append('fileName', fileName);
  form.append('profilePicUrl', profilePicUrl ?? '');

  const res = await fetch(`${HUB_URL}/api/worker/upload`, { method: 'POST', body: form });
  const { fileId, fileUrl } = await res.json();
  // Hub handles Drive upload and emits new_whatsapp_file to dashboard
}
```

#### Phone Number Resolution
Always use `msg.key.remoteJid` — it contains the real E.164 number:
```ts
const phone = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^0-9+]/g, '');
// e.g. "919006615450@s.whatsapp.net" → "919006615450"
```
**Do NOT use `contact.number`** — it may return `@lid` values like `140583356072067`.

#### Auth Persistence
Baileys saves session to `worker/auth_info/` via `useMultiFileAuthState`. On Render free tier this is wiped on restart (no persistent disk). On GCP VM it persists across restarts.

### Environment Variables (Worker)
| Variable | Description |
|----------|-------------|
| `HUB_URL` | `https://wa-drive-docker.onrender.com` |
| `WORKER_SECRET` | Must match hub's `WORKER_SECRET` |
| `DRIVE_ACCESS_TOKEN` | Optional — Drive token if not using hub relay |

### Running on GCP VM
```bash
ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239
cd /opt/whatsapp-worker/worker
npm install
pm2 start npm --name whatsapp-worker -- start
pm2 save
```

---

## 6. Frontend — `frontend/`

### Tech Stack
- React 18 + TypeScript
- Vite
- Tailwind CSS v3
- shadcn/ui components (Button, Badge, Input, Dialog, DropdownMenu)
- Ant Design 5 (legacy, being phased out)
- Zustand (state management)
- Socket.IO client
- `date-fns`, `lucide-react`, `dayjs`

### Key Page: `WhatsAppInboxPage.tsx`

#### Socket.IO Connection
```ts
const socket = io(SOCKET_URL);
socket.on('connection:status', (s) => {
  setConnected(s.connected);
  setQrCode(s.connected ? null : s.qrCode ?? null);
});
socket.on('new_whatsapp_file', (file) => {
  addFile(file);
  notification.success({ message: 'New file received' });
});
```

#### QR Polling (fallback)
Polls `/api/whatsapp/qr` every 2s when QR is shown, 5s otherwise. Handles cases where Socket.IO event is missed.

#### File Display
Files are shown in a responsive grid (2–6 columns). Each card shows:
- Thumbnail (image) or type icon (video/audio/PDF)
- Filename, customer name, phone, relative time
- Actions: Download, Print, Delete (hover overlay)
- Click → opens `PreviewModal`

### `PreviewModal`
Supports in-browser preview:
| Type | Renderer |
|------|----------|
| Image | `<img>` with contain fit |
| Video | Google Drive iframe (`/file/d/ID/preview`) |
| Audio | `<audio controls>` with Drive download URL |
| PDF | Google Drive iframe viewer |
| Other | Download button |

Keyboard: `←` `→` navigate, `Esc` close.

### Zustand Store (`whatsappStore.ts`)
```ts
interface WhatsAppState {
  files: WhatsAppFile[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  setFiles, addFile, removeFile, setConnected, setLoading, setError
}
// Persisted via localStorage (files not persisted — always reloaded from Drive)
```

### Google Drive Login (`GoogleDriveLogin.tsx`)
Uses `@react-oauth/google`. On success:
```ts
const { access_token } = useGoogleLogin response;
await axios.post(`${API_BASE_URL}/drive/token`, { accessToken: access_token });
```
Token stored on hub in memory. Hub forwards it to worker via `drive:token` socket event.

### Environment Variables (Vercel)
| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://wa-drive-docker.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://wa-drive-docker.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |

### Preview URL Helper
```ts
export function getPreviewUrl(fileUrl: string): string {
  if (fileUrl.includes('drive.google.com/thumbnail')) return fileUrl;
  const driveMatch = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/thumbnail?sz=w200&id=${driveMatch[1]}`;
  if (fileUrl.startsWith('/uploads/')) return `${BACKEND_BASE_URL}${fileUrl}`;
  return fileUrl;
}
```

---

## 7. Google Drive Integration

### OAuth Flow
1. User clicks "Google Drive" in dashboard
2. Google OAuth popup opens, user signs in
3. Frontend receives `access_token`
4. Frontend POSTs to `POST /api/drive/token`
5. Hub stores token in memory, forwards to worker via socket

### Drive Folder Structure
```
My Drive/
└── customers/
    └── {phone}/          e.g. 919006615450/
        ├── photo_001.jpg
        ├── video_002.mp4
        └── doc_003.pdf
```

### File Permissions
All uploaded files are set to `anyone with link can view`:
```ts
await drive.permissions.create({
  fileId,
  requestBody: { role: 'reader', type: 'anyone' },
});
```

### Thumbnail URLs
For display in dashboard:
```
https://drive.google.com/thumbnail?id=FILE_ID&sz=w200
```
For full preview (images):
```
https://drive.google.com/thumbnail?id=FILE_ID&sz=w800
```
For video/PDF embed:
```
https://drive.google.com/file/d/FILE_ID/preview
```

---

## 8. Keep-Alive (GitHub Actions)

Render free tier sleeps after 15 min of inactivity. A GitHub Actions workflow pings both services every 14 minutes:

`.github/workflows/keep-render-awake.yml`:
```yaml
on:
  schedule:
    - cron: '*/14 * * * *'
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl --fail --silent "https://wa-drive-docker.onrender.com/api/health"
      - run: curl --fail --silent "https://wa-worker-u7l6.onrender.com"
```

**Note:** Render free tier still wipes ephemeral storage on restart. WhatsApp session (`auth_info/`) is lost. Run the worker on GCP VM for persistent sessions.

---

## 9. GCP VM Details

| Property | Value |
|----------|-------|
| Name | `whatsapp-worker` |
| Zone | `us-central1-f` |
| Machine | `e2-micro` |
| Disk | 30 GB standard persistent |
| OS | Debian 12 |
| External IP | Static (promoted) |
| SSH | `ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239` |
| Worker path | `/opt/whatsapp-worker/worker` |
| Process manager | PM2 (`pm2 list`, `pm2 restart whatsapp-worker`) |

---

## 10. Known Issues & Gotchas

| Issue | Status | Fix |
|-------|--------|-----|
| `@lid` phone numbers | Fixed | Use `msg.key.remoteJid`, not `contact.number` |
| Render free tier sleep | Mitigated | GitHub Actions keep-alive pings |
| Auth session lost on Render restart | Known | Run worker on GCP VM with PM2 |
| Drive token lost on hub restart | Known | User must re-login via dashboard after hub restart |
| `update_failed` on Render worker | False alarm | Worker has no HTTP health check port; process runs fine |

---

## 11. Local Development

### Hub
```bash
cd backend
npm install
npm run dev   # tsc + node dist/server.js
```

### Worker
```bash
cd worker
npm install
cp .env.example .env
# Set HUB_URL=http://localhost:3000
npm start     # tsx worker.ts
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # vite dev server on :5173
```

---

## 12. Deployment

### Hub (Render)
- Push to `master` → Render auto-deploys `backend/` via Docker
- Dockerfile: `node:20-slim`, no Chromium, ~50 MB image

### Worker (Render or GCP)
- **Render:** Push to `master` → auto-deploys `worker/` as Node service. QR appears in logs. Session lost on restart.
- **GCP VM:** SSH in, `git pull`, `npm install`, `pm2 restart whatsapp-worker`. Session persists.

### Frontend (Vercel)
```bash
cd frontend
npx vercel --prod --yes
```
Or push to `master` — Vercel auto-deploys if connected.
