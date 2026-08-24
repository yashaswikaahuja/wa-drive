export async function downloadMedia(sock, msg) {
  const { downloadMediaMessage } = await import('baileys');
  try {
    return await downloadMediaMessage(msg, 'buffer', {});
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
    return await downloadMediaMessage(msg, 'buffer', {}).catch(() => null);
  }
}

export function getExtFromMsg(msg) {
  const m =
    msg.message?.viewOnceMessage?.message ||
    msg.message?.viewOnceMessageV2?.message ||
    msg.message?.documentWithCaptionMessage?.message ||
    msg.message ||
    {};
  if (m.imageMessage) return 'jpg';
  if (m.videoMessage) return 'mp4';
  if (m.audioMessage) return 'ogg';
  if (m.documentMessage) {
    const name = m.documentMessage.fileName || '';
    return name.split('.').pop() || 'pdf';
  }
  return 'bin';
}
