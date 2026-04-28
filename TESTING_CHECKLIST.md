# Testing & Verification Checklist

Complete this checklist to verify all features work correctly.

## Pre-Testing Setup

### Installation
- [ ] Clone/download project to `e:\yashu\wa`
- [ ] Navigate to `backend` directory
- [ ] Run `npm install`
- [ ] Navigate to `frontend` directory
- [ ] Run `npm install`

### Configuration
- [ ] Copy `backend/.env.example` to `backend/.env`
- [ ] Copy `frontend/.env.example` to `frontend/.env`
- [ ] Verify ports: Backend (3000), Frontend (5173)
- [ ] Ensure `uploads/whatsapp` directory exists

---

## Backend Testing

### Startup
- [ ] Run `npm run dev` in backend directory
- [ ] Server starts on port 3000
- [ ] See message: `[Server] Running on http://localhost:3000`
- [ ] See message: `[WhatsApp] Initializing WhatsApp client...`
- [ ] QR code appears in terminal

### WhatsApp Connection (First Time)
- [ ] QR code displays in terminal (not scrambled)
- [ ] Open WhatsApp on phone
- [ ] Navigate to Settings → Linked Devices → Link a Device
- [ ] Scan QR code with phone camera
- [ ] After 30-60 seconds, see: `[WhatsApp] Client ready! ✓`
- [ ] Socket.IO event `connection:status` emitted
- [ ] QR code disappears from terminal

### API Endpoints
- [ ] Test `GET http://localhost:3000/api/health` → Returns `{status: 'ok'}`
- [ ] Test `GET http://localhost:3000/api/whatsapp/status` → Returns `{connected: true}`
- [ ] Test `GET http://localhost:3000/api/files` → Returns empty array `[]`

### File Uploads Directory
- [ ] Directory exists: `backend/uploads/whatsapp/`
- [ ] Has `.gitkeep` file
- [ ] Is writable (can create files)

### Console Output
- [ ] No error messages
- [ ] WhatsApp service initialized successfully
- [ ] Socket.IO clients can connect

---

## Frontend Testing

### Startup
- [ ] Run `npm run dev` in frontend directory
- [ ] Build succeeds without errors
- [ ] Vite dev server starts on port 5173
- [ ] Browser opens to `http://localhost:5173`
- [ ] Page loads without JavaScript errors
- [ ] Console (F12) shows no errors

### WhatsAppInboxPage Component
- [ ] Page title "WhatsApp Inbox" displays
- [ ] Connection status badge visible (should show "Connected" if backend QR scanned)
- [ ] Table header visible with columns: Thumbnail, Filename, Customer Name, Time Received, Actions
- [ ] "Refresh" button visible and clickable
- [ ] Table initially empty with "No files received yet" message

### Socket.IO Connection
- [ ] Browser Network tab shows WebSocket connection to `localhost:3000`
- [ ] Console shows connection established
- [ ] No CORS errors in console
- [ ] Socket.IO client connects successfully

### Style & Layout
- [ ] Page uses Ant Design components
- [ ] Responsive layout (works on different screen sizes)
- [ ] Colors are correct (green for connected, red for disconnected)
- [ ] Typography is readable
- [ ] Spacing and padding look correct

---

## End-to-End Testing

### Receiving a File

**Setup**
- [ ] Backend running with WhatsApp connected ✓
- [ ] Frontend page loaded and showing "Connected" ✓

**Test Steps**
1. [ ] From a contact, send a file to cafe's WhatsApp number
   - [ ] Can be: image, document, or video
   - [ ] File size: any (test with small file first)
2. [ ] Backend logs show:
   - [ ] `[WhatsApp] File from [Customer Name] ([Phone])`
   - [ ] `[WhatsApp] File saved: [path]`
   - [ ] `[WhatsApp] Notification emitted to clients`
3. [ ] Frontend receives file in real-time:
   - [ ] New row appears in table
   - [ ] Toast notification shows "New File Received"
   - [ ] File appears at top of table (most recent first)
4. [ ] File row contains:
   - [ ] Thumbnail (image preview if applicable)
   - [ ] Correct filename
   - [ ] Correct customer name (or "Guest XXXX" if new)
   - [ ] Correct timestamp
   - [ ] Action buttons: "Photo Stitch", "Print", "Delete"

### Testing Customer Mapping

**New Customer**
- [ ] Send file from phone number not in database
- [ ] Backend creates guest customer with name "Guest [Last4Digits]"
- [ ] Frontend shows guest customer name
- [ ] Subsequent files from same number show same customer name

**Existing Customer**
- [ ] Add test customer to mock database (in memory)
- [ ] Send file from that customer's WhatsApp number
- [ ] Frontend shows actual customer name (not guest)

### Testing File Deletion

**Delete Action**
- [ ] Click "Delete" button on a file row
- [ ] Confirmation modal appears asking "Are you sure?"
- [ ] Click "Delete" button in modal
- [ ] Row disappears from table
- [ ] Success notification shows "File deleted successfully"
- [ ] File no longer appears when page refreshes

**Delete Failure**
- [ ] Try to delete already-deleted file
- [ ] Error notification shows
- [ ] Table still displays other files

### Testing Refresh Button

- [ ] Click "Refresh" button
- [ ] Loading spinner appears
- [ ] API call to `GET /api/files?type=whatsapp_image` made
- [ ] Table updates with latest files
- [ ] Spinner disappears after data loads

### Testing Connection Status

**Connected Status**
- [ ] Badge shows green checkmark
- [ ] Badge text says "Connected"
- [ ] No "scan QR code" message below badge

**Disconnected Status** (manually test by stopping backend)
- [ ] Restart backend (don't scan QR)
- [ ] Frontend badge shows red X
- [ ] Badge text says "Disconnected"
- [ ] Instructions appear: "Open WhatsApp on your phone → Settings → Linked Devices..."

### Testing Error Handling

**Network Errors**
- [ ] Stop backend server
- [ ] Try to click "Refresh"
- [ ] Error notification appears
- [ ] Page doesn't crash
- [ ] Restart backend
- [ ] "Refresh" works again

**Invalid File ID**
- [ ] Manually try to delete non-existent file
- [ ] Error message shows
- [ ] Table still functional

---

## Database Testing (Mock)

### Initial State
- [ ] Mock customers array has 2 test entries
- [ ] Mock files array is initially empty

### After Receiving Files
- [ ] `customers` array grows if new phone numbers send files
- [ ] `files` array contains entries for each received file
- [ ] Each file has: id, customerId, customerName, fileName, fileUrl, timestamp
- [ ] File paths created in `uploads/whatsapp/`

### Deletion
- [ ] After deleting file, it's removed from `files` array
- [ ] Physical file may need manual cleanup (optional for now)

---

## Performance Testing

### Load Time
- [ ] Frontend page loads within 3 seconds
- [ ] Initial file list fetches within 2 seconds
- [ ] Real-time file notifications appear within 1 second

### Memory Usage
- [ ] Backend memory stays under 200MB (with Node)
- [ ] Frontend memory stays under 100MB (in browser)

### Concurrent Connections
- [ ] Multiple browser tabs can connect simultaneously
- [ ] File appears in all tabs in real-time
- [ ] No slowdown with 5+ concurrent connections

---

## Browser Compatibility

- [ ] Chrome/Chromium: ✓
- [ ] Firefox: ✓
- [ ] Safari: ✓
- [ ] Edge: ✓

---

## Responsive Design

- [ ] Desktop (1920x1080): ✓
- [ ] Laptop (1366x768): ✓
- [ ] Tablet (768x1024): ✓
- [ ] Mobile (375x667): ✓
  - [ ] Table scrolls horizontally on mobile
  - [ ] Buttons still clickable
  - [ ] Text readable without zooming

---

## Edge Cases

### File Types
- [ ] Image file (.jpg, .png, .gif): ✓
- [ ] Document (.pdf, .docx, .xlsx): ✓
- [ ] Video (.mp4, .avi): ✓
- [ ] Large file (>10MB): ✓
- [ ] File with spaces in name: ✓
- [ ] File with special characters: ✓

### Customer Names
- [ ] ASCII characters (John, 李明): ✓
- [ ] Numbers in name (John123): ✓
- [ ] Spaces in name (John Doe): ✓
- [ ] Very long name (50+ characters): ✓

### Timestamps
- [ ] Formats correctly with user's locale
- [ ] Handles different time zones: ✓
- [ ] Shows most recent first: ✓

---

## Integration Testing

### Backend → Frontend
- [ ] Backend emits `connection:status` → Frontend receives and updates badge
- [ ] Backend emits `new_whatsapp_file` → Frontend receives and adds to table
- [ ] Frontend makes API call → Backend returns correct data

### Frontend → Backend
- [ ] Frontend calls `GET /api/files` → Backend returns file list
- [ ] Frontend calls `DELETE /api/files/:id` → Backend deletes file
- [ ] Frontend calls `GET /api/whatsapp/status` → Backend returns status

### Socket.IO
- [ ] Connection handshake succeeds
- [ ] Events flow both directions
- [ ] Disconnection handled gracefully
- [ ] Reconnection works after network loss

---

## Documentation Verification

- [ ] README.md: All links work, no broken references
- [ ] QUICKSTART.md: Setup steps verified to work
- [ ] API.md: All endpoints documented and accurate
- [ ] DEPLOYMENT.md: Instructions are clear and complete
- [ ] PROJECT_SUMMARY.md: Reflects actual implementation

---

## Security Verification

- [ ] No sensitive data logged to console
- [ ] No credentials in frontend code
- [ ] .env files are in .gitignore
- [ ] CORS properly configured
- [ ] File paths don't expose system structure
- [ ] File downloads don't allow directory traversal

---

## Code Quality

- [ ] No TypeScript errors: `npm run build`
- [ ] No console warnings
- [ ] Proper error handling everywhere
- [ ] Comments on complex logic
- [ ] Consistent code style
- [ ] No unused imports or variables

---

## Final Checklist

- [ ] All sections of this checklist completed
- [ ] No blocking issues found
- [ ] Feature works end-to-end
- [ ] Documentation is accurate
- [ ] Code is production-ready
- [ ] Ready for deployment

---

## Bugs Found & Fixes

| Bug | Severity | Status | Fix |
|-----|----------|--------|-----|
| (None found) | N/A | N/A | N/A |

---

## Sign-Off

**Tested By**: _______________________
**Date**: _______________________
**Status**: ✅ PASS / ❌ FAIL

**Notes**:
_________________________________________
_________________________________________
_________________________________________

---

## Test Evidence

Take screenshots of:
- [ ] Backend QR code in terminal
- [ ] Frontend WhatsAppInboxPage with connected badge
- [ ] Frontend WhatsAppInboxPage with files in table
- [ ] Real-time notification toast
- [ ] Delete confirmation modal
- [ ] Error handling

Save to: `e:\yashu\wa\test-evidence\`

---

**This checklist ensures complete, tested, production-ready implementation.**
