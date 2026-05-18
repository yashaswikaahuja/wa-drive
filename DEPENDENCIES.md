# CyberControl — Dependencies Setup
# Run this to install all dependencies for the entire project

## Prerequisites
- Node.js v20+
- PostgreSQL 14+
- npm (comes with Node.js)

## Install All Dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# WhatsApp Service
cd ../whatsapp-service && npm install

# WhatsApp Resolver
cd ../whatsapp-resolver && npm install
```

## Or one-liner:
```bash
cd backend && npm i && cd ../frontend && npm i && cd ../whatsapp-service && npm i && cd ../whatsapp-resolver && npm i
```

---

## Backend Dependencies (backend/package.json)

### Production
| Package | Purpose |
|---------|---------|
| express | HTTP server |
| pg | PostgreSQL client |
| jsonwebtoken | JWT auth tokens |
| bcrypt | Password hashing |
| googleapis | Google Drive API |
| google-auth-library | Google OAuth |
| socket.io | Real-time WebSocket |
| multer | File upload handling |
| sharp | Image processing |
| compression | Response gzip |
| express-rate-limit | Rate limiting |
| dotenv | Environment variables |
| cors | Cross-origin requests |

### Dev
| Package | Purpose |
|---------|---------|
| typescript | TypeScript compiler |
| @types/express | Express types |
| @types/pg | PostgreSQL types |
| @types/jsonwebtoken | JWT types |
| @types/bcrypt | Bcrypt types |
| @types/multer | Multer types |
| @types/compression | Compression types |

---

## Frontend Dependencies (frontend/package.json)

| Package | Purpose |
|---------|---------|
| react | UI framework |
| react-dom | React DOM renderer |
| react-router-dom | Client routing |
| zustand | State management |
| axios | HTTP client |
| socket.io-client | WebSocket client |
| vite | Build tool |
| typescript | TypeScript |
| tailwindcss | CSS framework |

---

## WhatsApp Service Dependencies (whatsapp-service/package.json)

| Package | Purpose |
|---------|---------|
| express | HTTP server |
| baileys | WhatsApp Web protocol |
| @hapi/boom | HTTP errors |
| pino | Logger |
| form-data | Multipart upload |
| ws | WebSocket server |

---

## WhatsApp Resolver Dependencies (whatsapp-resolver/package.json)

| Package | Purpose |
|---------|---------|
| express | HTTP server |
| whatsapp-web.js | WhatsApp Web via Puppeteer |
| qrcode | QR code generation |
| qrcode-terminal | QR in terminal |

---

## System Dependencies (for GCP/Linux)

```bash
# For WhatsApp Resolver (Chromium/Puppeteer)
sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
  libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 \
  libxfixes3 libxkbcommon0 libxrandr2 xdg-utils

# For Sharp (image processing)
sudo apt-get install -y libvips-dev
```
