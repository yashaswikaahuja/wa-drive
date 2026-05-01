# CyberControl — WhatsApp Inbox

A cybercafe management tool that receives files sent by customers via WhatsApp, uploads them to Google Drive, and displays them in a real-time dashboard.

## Architecture

```
GCP VM (Worker)          Render (Hub)           Vercel (Frontend)
┌─────────────┐   WS    ┌─────────────┐  HTTP  ┌─────────────┐
│  Baileys    │────────▶│  Express +  │◀───────│   React     │
│  WhatsApp   │         │  Socket.IO  │        │  Dashboard  │
│  Worker     │◀────────│  API Hub    │───────▶│             │
└─────────────┘  events └─────────────┘ events └─────────────┘
      │                       │
      │ HTTP POST             │ googleapis
      │ (file buffer)         ▼
      └──────────────▶  Google Drive
```

- **Worker** (`worker/`) — Baileys-based WhatsApp client. No Chromium. Runs on a GCP VM or any machine. Connects to the hub via Socket.IO, downloads incoming media, POSTs files to the hub for Drive upload.
- **Hub** (`backend/`) — Lightweight Express + Socket.IO server on Render free tier. Receives file uploads from the worker, uploads to Google Drive using the operator's OAuth token, emits `new_whatsapp_file` events to dashboard clients.
- **Frontend** (`frontend/`) — React dashboard on Vercel. Shows received files in real time, supports image/video/audio/PDF preview, Google Drive login, file delete/print/download.

## Services

| Service | URL | Platform |
|---------|-----|----------|
| Dashboard | https://frontend-pi-ochre-71.vercel.app | Vercel |
| API Hub | https://wa-drive-docker.onrender.com | Render (free) |
| WA Worker | https://wa-worker-u7l6.onrender.com | Render (free) |

## Quick Start

### Hub (auto-deploys from `backend/` on push to master)

Set env vars on Render:
```
WORKER_SECRET=your-secret
```

### Worker

```bash
cd worker
npm install
cp .env.example .env
# Edit .env:
#   HUB_URL=https://wa-drive-docker.onrender.com
#   WORKER_SECRET=your-secret
npm start
```

Scan the QR code that appears in the terminal/logs with WhatsApp → Linked Devices.

### Frontend (auto-deploys from `frontend/` on push to master via Vercel)

Set env vars on Vercel:
```
VITE_API_URL=https://wa-drive-docker.onrender.com/api
VITE_SOCKET_URL=https://wa-drive-docker.onrender.com
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

## Google Drive Setup

1. Open the dashboard
2. Click **Google Drive** button → sign in with Google
3. Files will be uploaded to `customers/{phone}/` in your Drive

## Project Structure

```
wa/
├── backend/          # Express + Socket.IO hub (Render)
│   ├── src/
│   │   ├── server.ts           # Main server, upload endpoint, Socket.IO relay
│   │   ├── api/routes/         # whatsapp, files, drive routes
│   │   └── db.ts               # Local file index (fallback)
│   └── Dockerfile
│
├── worker/           # Baileys WhatsApp worker (GCP / any machine)
│   ├── worker.ts               # WhatsApp client, media handler, hub uploader
│   └── .env.example
│
└── frontend/         # React dashboard (Vercel)
    └── src/
        ├── pages/WhatsAppInboxPage.tsx
        ├── components/dashboard/   # header, file-card, preview-modal, etc.
        └── stores/whatsappStore.ts
```

## Socket.IO Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `connection:status` | Worker → Hub → Dashboard | `{ connected, qrCode? }` |
| `new_whatsapp_file` | Worker → Hub → Dashboard | `{ id, customerId, customerName, fileName, fileUrl, timestamp, ... }` |
| `worker:reinit` | Hub → Worker | — |
| `drive:token` | Hub → Worker | `string \| null` |
