# Storage Service

Handles Google Drive upload/download with per-workspace OAuth tokens.

## Setup

```bash
cd storage
npm install
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
node src/index.js
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service status |
| POST | `/upload` | Upload file to Drive (base64 + workspaceId) |
| GET | `/download/:workspaceId/:fileId` | Download file from Drive |
| GET | `/status/:workspaceId` | Check if Drive is connected |
| GET | `/auth-url/:workspaceId` | Get OAuth URL for connecting |
| GET | `/callback` | OAuth callback (saves tokens) |

All endpoints (except /health and /callback) require `x-service-secret` header.

## How it works

1. Gateway calls `/auth-url/:workspaceId` → gets OAuth URL → frontend opens popup
2. User authorizes → callback saves tokens to `workspace_secrets` table
3. When file arrives, Gateway calls `/upload` with base64 data
4. Service uploads to user's Drive, returns file ID + thumbnail URL
5. For download/print, Gateway calls `/download/:workspaceId/:fileId`
