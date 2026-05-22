const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const SERVICE_SECRET = process.env.SERVICE_SECRET || 'change-this-secret';

export async function handleMessage(workspaceId: string, msg: any) {
  if (msg.fromMe || !msg.hasMedia) return;
  if (!['image', 'document'].includes(msg.type)) return;

  try {
    const media = await msg.downloadMedia();
    if (!media) return;

    const contact = await msg.getContact();
    const phone = contact.number || msg.from.replace('@c.us', '');
    const name = contact.name || contact.pushname || phone;
    const dpUrl = await contact.getProfilePicUrl().catch(() => null);
    const fileName = media.filename || `${phone}_${Date.now()}.${media.mimetype?.split('/')[1] || 'bin'}`;

    const res = await fetch(`${GATEWAY_URL}/webhook/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-secret': SERVICE_SECRET },
      body: JSON.stringify({ workspaceId, senderPhone: phone, senderName: name, senderDp: dpUrl, fileName, mimeType: media.mimetype, fileBase64: media.data }),
    });

    if (res.ok) console.log(`[WA:${workspaceId.slice(0, 8)}] → ${fileName} from ${name}`);
    else console.error(`[WA:${workspaceId.slice(0, 8)}] Upload failed: ${res.status}`);
  } catch (e: any) {
    console.error(`[WA:${workspaceId.slice(0, 8)}] Error: ${e.message}`);
  }
}
