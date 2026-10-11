export type MediaKind = 'image' | 'pdf';

export function isImageName(fileName?: string, mimeType?: string): boolean {
  const n = (fileName || '').toLowerCase();
  const m = (mimeType || '').toLowerCase();
  return m.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
}

export function isPdfName(fileName?: string, mimeType?: string): boolean {
  const n = (fileName || '').toLowerCase();
  const m = (mimeType || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
}

export function mediaKindOf(fileName?: string, mimeType?: string): MediaKind | null {
  if (isImageName(fileName, mimeType)) return 'image';
  if (isPdfName(fileName, mimeType)) return 'pdf';
  return null;
}

/** Strip noisy WhatsApp prefixes like 9198…_1699…_ for display */
export function displayName(fileName?: string): string {
  if (!fileName) return 'Untitled';
  let n = fileName;
  n = n.replace(/^\d{10,15}_\d{10,13}_/, '');
  n = n.replace(/^[0-9a-f]{8}-[0-9a-f-]{27}_/i, '');
  return n || fileName;
}

/** Extract a Google Drive file id from common Drive URLs. */
export function driveIdFromUrl(fileUrl?: string): string | null {
  if (!fileUrl) return null;
  const m =
    fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    fileUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] || null;
}
