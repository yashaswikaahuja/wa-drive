import axios from 'axios';
import type { WhatsAppFile } from '../types/whatsapp';
import { API_BASE_URL } from '../utils/helpers';

export async function fetchWhatsAppFiles(): Promise<WhatsAppFile[]> {
  const { data } = await axios.get<WhatsAppFile[]>(`${API_BASE_URL}/files?type=whatsapp_image`);
  return data;
}

export async function fetchWhatsAppStatus(): Promise<boolean> {
  const { data } = await axios.get<{ connected: boolean }>(`${API_BASE_URL}/whatsapp/status`);
  return data.connected;
}

export async function deleteWhatsAppFile(id: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/files/${id}`);
}
