# CyberControl WhatsApp Service

Multi-tenant WhatsApp session manager using **Baileys** + **wwebjs Resolver** for LID→phone resolution.

## Quick Start

```bash
npm install
cp .env.example .env
node index.js
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| `whatsapp-service` | 3100 | Baileys — receives files, manages sessions |
| `whatsapp-resolver` | 3200 | wwebjs — resolves LID→phone, fetches DP + saved names |

## Production (GCP #2)

```bash
pm2 start index.js --name whatsapp-service --cwd /opt/whatsapp/service
pm2 start index.js --name whatsapp-resolver --cwd /opt/whatsapp/resolver
pm2 save
```

## Key Features

- **Auto-start** — all sessions resume on boot
- **LID resolution** — anonymous WhatsApp IDs → real phone numbers
- **Retry + disk queue** — no file loss even if parent is down
- **Exponential backoff** — prevents reconnect floods
- **Health endpoint** — disk, memory, session status

## Health Check

```bash
curl http://localhost:3100/health
# {"status":"ok","sessions":3,"diskFree":"22G","memMB":111}
```

## Resolver QR

If resolver disconnects, re-scan at:
```
http://cybercontrol-wa:3200/qr-page?secret=wa-service-secret-2024
```

## Full Documentation

See [WHATSAPP_SERVICE.md](./WHATSAPP_SERVICE.md) for architecture, message flow, troubleshooting, and local dev setup.
