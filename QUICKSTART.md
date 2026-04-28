# Quick Start Guide - CyberControl WhatsApp Inbox

## Prerequisites
- Node.js 18+
- npm or yarn
- WhatsApp account on mobile phone

## Install Dependencies

From the repo root:

```bash
npm install
```

That installs dependencies for both the backend and frontend workspaces.

## 1. Backend Setup (Terminal 1)

```bash
cd backend
npm run dev
```

Wait for output: `[WhatsApp] Client ready! ✓`

**First Time Only**: Scan the QR code with your phone:
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices → Link a Device
3. Scan the QR code shown in the terminal

## 2. Frontend Setup (Terminal 2)

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser

## 3. Test the Feature

1. From any WhatsApp contact, send a file to the cafe's WhatsApp number
2. Observe:
   - Backend receives the file
   - Frontend shows real-time notification
   - File appears in the table with customer info

## Troubleshooting

**Backend won't start**: 
- Clear auth: `rm -rf backend/.wwebjs_auth`
- Reinstall: `rm -rf backend/node_modules && npm install`

**`npm install` shows `EPERM: mkdir 'E:\'`**:
- Run `npm install` from the repo root `wa/`
- Or install inside `backend/` or `frontend/`, not from an arbitrary parent folder

**No QR code showing**:
- Ensure `qrcode-terminal` is installed
- Check Node version: `node --version` (should be 18+)

**Frontend can't fetch data**:
- Check backend is running on port 3000
- Open browser console (F12) for errors
- Verify API endpoint: http://localhost:3000/api/health

**Files not appearing**:
- Click "Refresh" button in the UI
- Check backend logs for errors
- Ensure WhatsApp is connected (green badge)

## Directory Structure

```
backend/
├── src/server.ts          # Main Express app
├── src/services/          # WhatsApp service
├── src/api/routes/        # API endpoints
├── src/db.ts              # Mock database
└── uploads/whatsapp/      # Received files

frontend/
├── src/pages/             # UI pages
├── src/stores/            # Zustand state
└── src/App.tsx            # Root component
```

## Key Files

**Backend**:
- `src/services/whatsapp.service.ts` - WhatsApp client logic
- `src/server.ts` - Express + Socket.IO setup
- `src/db.ts` - Data persistence layer

**Frontend**:
- `src/pages/WhatsAppInboxPage.tsx` - Main UI
- `src/stores/whatsappStore.ts` - State management

## Next Steps

1. Replace mock database with PostgreSQL
2. Implement Print functionality
3. Integrate with Photo Stitch
4. Add customer management features
5. Deploy to production

For more details, see README.md
