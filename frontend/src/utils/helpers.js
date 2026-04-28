/**
 * Frontend utilities for WhatsApp Inbox
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
export const BACKEND_BASE_URL = new URL(API_BASE_URL).origin;
/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
/**
 * Format date for display
 */
export function formatDate(date) {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
}
/**
 * Extract file extension from filename
 */
export function getFileExtension(fileName) {
    return fileName.split('.').pop()?.toLowerCase() || '';
}
/**
 * Check if file is image
 */
export function isImageFile(fileName) {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    return imageExtensions.includes(getFileExtension(fileName));
}
/**
 * Generate preview URL for file
 */
export function getPreviewUrl(fileUrl) {
    if (/^https?:\/\//i.test(fileUrl)) {
        return fileUrl;
    }
    return new URL(fileUrl, BACKEND_BASE_URL).toString();
}
