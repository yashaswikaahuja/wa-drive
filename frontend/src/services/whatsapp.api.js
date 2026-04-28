import axios from 'axios';
import { API_BASE_URL } from '../utils/helpers';
export async function fetchWhatsAppFiles() {
    const { data } = await axios.get(`${API_BASE_URL}/files?type=whatsapp_image`);
    return data;
}
export async function fetchWhatsAppStatus() {
    const { data } = await axios.get(`${API_BASE_URL}/whatsapp/status`);
    return data.connected;
}
export async function deleteWhatsAppFile(id) {
    await axios.delete(`${API_BASE_URL}/files/${id}`);
}
