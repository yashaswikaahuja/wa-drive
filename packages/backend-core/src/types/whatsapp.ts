export type { Customer, WhatsAppFile } from './index.js';

export interface ConnectionStatus {
  connected: boolean;
  qrCode?: string;
}
