# CyberControl — WhatsApp Inbox

A cybercafe management tool that receives files sent by customers via WhatsApp, uploads them to Google Drive, and displays them in a real-time dashboard.

## Architecture

```
GCP VM (34.134.111.239)
┌──────────────────────────────────────────────┐
│                                              │
│  Baileys Worker ──localhost:3000──▶ Hub      │
│  (PM2: whatsapp-worker)         (PM2: cybercontrol-hub)
│                                      │       │
│  Cloudflare Tunnel ◀─────────────────┘       │
│  (PM2: cloudflare-tunnel)                    │
└──────────────────────────────────────────────┘
         │ HTTPS
         ▼
  https://strings-broker-minimal-cut.trycloudflare.com
         │
         ▼
  Vercel Frontend (https://frontend-pi-ochre-71.vercel.app)
```

- **Worker** (`worker/`) — Baileys WhatsApp client, no Chromium. Receives media, POSTs to hub via `http://localhost:3000`.
- **Hub** (`backend/`) — Express + Socket.IO. Receives files from worker, uploads to Google Drive, emits real-time events to dashboard.
- **Frontend** (`frontend/`) — React dashboard on Vercel. Real-time file display, Drive login, preview/print/download.
- **Cloudflare Tunnel** — Free HTTPS proxy exposing the hub to the internet (URL changes on restart).

## Services

| Service | URL | Platform |
|---------|-----|----------|
| Dashboard | https://frontend-pi-ochre-71.vercel.app | Vercel |
| API Hub | https://strings-broker-minimal-cut.trycloudflare.com | GCP VM (PM2) |
| WA Worker | internal (localhost) | GCP VM (PM2) |

## GCP VM

- **IP:** `34.134.111.239` (static)
- **SSH:** `ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239`
- **PM2 processes:** `cybercontrol-hub` (port 3000), `whatsapp-worker` (port 3002), `cloudflare-tunnel`

## Quick Start

### Hub (GCP VM)
```bash
# Build locally (tsc OOMs on e2-micro)
cd backend && npm run build
scp -r backend/dist gcp-worker:/opt/cybercontrol-hub/backend/dist
ssh gcp-worker "pm2 restart cybercontrol-hub"
```

### Worker (GCP VM)
```bash
# /opt/whatsapp-worker/worker/.env
HUB_URL=http://localhost:3000
WORKER_SECRET=cybercontrol-worker-secret-2024
PORT=3002
```
```bash
scp worker/worker.ts gcp-worker:/opt/whatsapp-worker/worker/worker.ts
ssh gcp-worker "pm2 restart whatsapp-worker"
```

### Frontend (Vercel)
```bash
cd frontend && npx vercel --prod --yes
```

Set env vars on Vercel:
```
VITE_API_URL=https://<tunnel-url>/api
VITE_SOCKET_URL=https://<tunnel-url>
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id
```

## When Cloudflare Tunnel URL Changes

```bash
# Get new URL
ssh gcp-worker "pm2 logs cloudflare-tunnel --lines 30 --nostream | grep trycloudflare"

# Update Vercel and redeploy
cd frontend
npx vercel env rm VITE_API_URL production --yes
npx vercel env rm VITE_SOCKET_URL production --yes
echo 'https://NEW-URL.trycloudflare.com/api' | npx vercel env add VITE_API_URL production
echo 'https://NEW-URL.trycloudflare.com' | npx vercel env add VITE_SOCKET_URL production
npx vercel --prod --yes
```

## Google Drive Setup

1. Open the dashboard
2. Click **Connect Google Drive** → sign in
3. Token stored in browser, synced to hub automatically
4. Files uploaded to `customers/{phone}/` in your Drive
5. Token expires after ~1 hour — click again to reconnect

## Project Structure

```
wa/
├── backend/          # Express + Socket.IO hub (GCP VM)
│   └── src/server.ts # Routes, Drive upload, Socket.IO relay
├── worker/           # Baileys WhatsApp worker (GCP VM)
│   └── worker.ts     # Media handler, hub uploader
└── frontend/         # React dashboard (Vercel)
    └── src/
        ├── pages/WhatsAppInboxPage.tsx
        ├── components/dashboard/
        └── stores/
```

## Socket.IO Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `connection:status` | Worker → Hub → Dashboard | `{ connected, qrCode? }` |
| `new_whatsapp_file` | Hub → Dashboard | `{ id, customerId, customerName, fileName, fileUrl, ... }` |
| `worker:reinit` | Hub → Worker | — |
| `drive:token` | Hub → Worker | `string \| null` |
