import axios from 'axios';
import { API_BASE_URL } from '../utils/helpers';
export function normalizeWhatsAppFile(file) {
    const id = file.id;
    const fileName = (file.fileName ?? file.name)?.trim();
    const fileUrl = (file.fileUrl ?? file.webContentLink ?? file.webViewLink)?.trim();
    const timestamp = file.timestamp ?? file.createdTime;
    if (!id || !fileName || !fileUrl || !timestamp)
        return null;
    if (fileName.toLowerCase() === 'n/a')
        return null;
    if (file.mimeType === 'application/vnd.google-apps.folder')
        return null;
    const parent = file.parents?.[0] ?? '';
    const customerId = file.customerId ?? parent;
    return {
        id,
        customerId: customerId || 'unknown',
        customerName: file.customerName ?? (customerId ? `Guest ${customerId.slice(-4)}` : 'Unknown customer'),
        fileName,
        fileUrl,
        profilePicUrl: file.profilePicUrl ?? null,
        timestamp,
    };
}
function normalizeWhatsAppFiles(files) {
    return files
        .map(normalizeWhatsAppFile)
        .filter((file) => file !== null);
}
export async function fetchWhatsAppFiles() {
    const { data } = await axios.get(`${API_BASE_URL}/files?type=whatsapp_image`);
    return normalizeWhatsAppFiles(data);
}
export async function fetchWhatsAppStatus() {
    const { data } = await axios.get(`${API_BASE_URL}/whatsapp/status`);
    return data.connected;
}
export async function deleteWhatsAppFile(id) {
    await axios.delete(`${API_BASE_URL}/files/${id}`);
}
