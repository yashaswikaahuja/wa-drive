# WhatsApp Service

Receives customer documents via WhatsApp and sends them to the Gateway.

## Setup

```bash
cd whatsapp
npm install
cp .env.example .env
node src/index.js
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service status + session list |
| POST | `/sessions/start` | Start session (generates QR) |
| POST | `/sessions/stop` | Stop session |
| GET | `/sessions/:id/status` | Get QR, connection status |
| POST | `/sessions/:id/send` | Send text message |
| GET | `/sessions` | List all sessions |

All endpoints (except /health) require `x-service-secret` header.

## How it works

1. Gateway calls `POST /sessions/start` with workspaceId
2. Service creates wwebjs client → generates QR
3. Frontend polls `GET /sessions/:id/status` to get QR
4. User scans QR → connected
5. Customer sends image → service downloads it → POSTs to Gateway webhook
6. If disconnected → service stops. User must click "Connect" again (no auto-reconnect loops)
