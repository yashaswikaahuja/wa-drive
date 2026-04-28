import axios from 'axios';
import type { WhatsAppFile } from '../types/whatsapp';

export async function fetchWhatsAppFiles(): Promise<WhatsAppFile[]> {
  const { data } = await axios.get<WhatsAppFile[]>('/api/files?type=whatsapp_image');
  return data;
}

export async function fetchWhatsAppStatus(): Promise<boolean> {
  const { data } = await axios.get<{ connected: boolean }>('/api/whatsapp/status');
  return data.connected;
}

export async function deleteWhatsAppFile(id: string): Promise<void> {
  await axios.delete(`/api/files/${id}`);
}
