# CyberControl WhatsApp Inbox - API Documentation

## Base URL
- **Development**: `http://localhost:3000/api`
- **Production**: `https://cybercontrol.example.com/api`

## Authentication
Currently, no authentication is required. In production, implement JWT or similar.

---

## WhatsApp Endpoints

### 1. Get Connection Status
Check if WhatsApp client is connected and ready.

**Request**
```http
GET /whatsapp/status
```

**Response** (200 OK)
```json
{
  "connected": true
}
```

**Response** (200 OK - Disconnected)
```json
{
  "connected": false
}
```

**Example (cURL)**
```bash
curl -X GET http://localhost:3000/api/whatsapp/status
```

**Example (JavaScript)**
```javascript
const response = await fetch('http://localhost:3000/api/whatsapp/status');
const data = await response.json();
console.log(data.connected ? 'Connected' : 'Disconnected');
```

---

## File Endpoints

### 2. Get Files
Retrieve uploaded files, optionally filtered by type.

**Request**
```http
GET /files
GET /files?type=whatsapp_image
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by file type (optional). Values: `whatsapp_image`, `whatsapp_document`, `whatsapp_video` |

**Response** (200 OK)
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "customerId": "660e8400-e29b-41d4-a716-446655440001",
    "customerName": "John Doe",
    "fileName": "photo.jpg",
    "fileUrl": "/uploads/whatsapp/550e8400-e29b-41d4-a716-446655440000.jpg",
    "filePath": "/home/user/backend/uploads/whatsapp/550e8400-e29b-41d4-a716-446655440000.jpg",
    "type": "whatsapp_image",
    "timestamp": "2024-01-15T10:30:45.000Z"
  }
]
```

**Response** (200 OK - Empty)
```json
[]
```

**Example (cURL)**
```bash
# Get all files
curl -X GET http://localhost:3000/api/files

# Get only WhatsApp images
curl -X GET "http://localhost:3000/api/files?type=whatsapp_image"
```

**Example (JavaScript)**
```javascript
// Get all files
const response = await fetch('http://localhost:3000/api/files');
const files = await response.json();
console.log(`Found ${files.length} files`);

// Get filtered files
const response = await fetch('http://localhost:3000/api/files?type=whatsapp_image');
const imageFiles = await response.json();
```

**Example (Axios)**
```javascript
import axios from 'axios';

// Get files
const { data: files } = await axios.get('http://localhost:3000/api/files');

// Get with filter
const { data: images } = await axios.get('http://localhost:3000/api/files', {
  params: { type: 'whatsapp_image' }
});
```

---

### 3. Delete File
Delete a file by ID.

**Request**
```http
DELETE /files/:id
```

**Path Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | The file ID to delete |

**Response** (200 OK)
```json
{
  "success": true,
  "message": "File deleted"
}
```

**Response** (404 Not Found)
```json
{
  "error": "File not found"
}
```

**Response** (500 Internal Server Error)
```json
{
  "error": "Failed to delete file"
}
```

**Example (cURL)**
```bash
curl -X DELETE http://localhost:3000/api/files/550e8400-e29b-41d4-a716-446655440000
```

**Example (JavaScript)**
```javascript
const fileId = '550e8400-e29b-41d4-a716-446655440000';
const response = await fetch(`http://localhost:3000/api/files/${fileId}`, {
  method: 'DELETE'
});
const data = await response.json();
console.log(data.message);
```

**Example (Axios)**
```javascript
import axios from 'axios';

const fileId = '550e8400-e29b-41d4-a716-446655440000';
await axios.delete(`http://localhost:3000/api/files/${fileId}`);
console.log('File deleted');
```

---

## Socket.IO Events

### Server → Client

#### 1. `connection:status`
Emitted when WhatsApp connection status changes (on connect, on QR scan, on disconnect).

**Payload**
```json
{
  "connected": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}
```

or

```json
{
  "connected": false,
  "qrCode": "Scan QR code from terminal"
}
```

**Client Listener (JavaScript)**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connection:status', (status) => {
  console.log('Connected:', status.connected);
  if (!status.connected && status.qrCode) {
    console.log('QR Code:', status.qrCode);
  }
});
```

---

#### 2. `new_whatsapp_file`
Emitted in real-time when a new file is received from WhatsApp.

**Payload**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "660e8400-e29b-41d4-a716-446655440001",
  "customerName": "John Doe",
  "fileName": "photo.jpg",
  "fileUrl": "/uploads/whatsapp/550e8400-e29b-41d4-a716-446655440000.jpg",
  "timestamp": "2024-01-15T10:30:45.000Z"
}
```

**Client Listener (JavaScript)**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('new_whatsapp_file', (file) => {
  console.log(`New file from ${file.customerName}: ${file.fileName}`);
  console.log(`Download: ${file.fileUrl}`);
});
```

---

## Error Handling

All endpoints follow standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad Request (invalid parameters) |
| 404 | Not Found (resource doesn't exist) |
| 500 | Server Error |

**Standard Error Response**
```json
{
  "error": "Description of what went wrong"
}
```

---

## Rate Limiting
Currently, no rate limiting is implemented. For production, recommend:
- File API: 100 requests/minute per IP
- WebSocket: Per-connection bandwidth limits

---

## Pagination
File listing supports basic pagination (frontend pagination recommended):

**Request**
```http
GET /files?type=whatsapp_image&limit=20&offset=0
```

Currently returns all results. Implement server-side pagination for large datasets.

---

## Filtering & Sorting

**Implemented Filters**
- `type`: Filter by file type

**Recommended Additions**
- `customerId`: Filter by customer
- `startDate`, `endDate`: Date range filtering
- `fileName`: Search by filename

---

## Code Examples

### React Component
```typescript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

export function WhatsAppInbox() {
  const [files, setFiles] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io('http://localhost:3000');

    // Listen for connection status
    socket.on('connection:status', (status) => {
      setConnected(status.connected);
    });

    // Listen for new files
    socket.on('new_whatsapp_file', (file) => {
      setFiles((prev) => [file, ...prev]);
    });

    // Fetch initial files
    axios.get('http://localhost:3000/api/files?type=whatsapp_image')
      .then((res) => setFiles(res.data));

    return () => socket.disconnect();
  }, []);

  const handleDelete = async (fileId: string) => {
    await axios.delete(`http://localhost:3000/api/files/${fileId}`);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  return (
    <div>
      <h1>WhatsApp Inbox</h1>
      <p>Status: {connected ? '✓ Connected' : '✗ Disconnected'}</p>
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            {file.fileName} - {file.customerName}
            <button onClick={() => handleDelete(file.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Node.js Backend Integration
```javascript
import axios from 'axios';
import { io } from 'socket.io-client';

const apiClient = axios.create({
  baseURL: 'http://localhost:3000/api'
});

// Get all files
async function getFiles() {
  const { data } = await apiClient.get('/files');
  return data;
}

// Delete file
async function deleteFile(fileId) {
  const { data } = await apiClient.delete(`/files/${fileId}`);
  return data;
}

// Listen to real-time updates
const socket = io('http://localhost:3000');

socket.on('new_whatsapp_file', (file) => {
  console.log('New file received:', file);
});

socket.on('connection:status', (status) => {
  console.log('WhatsApp status:', status);
});
```

---

## Testing with Postman

**Collection URL**: (Create in Postman)

### Request 1: Get Status
```
GET http://localhost:3000/api/whatsapp/status
```

### Request 2: Get Files
```
GET http://localhost:3000/api/files
```

### Request 3: Get Images Only
```
GET http://localhost:3000/api/files?type=whatsapp_image
```

### Request 4: Delete File
```
DELETE http://localhost:3000/api/files/{fileId}
```

---

## Changelog

### v1.0.0 (Initial Release)
- WhatsApp connection status endpoint
- File listing and deletion endpoints
- Real-time Socket.IO events
- Mock database implementation

### Future Versions
- [ ] Customer management endpoints
- [ ] File metadata endpoints
- [ ] Bulk operations
- [ ] Advanced filtering
- [ ] Authentication & authorization
- [ ] Rate limiting
- [ ] Webhooks

---

## Support

For issues or questions:
1. Check logs in backend terminal
2. Verify API endpoints using cURL or Postman
3. Check browser console for Socket.IO errors
4. Refer to README.md for troubleshooting
