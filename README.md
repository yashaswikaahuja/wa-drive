# CyberControl - WhatsApp Inbox Feature

A complete WhatsApp Inbox implementation for the CyberControl cybercafe management dashboard. Receives files sent by customers to the cafe's WhatsApp number, saves them on the server, maps senders to customer records, and pushes real-time notifications to the operator dashboard.

## Project Structure

```
wa/
├── backend/
│   ├── src/
│   │   ├── services/
│   │   │   └── whatsapp.service.ts       # WhatsApp client service
│   │   ├── api/routes/
│   │   │   ├── whatsapp.routes.ts        # WhatsApp API endpoints
│   │   │   └── files.routes.ts           # File management endpoints
│   │   ├── types/
│   │   │   ├── whatsapp.ts               # WhatsApp-specific types
│   │   │   └── index.ts                  # Exported types
│   │   ├── db.ts                         # Mock database functions
│   │   └── server.ts                     # Express + Socket.IO server
│   ├── uploads/whatsapp/                 # Uploaded files directory
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   └── WhatsAppInboxPage.tsx      # Main inbox UI component
    │   ├── stores/
    │   │   └── whatsappStore.ts          # Zustand state management
    │   ├── App.tsx
    │   └── main.tsx
    ├── index.html
    ├── vite.config.ts
    ├── package.json
    └── tsconfig.json
```

## Technology Stack

### Backend
- **Express.js** + **TypeScript** - REST API framework
- **Socket.IO** - Real-time bidirectional communication
- **whatsapp-web.js** - WhatsApp Web client automation
- **qrcode-terminal** - Terminal QR code display
- **qrcode** - QR code generation (base64)
- **node-cron** - Task scheduling
- **uuid** - Unique ID generation
- **fs**, **path** - File system utilities

### Frontend
- **React 18** + **TypeScript** - UI framework
- **Vite** - Fast build tool
- **Ant Design 5.x** - UI component library
- **Socket.IO Client** - Real-time communication
- **Zustand** - Lightweight state management
- **Axios** - HTTP client

## Features

### Backend Features

1. **WhatsApp Client Service** (`whatsapp.service.ts`)
   - Initializes WhatsApp Web client with `LocalAuth` strategy
   - Displays QR code in terminal for first-time authentication
   - Emits real-time connection status via Socket.IO
   - Listens for incoming messages with media attachments
   - Extracts sender phone number from WhatsApp ID
   - Maps sender to customer record (or creates guest customer)
   - Saves files to `uploads/whatsapp/` with unique names
   - Emits real-time notifications to all connected clients

2. **API Endpoints**
   - `GET /api/whatsapp/status` - Get WhatsApp connection status
   - `GET /api/files?type=whatsapp_image` - Fetch files (filtered by type)
   - `DELETE /api/files/:id` - Delete a file by ID

3. **Mock Database**
   - Customers table (with WhatsApp mapping)
   - Files table (with metadata)
   - Functions: `findOrCreateCustomer()`, `saveWhatsAppFile()`, `getWhatsAppFiles()`, `deleteFile()`

### Frontend Features

1. **WhatsApp Inbox Page** (`WhatsAppInboxPage.tsx`)
   - Connection status badge (green/red) with instructions
   - Real-time files table with columns:
     - Thumbnail (image preview)
     - Filename
     - Customer Name
     - Time Received
     - Actions (Open in Photo Stitch, Print, Delete)
   - Real-time notifications via Socket.IO
   - Manual refresh button
   - Loading spinner during data fetch
   - Error handling and display

2. **Zustand Store** (`whatsappStore.ts`)
   - State: `files`, `connected`, `loading`, `error`
   - Actions: `setConnected()`, `addFile()`, `removeFile()`, `setFiles()`, `clearFiles()`, `setLoading()`, `setError()`
   - Persistence ready for Socket.IO integration

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- WhatsApp account with mobile phone for authentication

### Workspace Install

From the repo root `wa/`, you can install both apps with one command:

```bash
npm install
```

This workspace root now manages both `backend` and `frontend`.

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create uploads directory (should be automatic, but just in case)
mkdir -p uploads/whatsapp

# Start development server (watches for changes)
npm run dev

# Or build and run production
npm run build
npm start
```

Server will start on `http://localhost:3000`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Or build for production
npm run build
npm preview
```

Frontend will start on `http://localhost:5173`

## Usage

### 1. Backend Startup

When you run `npm run dev` in the backend:
1. Server starts on port 3000
2. WhatsApp service initializes
3. QR code appears in terminal
4. **On your phone**: Open WhatsApp → Settings → Linked Devices → Link a Device
5. **Scan the QR code** from the terminal
6. Once authenticated, you'll see: `[WhatsApp] Client ready! ✓`

### 2. Frontend Startup

Run `npm run dev` in the frontend:
1. App opens on `http://localhost:5173`
2. WhatsAppInboxPage displays
3. Connection status shows "Connected" (or "Disconnected – scan QR code")
4. Table is empty initially

### 3. Receiving Files

1. Have someone send a file (image, document, etc.) to the cafe's WhatsApp number
2. The backend receives the message and:
   - Downloads the file
   - Saves it to `uploads/whatsapp/`
   - Creates/finds the customer
   - Emits `new_whatsapp_file` event
3. Frontend receives the event in real-time and:
   - Adds the file to the table
   - Shows a notification
4. Operator can click "Open in Photo Stitch", "Print", or "Delete"

## Socket.IO Events

### Server → Client

**`connection:status`** - Emitted when WhatsApp connection status changes
```javascript
{
  connected: boolean,
  qrCode?: string // base64 PNG or instruction text
}
```

**`new_whatsapp_file`** - Emitted when a new file is received
```javascript
{
  id: string,
  customerId: string,
  customerName: string,
  fileName: string,
  fileUrl: string,
  timestamp: string
}
```

## API Responses

### GET /api/whatsapp/status
```json
{
  "connected": true
}
```

### GET /api/files?type=whatsapp_image
```json
[
  {
    "id": "uuid",
    "customerId": "uuid",
    "customerName": "John Doe",
    "fileName": "photo.jpg",
    "fileUrl": "/uploads/whatsapp/uuid.jpg",
    "filePath": "/absolute/path/uuid.jpg",
    "type": "whatsapp_image",
    "timestamp": "2024-01-15T10:30:45.000Z"
  }
]
```

### DELETE /api/files/:id
```json
{
  "success": true,
  "message": "File deleted"
}
```

## Database Integration (Future)

The current implementation uses mock in-memory storage. To integrate with PostgreSQL:

### Update `db.ts`

Replace mock functions with actual queries:

```typescript
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export async function findOrCreateCustomer(waId: string): Promise<Customer> {
  const phoneNumber = waId.replace('@c.us', '');
  
  // Try to find existing
  const result = await pool.query(
    'SELECT * FROM customers WHERE whatsapp = $1',
    [phoneNumber]
  );
  
  if (result.rows.length > 0) return result.rows[0];
  
  // Create guest customer
  const lastFourDigits = phoneNumber.slice(-4);
  const insertResult = await pool.query(
    'INSERT INTO customers (name, whatsapp) VALUES ($1, $2) RETURNING *',
    [`Guest ${lastFourDigits}`, phoneNumber]
  );
  
  return insertResult.rows[0];
}

export async function saveWhatsAppFile(
  customerId: string,
  customerName: string,
  fileName: string,
  fileUrl: string,
  filePath: string,
): Promise<WhatsAppFile> {
  const result = await pool.query(
    'INSERT INTO files (customer_id, type, path, file_name, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [customerId, 'whatsapp_image', filePath, fileName, new Date()]
  );
  
  return {
    id: result.rows[0].id,
    customerId,
    customerName,
    fileName,
    fileUrl,
    filePath,
    type: 'whatsapp_image',
    timestamp: result.rows[0].timestamp,
  };
}
```

### PostgreSQL Schema

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_whatsapp ON customers(whatsapp);
CREATE INDEX idx_files_customer_id ON files(customer_id);
CREATE INDEX idx_files_type ON files(type);
```

## Troubleshooting

### `npm install` fails with `EPERM: mkdir 'E:\'`
- Run `npm install` from the repo root `wa/`, or run it inside `backend/` or `frontend/`.
- That error is caused by npm resolving an invalid install root for the current folder layout.
- This repo now includes a root workspace `package.json`, so `wa/` is a valid install location.

### WhatsApp QR Code Not Appearing
- Check terminal output for errors
- Ensure `qrcode-terminal` package is installed
- Try clearing cache: `rm -rf .wwebjs_auth`

### Files Not Being Received
- Verify WhatsApp connection shows `[WhatsApp] Client ready! ✓`
- Check that sender is sending to the correct number
- Ensure `uploads/whatsapp` directory exists and is writable
- Check file size limits (WhatsApp limits apply)

### Frontend Not Connecting to Backend
- Verify backend is running on port 3000
- Check browser console for Socket.IO errors
- Ensure CORS is configured correctly in `server.ts`
- Check firewall/network connectivity

### Files Not Showing in Table
- Refresh the page with the "Refresh" button
- Check browser Network tab for API responses
- Verify `GET /api/files?type=whatsapp_image` returns data

## Notes

- **Authentication**: First-time setup requires scanning QR code on phone. Session is cached in `.wwebjs_auth/` directory.
- **File Storage**: Files are saved with UUID names to avoid collisions. Original filename is stored in database.
- **Guest Customers**: Automatic guest accounts are created using last 4 digits of phone number.
- **Real-time Updates**: All clients connected to Socket.IO receive instant notifications of new files.
- **Scalability**: For production, consider using database for persistence and Redis for session management.

## Future Enhancements

- [ ] Print functionality integration
- [ ] Photo Stitch integration with file passing
- [ ] Bulk file operations (delete, archive)
- [ ] File type filtering UI (images, documents, videos)
- [ ] Customer search and filtering
- [ ] File download functionality
- [ ] Webhook support for external integrations
- [ ] Cloud storage integration (S3, etc.)
- [ ] OCR for document processing
- [ ] Automated customer detection from message context

## License

Proprietary - CyberControl © 2024
