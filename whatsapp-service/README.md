# CyberControl WhatsApp Service

Multi-tenant WhatsApp session manager. Runs as a separate microservice, communicates with the parent API.

## Architecture

```
Parent API (api.cybercontrol.fun)
  ↕ HTTP + WebSocket
WhatsApp Service (port 3100)
  → Manages N Baileys sessions (one per workspace)
  → Uploads received files to Parent
  → Notifies Parent of connection events
```

## API

All endpoints require `x-service-secret` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Service status |
| POST | /sessions/start | Start WhatsApp session `{workspaceId}` |
| POST | /sessions/stop | Stop session `{workspaceId}` |
| GET | /sessions/:id/status | Get connection status + QR |
| GET | /sessions/:id/qr | Get current QR code |
| GET | /sessions | List all active sessions |

## WebSocket

Connect to `ws://host:3100/ws?workspaceId=xxx` to receive real-time events:
- `{type: 'qr', qr: '...'}` — new QR code
- `{type: 'status', connected: true/false}` — connection changed

## Deploy

```bash
cd /opt/whatsapp-service
npm install
pm2 start ecosystem.config.cjs
```
