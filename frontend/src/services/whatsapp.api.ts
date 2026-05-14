import api from './api.service';
import type { WhatsAppFile } from '../types/whatsapp';
import { API_BASE_URL } from '../utils/helpers';

type RawWhatsAppFile = Partial<WhatsAppFile> & {
  name?: string;
  webContentLink?: string;
  webViewLink?: string;
  createdTime?: string;
  mimeType?: string;
  parents?: string[];
};

export function normalizeWhatsAppFile(file: RawWhatsAppFile): WhatsAppFile | null {
  const id = file.id;
  const fileName = (file.fileName ?? file.name)?.trim();
  const fileUrl = (file.fileUrl ?? file.webContentLink ?? file.webViewLink)?.trim();
  const timestamp = file.timestamp ?? file.createdTime;

  if (!id || !fileName || !fileUrl || !timestamp) return null;
  if (fileName.toLowerCase() === 'n/a') return null;
  if (file.mimeType === 'application/vnd.google-apps.folder') return null;

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

function normalizeWhatsAppFiles(files: RawWhatsAppFile[]): WhatsAppFile[] {
  return files
    .map(normalizeWhatsAppFile)
    .filter((file): file is WhatsAppFile => file !== null);
}

export async function fetchWhatsAppFiles(): Promise<WhatsAppFile[]> {
  const { data } = await api.get<RawWhatsAppFile[]>('/files?type=whatsapp_image');
  return normalizeWhatsAppFiles(data);
}

export async function fetchWhatsAppStatus(): Promise<boolean> {
  const { data } = await api.get<{ connected: boolean }>('/whatsapp/status');
  return data.connected;
}

export async function deleteWhatsAppFile(id: string): Promise<void> {
  await api.delete(`/files/${id}`);
}
