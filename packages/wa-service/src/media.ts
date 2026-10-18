export async function downloadMedia(sock: any, msg: any) {
  const { downloadMediaMessage } = await import('baileys');
  try {
    return await downloadMediaMessage(msg, 'buffer', {});
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    return await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
  }
}

function unwrapMessage(message: any) {
  let current = message || {};
  for (let i = 0; i < 6; i++) {
    const inner =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.editedMessage?.message ||
      current.associatedChildMessage?.message ||
      null;
    if (!inner) break;
    current = inner;
  }
  return current;
}

export function getExtFromMsg(msg: any) {
  const m = unwrapMessage(msg.message);
  if (m.imageMessage) return 'jpg';
  if (m.videoMessage) return 'mp4';
  if (m.audioMessage) return 'ogg';
  if (m.documentMessage) {
    const name = m.documentMessage.fileName || '';
    return name.split('.').pop() || 'pdf';
  }
  return 'bin';
}
