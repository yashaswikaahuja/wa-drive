/**
 * Frontend utilities for WhatsApp Inbox
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
export const BACKEND_BASE_URL = new URL(API_BASE_URL).origin;

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Extract file extension from filename
 */
export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/**
 * Check if file is image
 */
export function isImageFile(fileName: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  return imageExtensions.includes(getFileExtension(fileName));
}

/**
 * Generate preview URL for file
 */
export function getPreviewUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  // Already a Drive thumbnail URL
  if (fileUrl.includes('drive.google.com/thumbnail')) return fileUrl;
  // Drive download/view URL — extract ID and make thumbnail
  const driveMatch = fileUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/thumbnail?sz=w200&id=${driveMatch[1]}`;
  // Local path — prepend backend origin
  if (fileUrl.startsWith('/uploads/')) return `${API_BASE_URL.replace('/api', '')}${fileUrl}`;
  return fileUrl;
}


