import { sessionEvents, getAllSessions } from './session.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';

export function setupHandlers() {
  // When any session receives a message, process it
  sessionEvents.on('connected', ({ workspaceId, phone }) => {
    const sessions = getAllSessions();
    const session = sessions.find(s => s.id === workspaceId);
    // Message handler is set up per client in startSession
  });
}

// Called by session.js client.on('message') — set up in index.js
export async function handleMessage(workspaceId, msg) {
  if (msg.fromMe) return;
  if (!msg.hasMedia) return;

  // Only images and documents
  const type = msg.type;
  if (!['image', 'document', 'sticker'].includes(type)) return;
  if (type === 'sticker') return; // skip stickers

  try {
    const media = await msg.downloadMedia();
    if (!media) return;

    const contact = await msg.getContact();
    const phone = contact.number || msg.from.replace('@c.us', '');
    const name = contact.name || contact.pushname || phone;
    const dpUrl = await contact.getProfilePicUrl().catch(() => null);

    const fileName = media.filename || `${phone}_${Date.now()}.${media.mimetype?.split('/')[1] || 'bin'}`;

    // Send to Gateway webhook
    const body = {
      workspaceId,
      senderPhone: phone,
      senderName: name,
      senderDp: dpUrl,
      fileName,
      mimeType: media.mimetype,
      fileBase64: media.data, // base64 encoded
    };

    const res = await fetch(`${GATEWAY_URL}/webhook/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': SERVICE_SECRET },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      console.log(`[WA:${workspaceId.slice(0,8)}] → ${fileName} from ${name}`);
    } else {
      console.error(`[WA:${workspaceId.slice(0,8)}] Upload failed: ${res.status}`);
    }
  } catch (e) {
    console.error(`[WA:${workspaceId.slice(0,8)}] Message error: ${e.message}`);
  }
}
